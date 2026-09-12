/*
# Fix leads status constraint for HC statuses + add platform_id_done tracking

## Changes
1. Alter leads.status CHECK constraint to include HC-specific statuses (TAG_ADDED, RINGING already exists)
2. Add platform_id_done columns to track per-platform ID completion
3. These columns are nullable booleans, defaulting to false when set

## Why
- HC imports use TAG_ADDED status which was rejected by the CHECK constraint
- Platform-specific ID Done tracking requires new columns (uber_id_done, ola_id_done, rapido_id_done)
- These complement (not replace) the existing status field
*/

-- Drop old check and recreate with HC statuses
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_status_check
  CHECK (status = ANY (ARRAY['NEW','RINGING','INTERESTED','CALLBACK','ID_DONE','ID_BLOCK','DOC_ISSUE','VEHICLE_ISSUE','OTHER_ISSUE','OTHER_HERO','ADMIN_REVIEW','TAG_ADDED']));

-- Add platform-specific ID Done tracking columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS uber_id_done boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ola_id_done boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rapido_id_done boolean NOT NULL DEFAULT false;
