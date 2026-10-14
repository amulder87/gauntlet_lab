namespace Gauntlet {
  export const ROLES = ["Health", "Melee", "Ranged", "Magic", "Defense"] as const;
  export type Role = typeof ROLES[number];

  export interface RoleStats {
    tier: number;
    gather_time: number;
    gather_success: number;
    double_gather: number;
    process_time: number;
    process_success: number;
  }

  export interface PlayerProfile {
    name: string;
    movement_speed: number;
    backpack_size: number;
    role_stats: Record<Role, RoleStats>;
  }

  export interface GameConfig {
    fortress_node_distance: number;
    gather_process_distance: number;
    prep_seconds: number;
    wave_interval: number;
    combat_interval: number;
    starting_stat: number;
    incoming_constant: number;
    outgoing_constant: number;
    lane_noise_per_wave: number;
    lane_noise_cap: number;
    use_lane_noise: boolean;
    health_base: number;
    health_growth: number;
    health_milestone_mult: number;
    health_milestone_every: number;
    attack_growth: number;
    defense_per_wave: number;
    action_xp_base: number;
    action_xp_wave_slope: number;
    failure_xp_mult: number;
    completion_xp_power: number;
    material_values: number[];
    max_wave: number;
  }

  export interface PartySlot {
    label: string;
    profile_name: string;
    is_real_player: boolean;
    manual_role: Role;
  }

  export type Objective = "XP / hour" | "XP / run" | "Mean wave cleared" | "Chance to clear target";

  export interface OptimizerConfig {
    objective: Objective;
    target_wave: number;
    pre_screen_runs: number;
    pre_screen_filter: number;
    screening_runs: number;
    finalist_runs: number;
    finalist_count: number;
    seed: number;
    require_health: boolean;
    require_force: boolean;
  }

  export interface AppSettings {
    clone_speed_multiplier: number;
    simulation_batch_size: number;
    results_top_ratio: number;
    run_presets: Record<string, {
      pre_screen_runs: number;
      screening_runs: number;
      finalist_runs: number;
      finalist_count: number;
    }>;
  }

  export interface AppState {
    profiles: Record<string, PlayerProfile>;
    party: PartySlot[];
    game: GameConfig;
    optimizer: OptimizerConfig;
    settings: AppSettings;
  }

  export interface ConfigDocument {
    config_version: number;
    defaults: AppState;
    current: AppState;
  }

  export interface DepositEvent { time: number; role: Role; amount: number; }
  export interface ActionXPEvent { time: number; success: boolean; }
  export interface RunResult {
    highest_cleared: number;
    death_time: number;
    action_xp: number;
    completion_xp: number;
    total_xp: number;
    xp_per_hour: number;
    death_reason: string;
  }

  export interface Aggregate {
    runs: number;
    sum_cleared: number;
    sum_xp_run: number;
    sum_xp_hour: number;
    sum_duration: number;
    hp_deaths: number;
    overruns: number;
    distribution: Record<number, number>;
  }

  export interface Metrics {
    mean_cleared: number;
    median_cleared: number;
    p10_cleared: number;
    p90_cleared: number;
    target_probability: number;
    mean_xp_run: number;
    mean_xp_hour: number;
    mean_duration: number;
    hp_death_rate: number;
    overrun_rate: number;
    distribution: Record<number, number>;
    runs: number;
  }

  export interface CandidateResult { roles: Role[]; metrics: Metrics; }

  export function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  export function clamp(v: number, lo: number, hi: number): number {
    return Math.min(hi, Math.max(lo, v));
  }

  export function cloneFromMe(state: AppState): void {
    const me = state.profiles["Me"];
    if (!me) return;
    const clone = deepClone(me);
    clone.name = "Clone";
    clone.movement_speed = Math.round(me.movement_speed * state.settings.clone_speed_multiplier * 10) / 10;
    state.profiles["Clone"] = clone;
  }

  export function profileSignature(profile: PlayerProfile): string {
    const vals: (string|number)[] = [round9(profile.movement_speed), profile.backpack_size];
    for (const role of ROLES) {
      const rs = profile.role_stats[role];
      vals.push(rs.tier, round9(rs.gather_time), round9(rs.gather_success), round9(rs.double_gather), round9(rs.process_time), round9(rs.process_success));
    }
    return JSON.stringify(vals);
  }

  function round9(v: number): number { return Math.round(v * 1e9) / 1e9; }


  export interface RandomSource {
    random(): number;
    uniform(a: number, b: number): number;
  }

  // Fast deterministic PRNG used by the browser simulator. This is a SplitMix32
  // stream: one 32-bit state, excellent avalanche behavior, and substantially less
  // overhead than emulating CPython's 624-word Mersenne Twister. Every Monte Carlo
  // run gets independently mixed worker/lane seeds, so the 2^32 per-stream period is
  // far beyond the number of draws made inside one raid.
  export class FastRandom implements RandomSource {
    private state: number;

    constructor(seed: number) { this.state = seed >>> 0; }

    uint32(): number {
      this.state = (this.state + 0x9e3779b9) >>> 0;
      let z = this.state;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    }

    random(): number { return this.uint32() / 4294967296; }
    uniform(a: number, b: number): number { return a + (b - a) * this.random(); }
  }

  function mix32(x: number): number {
    x = (x ^ (x >>> 16)) >>> 0;
    x = Math.imul(x, 0x7feb352d) >>> 0;
    x = (x ^ (x >>> 15)) >>> 0;
    x = Math.imul(x, 0x846ca68b) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
  }

  export function deriveFastWorkerSeed(seed: number, idx: number): number {
    return mix32((Math.trunc(seed) + Math.imul(idx + 1, 0x9e3779b9) + 0x85ebca6b) >>> 0);
  }

  export function deriveFastLaneSeed(seed: number): number {
    return mix32((Math.trunc(seed) ^ 0xc0ffee ^ 0x27d4eb2d) >>> 0);
  }

  export interface RngFactory {
    worker(seed: number, idx: number): RandomSource;
    lane(seed: number): RandomSource;
  }

  export const FAST_RNG_FACTORY: RngFactory = {
    worker(seed: number, idx: number): RandomSource { return new FastRandom(deriveFastWorkerSeed(seed, idx)); },
    lane(seed: number): RandomSource { return new FastRandom(deriveFastLaneSeed(seed)); },
  };
}
