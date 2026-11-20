import type { RequestHandler } from "@sveltejs/kit";
import { getDemo } from "#lib/server/wiring.js";
import { fail } from "#lib/server/http.js";

export const POST: RequestHandler = async ({ params }) => {
  try {
    const demo = await getDemo();
    const run = await demo.reject(params.id ?? "");
    return Response.json(run);
  } catch (error) {
    return fail(error);
  }
};
