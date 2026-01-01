// Email Service - Uses Supabase Edge Function with Resend
import { supabase } from '../lib/supabase';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string; // Optional, defaults to configured sender in edge function
}

interface EmailResponse {
  success: boolean;
  data?: { id: string };
  error?: string;
}

/**
 * Send an email via the Supabase Edge Function (which uses Resend)
 */
export async function sendEmail(options: SendEmailOptions): Promise<EmailResponse> {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: options,
  });

  if (error) {
    console.error('Error invoking send-email function:', error);
    return { success: false, error: error.message };
  }

  return data;
}

/**
 * Send a shift assignment notification to a volunteer
 */
export async function sendShiftAssignmentEmail(
  volunteerEmail: string,
  volunteerName: string,
  shiftDate: string,
  shiftTime: string,
  location: string
): Promise<EmailResponse> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4F46E5;">Shift Assignment</h1>
      <p>Hi ${volunteerName},</p>
      <p>You have been assigned to a new shift:</p>
      <div style="background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Date:</strong> ${shiftDate}</p>
        <p style="margin: 4px 0;"><strong>Time:</strong> ${shiftTime}</p>
        <p style="margin: 4px 0;"><strong>Location:</strong> ${location}</p>
      </div>
      <p>Please log in to the volunteer app to view more details or request changes.</p>
      <p>Thank you for volunteering!</p>
    </div>
  `;

  return sendEmail({
    to: volunteerEmail,
    subject: `Shift Assignment: ${shiftDate} at ${location}`,
    html,
  });
}

/**
 * Send a shift reminder to a volunteer
 */
export async function sendShiftReminderEmail(
  volunteerEmail: string,
  volunteerName: string,
  shiftDate: string,
  shiftTime: string,
  location: string
): Promise<EmailResponse> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4F46E5;">Shift Reminder</h1>
      <p>Hi ${volunteerName},</p>
      <p>This is a friendly reminder about your upcoming shift:</p>
      <div style="background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Date:</strong> ${shiftDate}</p>
        <p style="margin: 4px 0;"><strong>Time:</strong> ${shiftTime}</p>
        <p style="margin: 4px 0;"><strong>Location:</strong> ${location}</p>
      </div>
      <p>See you there!</p>
    </div>
  `;

  return sendEmail({
    to: volunteerEmail,
    subject: `Reminder: Your shift on ${shiftDate}`,
    html,
  });
}

/**
 * Send a schedule published notification
 */
export async function sendSchedulePublishedEmail(
  volunteerEmail: string,
  volunteerName: string,
  monthYear: string,
  shiftCount: number
): Promise<EmailResponse> {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #4F46E5;">New Schedule Published</h1>
      <p>Hi ${volunteerName},</p>
      <p>The schedule for <strong>${monthYear}</strong> has been published!</p>
      <p>You have been assigned to <strong>${shiftCount} shift${shiftCount !== 1 ? 's' : ''}</strong>.</p>
      <p>Please log in to the volunteer app to view your schedule and add the shifts to your calendar.</p>
      <p>Thank you for volunteering!</p>
    </div>
  `;

  return sendEmail({
    to: volunteerEmail,
    subject: `New Schedule Published: ${monthYear}`,
    html,
  });
}
