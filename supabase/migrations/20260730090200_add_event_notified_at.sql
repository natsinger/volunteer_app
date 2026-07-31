-- Tracks when volunteers were emailed about a published event, so the admin
-- UI can show "sent on ..." and warn before re-sending. Stamped by the
-- send-event-notification edge function.

ALTER TABLE events ADD COLUMN IF NOT EXISTS notified_at TIMESTAMP WITH TIME ZONE;
