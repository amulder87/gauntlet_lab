/// <reference path="./core.ts" />
namespace Gauntlet {
  const EPS = 1e-9;

  export function roundHalfUp(x: number): number { return Math.floor(x + 0.5); }

  export function enemyHealth(wave: number, cfg: GameConfig): number {
    const milestone = Math.floor(wave / Math.max(1, cfg.health_milestone_every));
    const value = cfg.health_base * wave * Math.pow(cfg.health_growth, wave) * Math.pow(cfg.health_milestone_mult, milestone);
    return roundHalfUp(value);
  }

  export function enemyAttack(wave: number, cfg: GameConfig): number {
    return roundHalfUp(wave * Math.pow(cfg.attack_growth, wave));
  }

  export function enemyDefense(wave: number, cfg: GameConfig): number {
    return roundHalfUp(cfg.defense_per_wave * wave);
  }

  export function laneAttack(wave: number, cfg: GameConfig, rng: RandomSource): [number, number, number] {
    const total = enemyAttack(wave, cfg);
    if (!cfg.use_lane_noise || cfg.lane_noise_per_wave <= 0) {
      const x = total / 3;
      return [x, x, x];
    }
    const b = Math.min(cfg.lane_noise_cap, Math.max(0, cfg.lane_noise_per_wave * wave));
    const factors = [0, 1, 2].map(() => Math.max(1e-6, 1 + rng.uniform(-b, b)));
    const s = factors[0] + factors[1] + factors[2];
    return [total * factors[0] / s, total * factors[1] / s, total * factors[2] / s];
  }

  export function currentWaveForXp(t: number, cfg: GameConfig): number {
    if (t < cfg.prep_seconds) return 1;
    return Math.max(1, Math.floor((t - cfg.prep_seconds) / cfg.wave_interval) + 1);
  }

  export function materialValue(profile: PlayerProfile, role: Role, cfg: GameConfig): number {
    const tier = Math.max(0, Math.min(cfg.material_values.length - 1, profile.role_stats[role].tier));
    return cfg.material_values[tier];
  }

  export function generateOneLoop(
    profile: PlayerProfile,
    role: Role,
    cfg: GameConfig,
    rng: RandomSource,
    startTime: number,
    captureXp: boolean,
  ): { deposit: DepositEvent; xpEvents: ActionXPEvent[] } {
    const rs = profile.role_stats[role];
    const speed = Math.max(1e-9, profile.movement_speed);
    const bagSize = Math.max(1, Math.trunc(profile.backpack_size));
    const doubleP = clamp(rs.double_gather, 0, 1);
    const gatherP = clamp(rs.gather_success, 0, 1);
    const processP = clamp(rs.process_success, 0, 1);
    const gatherTime = Math.max(1e-6, rs.gather_time);
    const processTime = Math.max(1e-6, rs.process_time);
    const xpEvents: ActionXPEvent[] = [];
    let t = startTime + cfg.fortress_node_distance / speed;

    let raw = 0;
    while (raw < bagSize) {
      t += gatherTime;
      const success = rng.random() < gatherP;
      if (captureXp) xpEvents.push({time: t, success});
      if (success) {
        raw += 1;
        if (raw < bagSize && rng.random() < doubleP) {
          raw += 1;
          if (raw > bagSize) raw = bagSize;
        }
      }
    }

    t += cfg.gather_process_distance / speed;
    let processed = 0;
    for (let i = 0; i < raw; i++) {
      t += processTime;
      const success = rng.random() < processP;
      if (captureXp) xpEvents.push({time: t, success});
      if (success) processed += 1;
    }

    t += cfg.fortress_node_distance / speed;
    return {
      deposit: {time: t, role, amount: processed * materialValue(profile, role, cfg)},
      xpEvents,
    };
  }

