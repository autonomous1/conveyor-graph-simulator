export const GROUP_ORDER = ["admit", "sim", "publish", "observe", "hash", "advance"] as const;
export type GroupName = (typeof GROUP_ORDER)[number];

export type GroupFn = () => void | Promise<void>;

/**
 * Ordered group runner. Missing groups are no-ops.
 * M0: no graphs, no whenIdle, no timers. Hash/advance stay caller-owned.
 */
export class PhaseDriver {
  private readonly groups: Partial<Record<GroupName, GroupFn>>;

  constructor(groups: Partial<Record<GroupName, GroupFn>> = {}) {
    this.groups = groups;
  }

  async runTick(): Promise<void> {
    for (const name of GROUP_ORDER) {
      const fn = this.groups[name];
      if (fn) await fn();
    }
  }
}
