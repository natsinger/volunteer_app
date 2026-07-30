// Client-side invokers for the admin-gated email edge functions
// (send-schedule-published, send-event-notification). Both send the logged-in
// admin's session access token — the edge functions verify it belongs to a row
// in the admins table before sending anything.
import { supabase } from '../lib/supabase';

interface SendResult {
  success: boolean;
  sent: number;
  error?: string;
}

const invokeEmailFunction = async (
  functionName: string,
  body: Record<string, unknown>
): Promise<SendResult> => {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      return { success: false, sent: 0, error: 'Not signed in' };
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`[emailNotification] ${functionName} failed:`, result);
      return { success: false, sent: 0, error: result.error || `HTTP ${response.status}` };
    }

    return {
      success: result.success ?? true,
      sent: result.sent ?? 0,
      error: result.errors?.join?.(', '),
    };
  } catch (error) {
    console.error(`[emailNotification] ${functionName} error:`, error);
    return { success: false, sent: 0, error: error instanceof Error ? error.message : String(error) };
  }
};

/** Email all active volunteers that the month's schedule was published. */
export const notifySchedulePublished = (targetMonth: number, targetYear: number): Promise<SendResult> =>
  invokeEmailFunction('send-schedule-published', { targetMonth, targetYear });

/** Email all active volunteers about a published event. */
export const notifyEventPublished = (eventId: string): Promise<SendResult> =>
  invokeEmailFunction('send-event-notification', { eventId });
