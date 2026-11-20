import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { PostedRecord, SystemOfRecord } from "@document-intake/core";

export class JsonlRecord implements SystemOfRecord {
  private constructor(private readonly file: string, private readonly rows: PostedRecord[]) {}

  static async open(file: string, fresh = false): Promise<JsonlRecord> {
    await mkdir(dirname(file), { recursive: true });
    if (fresh) await writeFile(file, "");
    const text = await readFile(file, "utf8").catch(() => "");
    const rows = text
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as PostedRecord);
    return new JsonlRecord(file, rows);
  }

  async find(key: string): Promise<PostedRecord | undefined> {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      const row = this.rows[index];
      if (row !== undefined && row.idempotencyKey === key) return row;
    }
    return undefined;
  }

  async append(record: PostedRecord): Promise<void> {
    this.rows.push(record);
    await appendFile(this.file, `${JSON.stringify(record)}\n`);
  }

  async list(): Promise<PostedRecord[]> {
    return [...this.rows];
  }
}
