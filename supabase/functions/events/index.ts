import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getEventRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments.at(-1) !== "generate-teams" || segments.at(-3) !== "events") {
    return null;
  }

  return {
    eventId: segments.at(-2) ?? "",
    action: "generate-teams" as const,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const route = getEventRoute(new URL(req.url).pathname);
  if (!route) {
    return jsonResponse({ error: "Route not found" }, 404);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabaseAuth.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: eventRow, error: eventError } = await supabaseAdmin
      .from("events")
      .select("university_id")
      .eq("id", route.eventId)
      .maybeSingle();

    if (eventError || !eventRow?.university_id) {
      return jsonResponse({ error: "Event not found" }, 404);
    }

    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role, university_id")
      .eq("user_id", user.id);

    const canManageEvent = (roles ?? []).some((entry) => {
      if (entry.role === "super_admin") return true;
      return entry.role === "admin" && entry.university_id === eventRow.university_id;
    });

    if (!canManageEvent) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const body = await req.json();
    const eventSportId = typeof body?.eventSportId === "string" ? body.eventSportId : "";
    const teamSize = Number.isInteger(body?.teamSize) ? body.teamSize : Number(body?.teamSize);
    const replaceExisting = body?.replaceExisting !== false;

    if (!route.eventId || !eventSportId) {
      return jsonResponse({ error: "eventId and eventSportId are required" }, 400);
    }

    if (!Number.isFinite(teamSize) || teamSize < 1) {
      return jsonResponse({ error: "teamSize must be a positive integer" }, 400);
    }

    const { data, error } = await supabaseAdmin.rpc("generate_test_teams_for_event", {
      _event_id: route.eventId,
      _event_sport_id: eventSportId,
      _team_size: Math.trunc(teamSize),
      _max_teams: 8,
      _replace_existing: replaceExisting,
      _created_by: user.id,
    });

    if (error) {
      const status = error.message.includes("Teams already exist") ? 409 : 400;
      return jsonResponse({ error: error.message }, status);
    }

    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return jsonResponse({ error: message }, 500);
  }
});
