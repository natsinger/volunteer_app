/**
 * Sends reminder emails to all active volunteers to update their preferences
 * by invoking the monthly-reminders Supabase Edge Function with force=true.
 */
export async function sendPreferenceReminders(): Promise<{ success: boolean; sent: number; error?: string }> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/monthly-reminders?force=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Edge function error:', errorText);
      return { success: false, sent: 0, error: `Edge function returned ${response.status}: ${errorText}` };
    }

    const result = await response.json();
    console.log('Reminder result:', result);

    return {
      success: result.success ?? true,
      sent: parseInt(result.message?.match(/(\d+)\//)?.[1] ?? '0', 10),
      error: result.errors?.join(', '),
    };
  } catch (error: any) {
    console.error('Error sending reminders:', error);
    return { success: false, sent: 0, error: error.message };
  }
}
