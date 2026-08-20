-- Migration: update journey_days status check constraint
-- Run this in Supabase SQL Editor if the table already exists with the old constraint
-- This allows status values: pending, completed, missed, complete, behind

ALTER TABLE public.journey_days DROP CONSTRAINT IF EXISTS journey_days_status_check;

ALTER TABLE public.journey_days ADD CONSTRAINT journey_days_status_check
  CHECK (status = ANY (ARRAY['pending','completed','missed','complete','behind']::text[]));
