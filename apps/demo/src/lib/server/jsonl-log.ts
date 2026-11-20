import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { Clock, Event, EventInput } from "@document-intake/core";

export class JsonlEventLog {
  private constructor(
    private readonly file: string,
    private readonly clock: Clock,
    private readonly entries: Event[],
  ) {}

  static async open(file: string, clock: Clock, fresh = false): Promise<JsonlEventLog> {
    await mkdir(dirname(file), { recursive: true });
    if (fresh) await writeFile(file, "");
    const text = await readFile(file, "utf8").catch(() => "");
    const entries = text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Event);
    return new JsonlEventLog(file, clock, entries);
  }

  async append(input: EventInput): Promise<Event> {
    const event: Event = {
      seq: this.entries.length,
      ts: this.clock.now().toISOString(),
      ...input,
    };
    this.entries.push(event);
    await appendFile(this.file, `${JSON.stringify(event)}\n`);
    return event;
  }

  async read(): Promise<Event[]> {
    return [...this.entries];
  }
}
