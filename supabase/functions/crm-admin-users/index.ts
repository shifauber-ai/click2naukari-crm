// Edge function for admin user management.
// Admin creates/deactivates/resets employee (and admin) accounts.
// Uses the service-role key (server-side only) so it can call auth.admin.
// The browser never sees the service-role key.

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ActionRequest {
  action: "create" | "update" | "reset_password" | "set_active";
  email?: string;
  password?: string;
  full_name?: string;
  role?: "ADMIN" | "EMPLOYEE";
  user_id?: string;
  is_active?: boolean;
  phone?: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return json({ error: "Server not configured" }, 500);
  }

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anonKey) {
    return json({ error: "Server not configured" }, 500);
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    // Verify the caller's session and role using the anon-key client.
    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: callerData, error: callerErr } =
      await callerClient.auth.getUser();
    if (callerErr || !callerData.user) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = callerData.user.id;
    const { data: callerProfile } = await callerClient
      .from("profiles")
      .select("role, is_active")
      .eq("id", callerId)
      .maybeSingle();
    if (!callerProfile || callerProfile.role !== "ADMIN" || !callerProfile.is_active) {
      return json({ error: "Admin only" }, 403);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body: ActionRequest = await req.json();
    const action = body.action;

    if (action === "create") {
      if (!body.email || !body.password || !body.full_name) {
        return json({ error: "Missing required fields" }, 400);
      }
      const role = body.role === "ADMIN" ? "ADMIN" : "EMPLOYEE";
      const { data, error } = await adminClient.auth.admin.createUser({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name, role },
      });
      if (error) {
        return json({ error: error.message }, 400);
      }
      await adminClient.rpc("bootstrap_profile", {
        p_user_id: data.user.id,
        p_email: body.email,
        p_full_name: body.full_name,
        p_role: role,
      });
      if (body.phone) {
        await adminClient
          .from("profiles")
          .update({ phone: body.phone })
          .eq("id", data.user.id);
      }
      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        action: "EMPLOYEE_CREATE",
        entity: "profile",
        entity_id: data.user.id,
        metadata: { email: body.email, role, full_name: body.full_name },
      });
      return json({ user_id: data.user.id, email: body.email });
    }

    if (action === "update") {
      if (!body.user_id) return json({ error: "user_id required" }, 400);
      const updates: Record<string, unknown> = {};
      if (body.full_name !== undefined) updates.full_name = body.full_name;
      if (body.phone !== undefined) updates.phone = body.phone;
      if (body.role !== undefined) updates.role = body.role;
      if (Object.keys(updates).length === 0) {
        return json({ error: "Nothing to update" }, 400);
      }
      const { error } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", body.user_id);
      if (error) return json({ error: error.message }, 400);
      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        action: "EMPLOYEE_UPDATE",
        entity: "profile",
        entity_id: body.user_id,
        metadata: updates,
      });
      return json({ ok: true });
    }

    if (action === "set_active") {
      if (!body.user_id || body.is_active === undefined) {
        return json({ error: "user_id and is_active required" }, 400);
      }
      const { error } = await adminClient
        .from("profiles")
        .update({ is_active: body.is_active })
        .eq("id", body.user_id);
      if (error) return json({ error: error.message }, 400);
      // Deactivate caller-queue membership too so they get skipped.
      await adminClient
        .from("caller_queues")
        .update({ is_active: body.is_active })
        .eq("employee_id", body.user_id);
      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        action: body.is_active ? "EMPLOYEE_ACTIVATE" : "EMPLOYEE_DEACTIVATE",
        entity: "profile",
        entity_id: body.user_id,
        metadata: { is_active: body.is_active },
      });
      return json({ ok: true });
    }

    if (action === "reset_password") {
      if (!body.user_id || !body.password) {
        return json({ error: "user_id and password required" }, 400);
      }
      const { error } = await adminClient.auth.admin.updateUserById(
        body.user_id,
        { password: body.password }
      );
      if (error) return json({ error: error.message }, 400);
      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        action: "PASSWORD_RESET",
        entity: "profile",
        entity_id: body.user_id,
        metadata: {},
      });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return json({ error: message }, 500);
  }
});
