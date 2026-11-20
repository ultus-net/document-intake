import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getDemo } from "#lib/server/wiring.js";

export const load: PageServerLoad = async ({ params }) => {
  const demo = await getDemo();
  const run = await demo.run(params.id);
  if (run === undefined) error(404, "no such run");
  const events = (await demo.deps.log.read()).filter((event) => event.runId === run.id);
  return { run, events };
};
