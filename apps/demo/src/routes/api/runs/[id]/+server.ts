import type { RequestHandler } from "@sveltejs/kit";
import { getDemo } from "#lib/server/wiring.js";
import { fail } from "#lib/server/http.js";

export const GET: RequestHandler = async ({ params }) => {
  try {
    const demo = await getDemo();
    const run = await demo.run(params.id ?? "");
    if (run === undefined) {
      return Response.json({ error: "not-found", message: "no such run" }, { status: 404 });
    }
    return Response.json(run);
  } catch (error) {
    return fail(error);
  }
};
