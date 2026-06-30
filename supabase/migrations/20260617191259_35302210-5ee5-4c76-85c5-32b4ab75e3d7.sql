-- Scope Realtime channel subscriptions to topics that include the authenticated user's UUID.
-- This prevents merchants from receiving broadcasts intended for other merchants.
DROP POLICY IF EXISTS "Authenticated can receive realtime messages" ON realtime.messages;

CREATE POLICY "Authenticated can receive own realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    topic LIKE '%' || auth.uid()::text || '%'
  );