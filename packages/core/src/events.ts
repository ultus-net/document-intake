import type { Clock, Event, EventInput } from "./types.js";

export interface EventLog {
  append(input: EventInput): Promise<Event>;
  read(): Promise<Event[]>;
}

export class MemoryEventLog implements EventLog {
  readonly entries: Event[] = [];
  constructor(private readonly clock: Clock) {}

  async append(input: EventInput): Promise<Event> {
    const event: Event = { seq: this.entries.length, ts: this.clock.now().toISOString(), ...input };
    this.entries.push(event);
    return event;
  }

  async read(): Promise<Event[]> {
    return [...this.entries];
  }
}
