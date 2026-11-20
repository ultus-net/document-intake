import { IntakeError } from "@document-intake/core";

export interface Correction {
  field: string;
  value: string;
}

export function parseCorrections(body: unknown, allowed: string[]): Correction[] {
  if (body === null || typeof body !== "object") {
    throw new IntakeError("bad-request", "a JSON body with a corrections array is required");
  }
  const raw = (body as { corrections?: unknown }).corrections;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new IntakeError("bad-request", "corrections must be an array");
  }
  return raw.map((entry: unknown) => {
    if (entry === null || typeof entry !== "object") {
      throw new IntakeError("bad-request", "each correction needs a field and a value");
    }
    const { field, value } = entry as { field?: unknown; value?: unknown };
    if (typeof field !== "string" || typeof value !== "string" || value.trim() === "") {
      throw new IntakeError("bad-request", "each correction needs a field and a non-empty value");
    }
    if (!allowed.includes(field)) {
      throw new IntakeError("bad-request", `unknown field: ${field}`);
    }
    return { field, value };
  });
}
