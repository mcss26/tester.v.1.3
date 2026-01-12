import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !serviceKey || !anonKey) {
    return jsonResponse({ error: "Missing Supabase env vars" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const { data: callerProfile } = await userClient
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if ((callerProfile?.role || "").toLowerCase() !== "admin") {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const {
    email,
    password,
    full_name,
    area_id,
    role,
    staff_salary,
    is_active,
  } = await req.json();

  if (!email || !password || !full_name) {
    return jsonResponse({ error: "Missing required fields" }, 400);
  }

  if ((role || "").toLowerCase() !== "staff barra") {
    return jsonResponse({ error: "Invalid role" }, 400);
  }

  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: createdUser, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

  if (createError || !createdUser?.user) {
    return jsonResponse({ error: createError?.message || "Create failed" }, 400);
  }

  const { error: profileError } = await adminClient.from("profiles").upsert({
    id: createdUser.user.id,
    full_name,
    email,
    role,
    area_id: area_id || null,
    staff_salary: Number.isFinite(staff_salary) ? staff_salary : 0,
    is_active: is_active !== false,
  });

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 400);
  }

  return jsonResponse({ id: createdUser.user.id });
});
