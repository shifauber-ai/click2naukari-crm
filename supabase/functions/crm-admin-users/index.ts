// Edge function for admin user management.
// Admin creates/deactivates/resets employee (and admin) accounts.
// Uses the service-role key (server-side only) so it can call auth.admin.
// The browser never sees the service-role key.
// redeploy trigger: fix apikey header in caller

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ActionRequest {
  action: "create" | "update" | "reset_password" | "set_active" | "delete";
  email?: string;
  password?: string;
  full_name?: string;
  role?: "ADMIN" | "MANAGER" | "EMPLOYEE";
  product_ids?: string[];
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
      const validRoles = ["ADMIN", "MANAGER", "EMPLOYEE"];
      const role = validRoles.includes(body.role || "") ? (body.role as string) : "EMPLOYEE";
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
      // Assign products if manager
      if (role === "MANAGER" && body.product_ids && body.product_ids.length > 0) {
        const inserts = body.product_ids.map((pid) => ({
          manager_id: data.user.id,
          product_id: pid,
        }));
        await adminClient.from("manager_product_assignments").insert(inserts);
      }
      // Also deactivate caller queue entries when deactivating
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

      // Safety: never allow updating the caller's own account
      if (body.user_id === callerId) {
        return json({ error: "You cannot edit your own account from here" }, 400);
      }

      // If email is changing, update the auth user's email first
      if (body.email !== undefined && body.email !== "") {
        // Fetch current profile to compare email
        const { data: currentProfile } = await adminClient
          .from("profiles")
          .select("email")
          .eq("id", body.user_id)
          .maybeSingle();
        if (currentProfile && currentProfile.email !== body.email) {
          const { error: authEmailErr } = await adminClient.auth.admin.updateUserById(
            body.user_id,
            { email: body.email, email_confirm: true }
          );
          if (authEmailErr) {
            return json({ error: `Failed to update auth email: ${authEmailErr.message}` }, 400);
          }
        }
      }

      const updates: Record<string, unknown> = {};
      if (body.full_name !== undefined) updates.full_name = body.full_name;
      if (body.phone !== undefined) updates.phone = body.phone;
      if (body.role !== undefined) updates.role = body.role;
      if (body.email !== undefined && body.email !== "") updates.email = body.email;
      if (Object.keys(updates).length === 0) {
        return json({ error: "Nothing to update" }, 400);
      }
      const { error } = await adminClient
        .from("profiles")
        .update(updates)
        .eq("id", body.user_id);
      if (error) return json({ error: error.message }, 400);
      // Sync manager product assignments
      if (body.role === "MANAGER" && body.product_ids !== undefined) {
        await adminClient
          .from("manager_product_assignments")
          .delete()
          .eq("manager_id", body.user_id);
        if (body.product_ids.length > 0) {
          const inserts = body.product_ids.map((pid) => ({
            manager_id: body.user_id,
            product_id: pid,
          }));
          await adminClient.from("manager_product_assignments").insert(inserts);
        }
      }
      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        action: "EMPLOYEE_UPDATE",
        entity: "profile",
        entity_id: body.user_id,
        metadata: updates,
      });
      // Return the updated profile so caller can verify
      const { data: updated } = await adminClient
        .from("profiles")
        .select("*")
        .eq("id", body.user_id)
        .maybeSingle();
      return json({ ok: true, profile: updated });
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
      // Also deactivate employee_product_cities assignments
      await adminClient
        .from("employee_product_cities")
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
      if (body.password.length < 6) {
        return json({ error: "Password must be at least 6 characters" }, 400);
      }

      // Verify the target user exists in Supabase Auth before updating
      const { data: targetUser, error: lookupErr } =
        await adminClient.auth.admin.getUserById(body.user_id);
      if (lookupErr || !targetUser.user) {
        return json(
          { error: `Target user not found in Auth: ${lookupErr?.message || "no user returned"}` },
          404
        );
      }

      const { error: updateErr } = await adminClient.auth.admin.updateUserById(
        body.user_id,
        { password: body.password }
      );
      if (updateErr) {
        return json({ error: updateErr.message }, 400);
      }

      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        action: "PASSWORD_RESET",
        entity: "profile",
        entity_id: body.user_id,
        metadata: {},
      });
      return json({ success: true, message: "Password updated successfully" });
    }

    if (action === "delete") {
      if (!body.user_id) return json({ error: "user_id required" }, 400);

      // Safety: cannot delete yourself
      if (body.user_id === callerId) {
        return json({ error: "You cannot delete your own account" }, 400);
      }

      // Safety: cannot delete another admin
      const { data: targetProfile } = await adminClient
        .from("profiles")
        .select("role, email, full_name")
        .eq("id", body.user_id)
        .maybeSingle();
      if (!targetProfile) {
        return json({ error: "Employee not found" }, 404);
      }
      if (targetProfile.role === "ADMIN") {
        return json({ error: "Cannot delete an admin account" }, 400);
      }

      // Write audit log BEFORE deletion (actor_id will be SET NULL after,
      // but we store the actor identity in metadata for traceability).
      await adminClient.from("audit_logs").insert({
        actor_id: callerId,
        action: "EMPLOYEE_DELETE",
        entity: "profile",
        entity_id: body.user_id,
        metadata: { permanent_delete: true, deleted_email: targetProfile.email, deleted_name: targetProfile.full_name },
      });

      // 1. Delete the Supabase Auth user FIRST.
      //    If this fails, the profile row still exists and the employee
      //    can still log in — no partial state.
      const { error: authErr } = await adminClient.auth.admin.deleteUser(
        body.user_id
      );
      if (authErr) {
        // If the auth user doesn't exist, continue — the profile may be orphaned.
        // "User not found" is not a fatal error here.
        const msg = authErr.message || "";
        if (!msg.toLowerCase().includes("not found") && !msg.toLowerCase().includes("does not exist")) {
          return json({ error: `Failed to delete auth user: ${msg}` }, 400);
        }
      }

      // 2. Clean up employee-owned records that use SET NULL or NO ACTION.
      //    These won't cascade, so we delete them explicitly to remove
      //    employee-specific data. Company-owned data (leads) is preserved —
      //    only the employee reference is set to NULL by the FK.

      // Employee-owned call history
      await adminClient.from("call_history").delete().eq("caller_id", body.user_id);

      // Employee-owned issues
      await adminClient.from("issues").delete().eq("employee_id", body.user_id);

      // Employee-owned payment records
      await adminClient.from("payment_records").delete().eq("employee_id", body.user_id);

      // Employee-owned other_hero_leads
      await adminClient.from("other_hero_leads").delete().eq("employee_id", body.user_id);

      // Lead assignments created by this employee (actor)
      await adminClient.from("lead_assignments").delete().eq("actor_id", body.user_id);

      // Lead status history created by this employee
      await adminClient.from("lead_status_history").delete().eq("actor_id", body.user_id);
      await adminClient.from("lead_status_history").delete().eq("employee_id", body.user_id);

      // Lead platform status completed by this employee
      await adminClient.from("lead_platform_status").delete().eq("completed_by", body.user_id);

      // 3. Delete the profile row.
      //    CASCADE automatically removes: caller_devices, caller_queues,
      //    employee_product_cities, employee_targets (employee_id),
      //    manager_product_assignments, notifications, whatsapp_accounts.
      //    SET NULL automatically detaches: leads.current_caller_id,
      //    leads.created_by, audit_logs.actor_id, hero_ids.employee_id,
      //    directory_entries.employee_id, sims.employee_id, etc.
      const { error: profileErr } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", body.user_id);
      if (profileErr) return json({ error: `Failed to delete profile: ${profileErr.message}` }, 400);

      return json({ ok: true, message: "Employee permanently deleted" });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return json({ error: message }, 500);
  }
});
