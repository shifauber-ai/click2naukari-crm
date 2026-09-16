-- Allow employees to select leads assigned to them if they're in the product's caller queue
-- This covers HC leads that may not have a city assigned
CREATE POLICY "leads_caller_queue_select"
  ON public.leads FOR SELECT
  TO authenticated
  USING (
    auth.uid() = current_caller_id
    AND EXISTS (
      SELECT 1 FROM public.caller_queues cq
      WHERE cq.employee_id = auth.uid()
        AND cq.product_id = leads.product_id
        AND cq.is_active = true
    )
  );

-- Allow employees in caller_queues to update leads assigned to them
CREATE POLICY "leads_caller_queue_update"
  ON public.leads FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = current_caller_id
    AND EXISTS (
      SELECT 1 FROM public.caller_queues cq
      WHERE cq.employee_id = auth.uid()
        AND cq.product_id = leads.product_id
        AND cq.is_active = true
    )
  )
  WITH CHECK (
    auth.uid() = current_caller_id
    AND EXISTS (
      SELECT 1 FROM public.caller_queues cq
      WHERE cq.employee_id = auth.uid()
        AND cq.product_id = leads.product_id
        AND cq.is_active = true
    )
  );
