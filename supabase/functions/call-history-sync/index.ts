// Edge Function: call-history-sync
// Receives real Android call-log records from an authenticated employee's device.
// Inserts them into call_history via the SECURITY DEFINER function insert_synced_call.
// The service-role key is used ONLY inside this function — never exposed to clients.

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ALLOWED_DIRECTIONS = new Set(["INCOMING", "OUTGOING"]);
const ALLOWED_STATUSES = new Set(["ANSWERED", "MISSED", "REJECTED", "DECLINED", "NO_ANSWER"]);
const MAX_BATCH = 100;
const MAX_PAYLOAD_BYTES = 500_000;
const MAX_EXTERNAL_CALL_ID_LEN = 256;
const MAX_DURATION = 86400; // 24 hours in seconds
const MAX_PHONE_LEN = 30;

// Map arbitrary Android call statuses to our known set.
const STATUS_MAP: Record<string, string> = {
  ANSWERED: "ANSWERED",
  ANSWER: "ANSWERED",
  ACCEPTED: "ANSWERED",
  OUTGOING: "ANSWERED",
  MISSED: "MISSED",
  MISSED_CALL: "MISSED",
  REJECTED: "REJECTED",
  REJECT: "REJECTED",
  DECLINED: "DECLINED",
  DECLINE: "DECLINED",
  NO_ANSWER: "NO_ANSWER",
  NOANSWER: "NO_ANSWER",
  BUSY: "NO_ANSWER",
  FAILED: "NO_ANSWER",
  CANCELED: "NO_ANSWER",
  CANCELLED: "NO_ANSWER",
  BLOCKED: "REJECTED",
  UNKNOWN: "NO_ANSWER",
};

interface CallRecord {
  external_call_id?: string;
  phone_number?: string;
  direction?: string;
  call_status?: string;
  duration_seconds?: number;
  call_timestamp?: string;
}

interface ValidationResult {
  ok: boolean;
  error?: string;
  record: NormalizedCall | null;
}

interface NormalizedCall {
  external_call_id: string;
  phone_number: string;
  direction: string;
  call_status: string;
  duration_seconds: number;
  call_timestamp: string;
}

interface CallResult {
  external_call_id: string;
  status: "inserted" | "duplicate" | "failed";
  call_history_id?: string;
  lead_id?: string | null;
  product_id?: string | null;
  error?: string;
}

