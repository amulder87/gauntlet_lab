/// <reference path="./core.ts" />
/// <reference path="./engine.ts" />
namespace Gauntlet {
  export function objectiveValue(metrics: Metrics, objective: Objective): number {
    if (objective === "Mean wave cleared") return metrics.mean_cleared;
    if (objective === "Chance to clear target") return metrics.target_probability;
    if (objective === "XP / run") return metrics.mean_xp_run;
    return metrics.mean_xp_hour;
  }

  function canonicalKey(roles: readonly Role[], slots: readonly PartySlot[], profiles: readonly PlayerProfile[]): string {
    const realParts: [number, Role][] = [];
    const groups = new Map<string, Role[]>();
    for (let idx = 0; idx < roles.length; idx++) {
      if (slots[idx].is_real_player) {
        realParts.push([idx, roles[idx]]);
      } else {
        const sig = profileSignature(profiles[idx]);
        const list = groups.get(sig) || [];
        list.push(roles[idx]);
        groups.set(sig, list);
      }
    }
    const groupParts = Array.from(groups.entries())
      .map(([sig, rs]) => [sig, [...rs].sort()] as [string, Role[]])
      .sort((a,b)=>a[0].localeCompare(b[0]));
    return JSON.stringify([realParts, groupParts]);
  }

  export function enumerateUniqueAssignments(state: AppState): Role[][] {
    const slots = state.party;
    const profiles = slots.map(s => state.profiles[s.profile_name]);
    const seen = new Set<string>();
    const out: Role[][] = [];
    const roles: Role[] = new Array(slots.length) as Role[];

    const rec = (idx: number): void => {
      if (idx === slots.length) {
        if (state.optimizer.require_health && !roles.includes("Health")) return;
        if (state.optimizer.require_force && !roles.some(r => r === "Melee" || r === "Ranged" || r === "Magic")) return;
        const candidate = [...roles];
        const key = canonicalKey(candidate, slots, profiles);
        if (!seen.has(key)) { seen.add(key); out.push(candidate); }
        return;
      }
      for (const role of ROLES) { roles[idx] = role; rec(idx + 1); }
    };
    rec(0);
    return out;
  }

  export function filterByRelativeObjective(results: readonly CandidateResult[], objective: Objective, fraction: number): CandidateResult[] {
    if (!results.length) return [];
    const f = clamp(fraction, 0, 1);
    const best = Math.max(...results.map(r => objectiveValue(r.metrics, objective)));
    if (best <= 0) return [...results];
    const cutoff = best * f;
    return results.filter(r => objectiveValue(r.metrics, objective) >= cutoff);
  }
}
