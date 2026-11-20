import type { Actions, PageServerLoad } from "./$types";
import { getDemo, summarise } from "#lib/server/wiring.js";

export const load: PageServerLoad = async () => {
  const demo = await getDemo();
  const summaries = (await demo.runs()).map(summarise);
  const visible = summaries.filter((run) => !run.duplicate);
  const count = (outcome: string) => visible.filter((run) => run.outcome === outcome).length;
  return {
    runs: visible,
    duplicates: summaries.length - visible.length,
    recordCount: await demo.recordCount(),
    counts: { auto: count("auto"), review: count("review"), reject: count("reject") },
    version: demo.version,
  };
};

export const actions: Actions = {
  drain: async () => {
    const demo = await getDemo();
    const runs = await demo.drain();
    return {
      processed: runs.filter((run) => run.duplicate !== true).length,
      duplicates: runs.filter((run) => run.duplicate === true).length,
    };
  },
};