function validateCall(rec: CallRecord): ValidationResult {
  if (!rec.external_call_id || typeof rec.external_call_id !== "string" || rec.external_call_id.trim().length === 0) {
    return { ok: false, error: "external_call_id is required", record: null };
  }
  if (rec.external_call_id.length > MAX_EXTERNAL_CALL_ID_LEN) {
    return { ok: false, error: "external_call_id too long", record: null };
  }

  if (!rec.phone_number || typeof rec.phone_number !== "string" || rec.phone_number.trim().length === 0) {
    return { ok: false, error: "phone_number is required", record: null };
  }
  if (rec.phone_number.length > MAX_PHONE_LEN) {
    return { ok: false, error: "phone_number too long", record: null };
  }

  const direction = (rec.direction || "").toUpperCase().trim();
  if (!ALLOWED_DIRECTIONS.has(direction)) {
    return { ok: false, error: `direction must be INCOMING or OUTGOING`, record: null };
  }

  const rawStatus = (rec.call_status || "").toUpperCase().trim();
  const callStatus = STATUS_MAP[rawStatus] || (ALLOWED_STATUSES.has(rawStatus) ? rawStatus : null);
  if (!callStatus) {
    return { ok: false, error: `call_status is not a recognized value`, record: null };
  }

  const duration = Number(rec.duration_seconds);
  if (!Number.isInteger(duration) || duration < 0 || duration > MAX_DURATION) {
    return { ok: false, error: "duration_seconds must be a non-negative integer", record: null };
  }

  const tsStr = rec.call_timestamp;
  if (!tsStr || typeof tsStr !== "string") {
    return { ok: false, error: "call_timestamp is required", record: null };
  }
  const parsed = new Date(tsStr);
  if (isNaN(parsed.getTime())) {
    return { ok: false, error: "call_timestamp is not a valid ISO timestamp", record: null };
  }
  const now = new Date();
  const maxPast = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
  const maxFuture = new Date(now.getTime() + 5 * 60 * 1000); // 5 min tolerance
  if (parsed < maxPast || parsed > maxFuture) {
    return { ok: false, error: "call_timestamp is out of acceptable range", record: null };
  }

  return {
    ok: true,
    record: {
      external_call_id: rec.external_call_id.trim(),
      phone_number: rec.phone_number.trim(),
      direction,
      call_status: callStatus,
      duration_seconds: duration,
      call_timestamp: parsed.toISOString(),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: "Server not configured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) {
    return json({ error: "Missing authorization token" }, 401);
  }

  // Verify the caller's session using the anon-key client
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData.user) {
    return json({ error: "Invalid or expired token" }, 401);
  }
  const employeeId = callerData.user.id;

  // Verify employee exists and is active
  const { data: profile, error: profileErr } = await callerClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", employeeId)
    .maybeSingle();
  if (profileErr || !profile) {
    return json({ error: "Employee profile not found" }, 403);
  }
  if (!profile.is_active) {
    return json({ error: "Employee account is inactive" }, 403);
  }

  // Parse request body
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const deviceIdentifier = body.device_identifier;
  if (!deviceIdentifier || typeof deviceIdentifier !== "string" || deviceIdentifier.trim().length === 0) {
    return json({ error: "device_identifier is required" }, 400);
  }

  // Service-role client for privileged operations
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Verify device belongs to this employee and is active
  const { data: device, error: deviceErr } = await adminClient
    .from("caller_devices")
    .select("id, employee_id, is_active")
    .eq("device_identifier", deviceIdentifier.trim())
    .maybeSingle();
  if (deviceErr || !device) {
    return json({ error: "Device not registered" }, 403);
  }
  if (device.employee_id !== employeeId) {
    console.log(`[call-sync] device mismatch: employee=${employeeId} device_owner=${device.employee_id}`);
    return json({ error: "Device does not belong to this employee" }, 403);
  }
  if (!device.is_active) {
    return json({ error: "Device is inactive" }, 403);
  }

  // Collect call records (single or batch)
  let calls: CallRecord[];
  if (Array.isArray(body.calls)) {
    calls = body.calls as CallRecord[];
  } else {
    // Single call — promote top-level fields
    calls = [{
      external_call_id: body.external_call_id as string | undefined,
      phone_number: body.phone_number as string | undefined,
      direction: body.direction as string | undefined,
      call_status: body.call_status as string | undefined,
      duration_seconds: body.duration_seconds as number | undefined,
      call_timestamp: body.call_timestamp as string | undefined,
    }];
  }

  if (calls.length === 0) {
    return json({ error: "No call records provided" }, 400);
  }
  if (calls.length > MAX_BATCH) {
    return json({ error: `Batch too large: maximum ${MAX_BATCH} calls per request` }, 400);
  }

  const deviceIdForCall = device.id;
  const results: CallResult[] = [];
  let inserted = 0;
  let duplicates = 0;
  let failed = 0;
  let anySuccess = false;

  for (const rawCall of calls) {
    const validation = validateCall(rawCall);
    if (!validation.ok || !validation.record) {
      failed++;
      results.push({
        external_call_id: (rawCall && rawCall.external_call_id) ? rawCall.external_call_id : "unknown",
        status: "failed",
        error: validation.error || "Validation failed",
      });
      continue;
    }

    const call = validation.record;

    try {
      const { data: rpcResult, error: rpcError } = await adminClient.rpc("insert_synced_call", {
        p_caller_id: employeeId,
        p_phone_number: call.phone_number,
        p_direction: call.direction,
        p_call_status: call.call_status,
        p_duration_seconds: call.duration_seconds,
        p_call_timestamp: call.call_timestamp,
        p_outcome: null,
        p_remarks: null,
        p_external_call_id: call.external_call_id,
        p_device_id: deviceIdForCall,
        p_sync_source: "ANDROID",
      });

      if (rpcError) {
        failed++;
        results.push({
          external_call_id: call.external_call_id,
          status: "failed",
          error: "Sync failed",
        });
        console.log(`[call-sync] RPC error: employee=${employeeId} call_id=${call.external_call_id} err=${rpcError.message}`);
        continue;
      }

      const result = rpcResult as { status: string; id?: string; lead_id?: string | null; product_id?: string | null };

      if (result.status === "inserted") {
        inserted++;
        anySuccess = true;
        results.push({
          external_call_id: call.external_call_id,
          status: "inserted",
          call_history_id: result.id,
          lead_id: result.lead_id,
          product_id: result.product_id,
        });
      } else {
        duplicates++;
        anySuccess = true;
        results.push({
          external_call_id: call.external_call_id,
          status: "duplicate",
          lead_id: result.lead_id,
          product_id: result.product_id,
        });
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : "Unexpected error";
      results.push({
        external_call_id: call.external_call_id,
        status: "failed",
        error: "Sync failed",
      });
      console.log(`[call-sync] exception: employee=${employeeId} call_id=${call.external_call_id} err=${msg}`);
    }
  }

  // Update last_sync_at if at least one call was successfully processed
  if (anySuccess) {
    try {
      await adminClient
        .from("caller_devices")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", device.id);
    } catch {
      // Non-critical — don't fail the response
    }
  }

  console.log(`[call-sync] employee=${employeeId} device=${device.id} inserted=${inserted} duplicates=${duplicates} failed=${failed}`);

  return json({
    success: true,
    inserted,
    duplicates,
    failed,
    results,
  }, 200);
});
