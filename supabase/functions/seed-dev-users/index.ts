import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEV_USERS = [
  { email: "superadmin@athletix.dev", password: "SuperAdmin@123", fullName: "Super Admin", role: "super_admin" },
  { email: "admin@athletix.dev", password: "Admin@123", fullName: "Admin User", role: "admin" },
  { email: "faculty@athletix.dev", password: "Faculty@123", fullName: "Faculty Coordinator", role: "faculty" },
  { email: "coordinator@athletix.dev", password: "Coordinator@123", fullName: "Student Coordinator", role: "student_coordinator" },
  { email: "student@athletix.dev", password: "Student@123", fullName: "Student User", role: "student" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const results: { email: string; status: string }[] = [];
    const demoDomain = "athletix.dev";

    const { data: existingUniversity } = await supabaseAdmin
      .from("universities")
      .select("id")
      .eq("domain", demoDomain)
      .maybeSingle();

    let universityId = existingUniversity?.id;

    if (!universityId) {
      const { data: createdUniversity, error: universityError } = await supabaseAdmin
        .from("universities")
        .insert({
          name: "Athlitix Demo University",
          short_name: "ATH",
          domain: demoDomain,
        })
        .select("id")
        .single();

      if (universityError) {
        throw universityError;
      }

      universityId = createdUniversity.id;
    }

    for (const user of DEV_USERS) {
      // Check if user already exists by listing users
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existing = existingUsers?.users?.find((u) => u.email === user.email);

      let userId: string;

      if (existing) {
        userId = existing.id;
        // Update password to ensure it matches
        await supabaseAdmin.auth.admin.updateUserById(userId, { password: user.password });
        results.push({ email: user.email, status: "already exists, password updated, ensuring role" });
      } else {
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email: user.email,
          password: user.password,
          email_confirm: true,
          user_metadata: { full_name: user.fullName },
        });

        if (createError) {
          results.push({ email: user.email, status: `error: ${createError.message}` });
          continue;
        }
        userId = newUser.user.id;
        results.push({ email: user.email, status: "created" });
      }

      // Ensure profile exists
      await supabaseAdmin.from("profiles").upsert({
        id: userId,
        email: user.email,
        full_name: user.fullName,
        university_id: user.role === "super_admin" ? null : universityId,
      }, { onConflict: "id" });

      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .neq("role", "super_admin");

      await supabaseAdmin.from("user_roles").upsert({
        user_id: userId,
        role: user.role,
        university_id: user.role === "super_admin" ? null : universityId,
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
