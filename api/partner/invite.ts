// /api/partner/invite?token=..., who sent this invite.
//   GET -> { pending: boolean, inviter: string | null }
//
// The one endpoint on this API with no session behind it, because the person
// asking has no account yet: they are holding a link and the page is about to
// ask them to create one. Gated on the token instead. The reasoning, and the
// exact blast radius of that choice, is in api/_invite-lookup.ts; do not widen
// the fields returned here without reading it.
//
// Answers 200 either way rather than 404 for an unknown token. The client uses
// this to decide whether it can NAME the person who invited them, and a 404 is
// indistinguishable from a network failure at the call site, which would make a
// perfectly valid invite render as a broken one.
import { lookupInvite } from "../_invite-lookup";

export const config = { runtime: "edge" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405, headers: cors });

  const token = new URL(req.url).searchParams.get("token") || "";
  const found = await lookupInvite(token);

  return new Response(JSON.stringify(found), {
    headers: {
      "Content-Type": "application/json",
      // Cacheable at the edge because the answer only changes when the invite is
      // accepted, and short because when it does change the page reading it
      // should stop naming a person who is now a partner. Private to the token,
      // which is already the whole cache key.
      "Cache-Control": "public, max-age=0, s-maxage=120",
      ...cors,
    },
  });
}
