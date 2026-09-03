// /api/household/invite?token=..., who sent this invite and to which household.
//   GET -> { pending: boolean, household: string | null, invitedName: string | null }
//
// No session behind it, same reasoning as /api/partner/invite: the person
// asking has no account yet. See api/_household-invite-lookup.ts for the
// exact blast radius; do not widen the fields returned here without reading it.
import { lookupHouseholdInvite } from "../_household-invite-lookup";

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
  const found = await lookupHouseholdInvite(token);

  return new Response(JSON.stringify(found), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=0, s-maxage=120",
      ...cors,
    },
  });
}
