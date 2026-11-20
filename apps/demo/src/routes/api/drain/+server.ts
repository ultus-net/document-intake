import type { RequestHandler } from "@sveltejs/kit";
import { getDemo, summarise } from "#lib/server/wiring.js";
import { fail } from "#lib/server/http.js";

export const POST: RequestHandler = async () => {
  try {
    const demo = await getDemo();
    const runs = await demo.drain();
    return Response.json({
      processed: runs.filter((run) => run.duplicate !== true).length,
      duplicates: runs.filter((run) => run.duplicate === true).length,
      runs: (await demo.runs()).map(summarise),
    });
  } catch (error) {
    return fail(error);
  }
};
