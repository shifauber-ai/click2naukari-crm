/*
# Add call_history_stats RPC for efficient summary computation

1. New Functions
- `call_history_stats(p_from timestamptz, p_to timestamptz, p_caller_id uuid, p_product_id uuid, p_direction text, p_call_status text, p_search text)`
  Returns a single JSON row with: total, incoming, outgoing, answered, missed, rejected, declined, no_answer, total_duration_seconds
  All computed in ONE query pass instead of 7+ separate count queries from the client.

2. Security
- SECURITY DEFINER so it can read call_history regardless of which role calls it,
  but it only returns aggregate counts — no individual row data.
- The function respects the same filter parameters as the UI query.
- No RLS changes needed — this is a read-only aggregate function.

3. Notes
- When p_caller_id is NULL, no caller filter is applied.
- When p_product_id is NULL, no product filter is applied.
- When p_direction is 'all' or NULL, no direction filter.
- When p_call_status is 'all' or NULL, no status filter.
  Special case: 'MISSED' matches both MISSED and NO_ANSWER (same as UI behavior).
- When p_search is NULL or empty, no search filter.
  Search matches phone_number or external_call_id via ilike.
  Lead name search is handled client-side (existing approach preserved).
*/

CREATE OR REPLACE FUNCTION public.call_history_stats(
  p_from timestamptz,
  p_to timestamptz,
  p_caller_id uuid DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_call_status text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT json_build_object(
    'total', COUNT(*),
    'incoming', COUNT(*) FILTER (WHERE direction = 'INCOMING'),
    'outgoing', COUNT(*) FILTER (WHERE direction = 'OUTGOING'),
    'answered', COUNT(*) FILTER (WHERE call_status = 'ANSWERED'),
    'missed', COUNT(*) FILTER (WHERE call_status IN ('MISSED', 'NO_ANSWER')),
    'rejected', COUNT(*) FILTER (WHERE call_status = 'REJECTED'),
    'declined', COUNT(*) FILTER (WHERE call_status = 'DECLINED'),
    'no_answer', COUNT(*) FILTER (WHERE call_status = 'NO_ANSWER'),
    'total_duration_seconds', COALESCE(SUM(duration_seconds), 0)
  )
  FROM public.call_history
  WHERE call_timestamp >= p_from
    AND call_timestamp <= p_to
    AND (p_caller_id IS NULL OR caller_id = p_caller_id)
    AND (p_product_id IS NULL OR product_id = p_product_id)
    AND (p_direction IS NULL OR p_direction = 'all' OR direction = p_direction)
    AND (
      p_call_status IS NULL OR p_call_status = 'all' OR
      (p_call_status = 'MISSED' AND call_status IN ('MISSED', 'NO_ANSWER')) OR
      (p_call_status <> 'MISSED' AND call_status = p_call_status)
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      phone_number ILIKE '%' || p_search || '%' OR
      external_call_id ILIKE '%' || p_search || '%'
    );
$function$;
