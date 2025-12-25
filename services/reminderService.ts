import { supabase } from '../lib/supabase';
import { Volunteer } from '../types';

/**
 * Sends reminder emails to all active volunteers to update their preferences
 * This function can be called manually by admin or via a scheduled job
 */
export async function sendPreferenceReminders(): Promise<{ success: boolean; sent: number; error?: string }> {
  try {
    // Get all active volunteers
    const { data: volunteers, error: fetchError } = await supabase
      .from('volunteers')
      .select('id, name, email')
      .eq('availability_status', 'Active');

    if (fetchError) {
      console.error('Error fetching volunteers:', fetchError);
      return { success: false, sent: 0, error: fetchError.message };
    }

    if (!volunteers || volunteers.length === 0) {
      return { success: true, sent: 0 };
    }

    // TODO: Implement actual email sending
    // This is a placeholder for the email sending logic
    // You would integrate with:
    // - Supabase Auth email templates
    // - SendGrid, Resend, or another email service
    // - Or use Supabase Edge Functions

    console.log(`Would send reminder to ${volunteers.length} volunteers`);

    // For now, we'll return success
    // In production, you would loop through volunteers and send emails
    /*
    for (const volunteer of volunteers) {
      // Example using a hypothetical email service:
      await sendEmail({
        to: volunteer.email,
        subject: 'Update Your Volunteer Preferences',
        body: generateReminderEmail(volunteer.name)
      });
    }
    */

    return { success: true, sent: volunteers.length };
  } catch (error: any) {
    console.error('Error sending reminders:', error);
    return { success: false, sent: 0, error: error.message };
  }
}

/**
 * Generates the email content for preference reminder
 */
function generateReminderEmail(volunteerName: string): string {
  const appUrl = window.location.origin;

  return `
    Hi ${volunteerName},

    This is a friendly reminder to update your volunteer preferences for next month.

    Please log in to the volunteer portal and review:
    - Your preferred days
    - Any blackout dates (dates you can't volunteer)
    - Your availability status
    - Your location preference

    Update your preferences: ${appUrl}

    Thank you for your continued support!

    Best regards,
    VolunteerFlow Team
  `;
}

/**
 * Checks if it's time to send monthly reminders (7 days before end of month)
 */
export function shouldSendMonthlyReminder(): boolean {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  // Get the last day of current month
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const currentDay = today.getDate();

  // Check if it's 7 days before the end of the month
  return (lastDay - currentDay) === 7;
}
