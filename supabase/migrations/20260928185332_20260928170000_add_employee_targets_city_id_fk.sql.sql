/*
# Add missing FK from employee_targets.city_id to product_cities.id

The employee_targets table has a city_id column but no foreign key constraint
to product_cities. This prevents PostgREST from resolving the join
`city:product_cities!city_id(...)` used in the Employee My Targets page
and the Admin Reports Target Progress section.

Without this FK, both pages return zero targets (the join error causes
the entire query to fail silently).
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'employee_targets' AND constraint_name = 'employee_targets_city_id_fkey'
  ) THEN
    ALTER TABLE public.employee_targets
    ADD CONSTRAINT employee_targets_city_id_fkey
    FOREIGN KEY (city_id) REFERENCES public.product_cities(id) ON DELETE SET NULL;
  END IF;
END $$;
