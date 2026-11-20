import { createHash } from "node:crypto";

export function idempotencyKey(input: { messageId: string; bytes: Uint8Array }): string {
  const hash = createHash("sha256");
  hash.update(String(Buffer.byteLength(input.messageId, "utf8")));
  hash.update(":");
  hash.update(input.messageId, "utf8");
  hash.update(Buffer.from(input.bytes));
  return hash.digest("hex");
}
