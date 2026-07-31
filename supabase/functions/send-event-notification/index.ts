// Supabase Edge Function: emails all active volunteers about a published event.
// Invoked explicitly from the admin events tab ("notify volunteers" button) —
// never automatically on publish, so an accidental publish/unpublish cycle
// can't blast everyone. Stamps events.notified_at on success so the UI can
// show when (and whether) volunteers were already notified.
//
// Admin-gated like send-schedule-published: the caller's bearer token must
// belong to a user in the admins table.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const DAY_NAMES_HEBREW = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { eventId } = await req.json()
    if (!eventId) {
      return jsonResponse({ error: 'eventId is required' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Admin gate
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData?.user) {
      return jsonResponse({ error: 'Invalid or missing user token' }, 401)
    }
    const { data: adminRow } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('user_id', userData.user.id)
      .maybeSingle()
    if (!adminRow) {
      return jsonResponse({ error: 'Only admins can send event notifications' }, 403)
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not set — cannot send emails' }, 500)
    }

    // Only published events may be announced
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select('*')
      .eq('id', eventId)
      .maybeSingle()
    if (eventError) throw eventError
    if (!event) return jsonResponse({ error: 'Event not found' }, 404)
    if (!event.is_published) {
      return jsonResponse({ error: 'Event is not published — publish it before notifying volunteers' }, 400)
    }

    const { data: volunteers, error: fetchError } = await supabaseAdmin
      .from('volunteers')
      .select('id, name, email')
      .eq('availability_status', 'Active')
    if (fetchError) throw fetchError

    const recipients = (volunteers ?? []).filter(v => v.email && v.email.trim() !== '')
    const skipped = (volunteers ?? []).length - recipients.length
    if (recipients.length === 0) {
      return jsonResponse({ message: 'No active volunteers with an email address', sent: 0, skipped })
    }

    const appUrl = Deno.env.get('APP_URL') ?? 'https://volunteer-app-self.vercel.app/'
    const whenLine = event.is_recurring
      ? `בכל יום ${DAY_NAMES_HEBREW[event.recurrence_day_of_week ?? 0]}, בין ${event.start_time?.slice(0, 5)} ל-${event.end_time?.slice(0, 5)}`
      : `בתאריך ${event.date}, בין ${event.start_time?.slice(0, 5)} ל-${event.end_time?.slice(0, 5)}`

    let sentCount = 0
    const errors: string[] = []
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    for (const volunteer of recipients) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'VolunteerFlow <noreply@pnimeet.org.il>',
            to: volunteer.email,
            subject: `אירוע חדש: ${event.title} — פנימית`,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; direction: rtl; text-align: right; max-width: 600px;">
                <p>הי ${volunteer.name},</p>
                <p>אירוע חדש מחכה לכם: ${event.emoji ? event.emoji + ' ' : ''}<strong>${event.title}</strong></p>
                <p>${whenLine}${event.location ? `, במיקום: ${event.location}` : ''}</p>
                ${event.description ? `<p>${event.description}</p>` : ''}
                <p>מוזמנים להיכנס לאפליקציה ולאשר הגעה.</p>
                <p><a href="${appUrl}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">אישור הגעה באפליקציה</a></p>
              </div>
            `,
          }),
        })

        if (!emailResponse.ok) {
          const errorBody = await emailResponse.text()
          throw new Error(`Resend API error: ${emailResponse.status} - ${errorBody}`)
        }

        sentCount++
        // Throttle to stay under Resend's 2 requests/second rate limit
        await delay(600)
      } catch (emailError) {
        console.error(`Failed to send to ${volunteer.email}:`, emailError)
        errors.push(`${volunteer.email}: ${emailError.message}`)
      }
    }

    // Stamp the event so the UI shows volunteers were notified (and when)
    if (sentCount > 0) {
      await supabaseAdmin
        .from('events')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', eventId)
    }

    return jsonResponse({
      success: errors.length === 0,
      message: `Event notification sent to ${sentCount}/${recipients.length} volunteers`,
      sent: sentCount,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return jsonResponse({ error: error.message }, 400)
  }
})
