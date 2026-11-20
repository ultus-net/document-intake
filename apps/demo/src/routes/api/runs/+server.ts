import type { RequestHandler } from "@sveltejs/kit";
import { getDemo, summarise } from "#lib/server/wiring.js";
import { fail } from "#lib/server/http.js";

export const GET: RequestHandler = async () => {
  try {
    const demo = await getDemo();
    return Response.json((await demo.runs()).map(summarise));
  } catch (error) {
    return fail(error);
  }
};
