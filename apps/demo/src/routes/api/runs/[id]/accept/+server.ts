import type { RequestHandler } from "@sveltejs/kit";
import { getDemo } from "#lib/server/wiring.js";
import { fail } from "#lib/server/http.js";

export const POST: RequestHandler = async ({ params, request }) => {
  try {
    const demo = await getDemo();
    const body = await request.json().catch(() => ({}));
    const run = await demo.accept(params.id ?? "", body);
    return Response.json(run);
  } catch (error) {
    return fail(error);
  }
};
