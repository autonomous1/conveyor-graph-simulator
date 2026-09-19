import type { GraphAgent } from "conveyor-graph";
import type { MessageClass, SimPayload } from "../types.js";

export interface GeneratorOptions {
  tenant?: string;
  class?: MessageClass;
  priority?: number;
  endpoint?: string;
  service?: string;
}

export class BurstGenerator {
  private seq = 0;
  private session: GraphAgent;
  private ingress: string;
  private defaults: GeneratorOptions;

  constructor(session: GraphAgent, ingress: string, defaults: GeneratorOptions = {}) {
    this.session = session;
    this.ingress = ingress;
    this.defaults = defaults;
  }

  payload(overrides: Partial<SimPayload> = {}): SimPayload {
    const seq = this.seq++;
    return {
      seq,
      tenant: overrides.tenant ?? this.defaults.tenant ?? "alpha",
      class: overrides.class ?? this.defaults.class ?? "command",
      priority: overrides.priority ?? this.defaults.priority ?? 0,
      endpoint: overrides.endpoint ?? this.defaults.endpoint ?? "local",
      service: overrides.service ?? this.defaults.service ?? "echo",
    };
  }

  write(overrides: Partial<SimPayload> = {}): boolean {
    const p = this.payload(overrides);
    return this.session.write(this.ingress, String(p.seq), p);
  }

  async send(overrides: Partial<SimPayload> = {}): Promise<SimPayload> {
    const p = this.payload(overrides);
    await this.session.send(this.ingress, String(p.seq), p);
    return p;
  }

  writeBurst(n: number, overrides: Partial<SimPayload> = {}): boolean[] {
    const out: boolean[] = [];
    for (let i = 0; i < n; i++) out.push(this.write(overrides));
    return out;
  }
}
