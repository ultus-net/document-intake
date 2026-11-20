import { IntakeError } from "@document-intake/core";

export function fail(error: unknown): Response {
  if (error instanceof IntakeError) {
    const status =
      error.code === "not-found" ? 404 : error.code === "not-acceptable" ? 409 : 400;
    return Response.json({ error: error.code, message: error.message }, { status });
  }
  console.error(error);
  return Response.json({ error: "internal", message: "unexpected failure" }, { status: 500 });
}