  interface HeapDeposit extends DepositEvent { idx: number; }
  class DepositHeap {
    private data: HeapDeposit[] = [];
    get length(): number { return this.data.length; }
    peek(): HeapDeposit | undefined { return this.data[0]; }
    push(v: HeapDeposit): void {
      let i = this.data.length;
      this.data.push(v);
      while (i > 0) {
        const p = Math.floor((i - 1) / 2);
        if (!this.less(this.data[i], this.data[p])) break;
        [this.data[i], this.data[p]] = [this.data[p], this.data[i]];
        i = p;
      }
    }
    pop(): HeapDeposit | undefined {
      if (!this.data.length) return undefined;
      const root = this.data[0];
      const last = this.data.pop()!;
      if (this.data.length) {
        this.data[0] = last;
        let i = 0;
        while (true) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < this.data.length && this.less(this.data[l], this.data[m])) m = l;
          if (r < this.data.length && this.less(this.data[r], this.data[m])) m = r;
          if (m === i) break;
          [this.data[i], this.data[m]] = [this.data[m], this.data[i]];
          i = m;
        }
      }
      return root;
    }
    private less(a: HeapDeposit, b: HeapDeposit): boolean {
      return a.time < b.time || (a.time === b.time && a.idx < b.idx);
    }
  }

  export function incomingDamage(lanes: readonly number[], stats: Record<Role, number>, cfg: GameConfig): number {
    const c = cfg.incoming_constant;
    const d = stats.Defense;
    let total = 0;
    total += lanes[0] * c / (c + d + stats.Melee);
    total += lanes[1] * c / (c + d + stats.Ranged);
    total += lanes[2] * c / (c + d + stats.Magic);
    return Math.floor(total + 1e-12);
  }

  export function outgoingDamage(stats: Record<Role, number>, eDef: number, cfg: GameConfig): number {
    const attack = stats.Melee + stats.Ranged + stats.Magic;
    const c = cfg.outgoing_constant;
    return Math.floor(attack * c / (c + eDef) + 1e-12);
  }

  export function simulateOne(
    profiles: readonly PlayerProfile[],
    roles: readonly Role[],
    realIndex: number,
    cfg: GameConfig,
    seed: number,
    rngFactory: RngFactory = FAST_RNG_FACTORY,
  ): RunResult {
    const workerRngs: RandomSource[] = profiles.map((_p, idx) => rngFactory.worker(seed, idx));
    const heap = new DepositHeap();
    const realXpEvents: ActionXPEvent[] = [];
    for (let idx = 0; idx < profiles.length; idx++) {
      const one = generateOneLoop(profiles[idx], roles[idx], cfg, workerRngs[idx], 0, idx === realIndex);
      heap.push({...one.deposit, idx});
      if (idx === realIndex) realXpEvents.push(...one.xpEvents);
    }

    const laneRng: RandomSource = rngFactory.lane(seed);
    const stats = {} as Record<Role, number>;
    for (const role of ROLES) stats[role] = cfg.starting_stat;
    let currentHp = cfg.starting_stat;
    let highestCleared = 0;

    let active = false;
    let activeHp = 0;
    const activeLanes = [0, 0, 0];
    let activeDef = 0;
    let stackCount = 0;
    let activeMaxWave = 0;
    let nextCombat = Infinity;
    let nextWave = cfg.prep_seconds;
    let nextWaveNumber = 1;
    const maxTime = cfg.prep_seconds + cfg.wave_interval * (cfg.max_wave + 3);
    let deathTime = maxTime;
    let deathReason = "max_wave";

    const applyDepositsUntil = (t: number): void => {
      while (heap.length && heap.peek()!.time <= t + EPS) {
        const ev = heap.pop()!;
        stats[ev.role] += ev.amount;
        if (ev.role === "Health") currentHp += ev.amount;
        const one = generateOneLoop(profiles[ev.idx], roles[ev.idx], cfg, workerRngs[ev.idx], ev.time, ev.idx === realIndex);
        heap.push({...one.deposit, idx: ev.idx});
        if (ev.idx === realIndex) realXpEvents.push(...one.xpEvents);
      }
    };

    while (nextWaveNumber <= cfg.max_wave + 2) {
      const nextEvent = Math.min(nextWave, nextCombat);
      applyDepositsUntil(nextEvent);

      if (nextWave <= nextCombat + EPS) {
        const t = nextWave;
        const wave = nextWaveNumber;
        if (active && activeHp > 0) {
          if (stackCount >= 2) {
            deathTime = t;
            deathReason = "overrun";
            break;
          }
          activeHp += enemyHealth(wave, cfg);
          const lanes = laneAttack(wave, cfg, laneRng);
          for (let j = 0; j < 3; j++) activeLanes[j] += lanes[j];
          activeDef = enemyDefense(wave, cfg);
          stackCount += 1;
          activeMaxWave = wave;
        } else {
          active = true;
          activeHp = enemyHealth(wave, cfg);
          const lanes = laneAttack(wave, cfg, laneRng);
          activeLanes[0] = lanes[0]; activeLanes[1] = lanes[1]; activeLanes[2] = lanes[2];
          activeDef = enemyDefense(wave, cfg);
          stackCount = 1;
          activeMaxWave = wave;
          nextCombat = t + cfg.combat_interval;
        }
        nextWaveNumber += 1;
        nextWave = cfg.prep_seconds + (nextWaveNumber - 1) * cfg.wave_interval;
        continue;
      }

      const t = nextCombat;
      if (!active) { nextCombat = Infinity; continue; }

      currentHp -= incomingDamage(activeLanes, stats, cfg);
      if (currentHp <= 0) {
        deathTime = t;
        deathReason = "hp";
        break;
      }

      activeHp -= outgoingDamage(stats, activeDef, cfg);
      if (activeHp <= 0) {
        highestCleared = Math.max(highestCleared, activeMaxWave);
        active = false;
        activeHp = 0;
        stackCount = 0;
        nextCombat = Infinity;
      } else {
        nextCombat = t + cfg.combat_interval;
      }
    }

    let actionXp = 0;
    for (const ev of realXpEvents) {
      if (ev.time > deathTime + EPS) break;
      const wave = currentWaveForXp(ev.time, cfg);
      const base = cfg.action_xp_base + cfg.action_xp_wave_slope * wave;
      actionXp += ev.success ? base : base * cfg.failure_xp_mult;
    }
    const completionXp = Math.pow(highestCleared, cfg.completion_xp_power);
    const totalXp = actionXp + completionXp;
    const xpPerHour = deathTime > 0 ? totalXp / deathTime * 3600 : 0;
    return {
      highest_cleared: highestCleared,
      death_time: deathTime,
      action_xp: actionXp,
      completion_xp: completionXp,
      total_xp: totalXp,
      xp_per_hour: xpPerHour,
      death_reason: deathReason,
    };
  }

  export function emptyAggregate(): Aggregate {
    return {runs:0, sum_cleared:0, sum_xp_run:0, sum_xp_hour:0, sum_duration:0, hp_deaths:0, overruns:0, distribution:{}};
  }

  export function addRun(agg: Aggregate, result: RunResult): void {
    agg.runs += 1;
    agg.sum_cleared += result.highest_cleared;
    agg.sum_xp_run += result.total_xp;
    agg.sum_xp_hour += result.xp_per_hour;
    agg.sum_duration += result.death_time;
    agg.hp_deaths += result.death_reason === "hp" ? 1 : 0;
    agg.overruns += result.death_reason === "overrun" ? 1 : 0;
    agg.distribution[result.highest_cleared] = (agg.distribution[result.highest_cleared] || 0) + 1;
  }

  export function mergeAggregate(dst: Aggregate, src: Aggregate): void {
    dst.runs += src.runs;
    dst.sum_cleared += src.sum_cleared;
    dst.sum_xp_run += src.sum_xp_run;
    dst.sum_xp_hour += src.sum_xp_hour;
    dst.sum_duration += src.sum_duration;
    dst.hp_deaths += src.hp_deaths;
    dst.overruns += src.overruns;
    for (const [w, count] of Object.entries(src.distribution)) {
      const wave = Number(w);
      dst.distribution[wave] = (dst.distribution[wave] || 0) + count;
    }
  }

  function pyRoundInt(x: number): number {
    const floor = Math.floor(x);
    const frac = x - floor;
    if (frac < 0.5) return floor;
    if (frac > 0.5) return floor + 1;
    return floor % 2 === 0 ? floor : floor + 1;
  }

  export function aggregateToMetrics(agg: Aggregate, targetWave: number): Metrics {
    const n = agg.runs;
    if (n <= 0) throw new Error("At least one simulation run is required");
    const waves = Object.keys(agg.distribution).map(Number).sort((a,b)=>a-b);
    const quantile = (p: number): number => {
      const target = Math.min(n - 1, Math.max(0, pyRoundInt((n - 1) * p)));
      let seen = 0;
      for (const wave of waves) {
        seen += agg.distribution[wave];
        if (seen > target) return wave;
      }
      return waves[waves.length - 1];
    };
    let targetCount = 0;
    for (const wave of waves) if (wave >= targetWave) targetCount += agg.distribution[wave];
    return {
      mean_cleared: agg.sum_cleared / n,
      median_cleared: quantile(0.5),
      p10_cleared: quantile(0.10),
      p90_cleared: quantile(0.90),
      target_probability: targetCount / n,
      mean_xp_run: agg.sum_xp_run / n,
      mean_xp_hour: agg.sum_xp_hour / n,
      mean_duration: agg.sum_duration / n,
      hp_death_rate: agg.hp_deaths / n,
      overrun_rate: agg.overruns / n,
      distribution: {...agg.distribution},
      runs: n,
    };
  }

  export function simulateChunk(
    profiles: readonly PlayerProfile[], roles: readonly Role[], realIndex: number, cfg: GameConfig,
    startIndex: number, count: number, baseSeed: number, rngFactory: RngFactory = FAST_RNG_FACTORY,
  ): Aggregate {
    const agg = emptyAggregate();
    for (let i = startIndex; i < startIndex + count; i++) {
      addRun(agg, simulateOne(profiles, roles, realIndex, cfg, baseSeed + i * 1009, rngFactory));
    }
    return agg;
  }
}
