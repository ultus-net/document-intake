import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Inbox, SourceDocument } from "@document-intake/core";

export function folderInbox(directory: string): Inbox {
  const root = resolve(directory);
  return {
    async list(): Promise<SourceDocument[]> {
      const names = (await readdir(root)).filter((name) => !name.startsWith(".")).sort();
      const documents: SourceDocument[] = [];
      for (const name of names) {
        const path = join(root, name);
        const info = await stat(path);
        if (!info.isFile()) continue;
        documents.push({
          messageId: name,
          filename: name,
          receivedAt: info.mtime.toISOString(),
          bytes: new Uint8Array(await readFile(path)),
        });
      }
      return documents;
    },
  };
}
