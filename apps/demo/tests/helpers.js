import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export async function startDemo(port) {
  const stateDir = await mkdtemp(join(tmpdir(), "document-intake-"));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["apps/demo/build/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      INTAKE_STATE_DIR: stateDir,
      INTAKE_FIXTURES: join(repoRoot, "fixtures/documents"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`demo exited early: ${stderr}`);
    try {
      const response = await fetch(`${base}/api/runs`);
      if (response.ok) break;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) throw new Error(`demo did not start: ${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return {
    base,
    stateDir,
    get: async (path) => (await fetch(`${base}${path}`)).text(),
    json: async (path) => (await fetch(`${base}${path}`)).json(),
    post: (path, body = {}) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: base },
        body: JSON.stringify(body),
      }),
    async recordCount() {
      const text = await readFile(join(stateDir, "records.jsonl"), "utf8").catch(() => "");
      return text.split("\n").filter((line) => line.trim() !== "").length;
    },
    async stop() {
      if (child.exitCode === null) {
        child.kill("SIGTERM");
        await new Promise((resolve) => child.once("exit", resolve));
      }
      await rm(stateDir, { recursive: true, force: true });
    },
  };
}

export function outcomesOf(runs) {
  return Object.fromEntries(
    runs.filter((run) => !run.duplicate).map((run) => [run.document, run.outcome]),
  );
}
