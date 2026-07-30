// Supabase Edge Function: emails all active volunteers that the monthly
// schedule has been published. Invoked by the admin dashboard right after
// "Apply to Database" (the publish action), behind an in-app confirmation.
//
// Admin-gated: the caller's bearer token must belong to a user in the admins
// table — verify_jwt alone would let anyone with the public anon key trigger
// a mass email.

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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { targetMonth, targetYear } = await req.json()
    if (!targetMonth || !targetYear || targetMonth < 1 || targetMonth > 12) {
      return jsonResponse({ error: 'targetMonth (1-12) and targetYear are required' }, 400)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Admin gate: the bearer token must belong to a user in the admins table
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
      return jsonResponse({ error: 'Only admins can send schedule notifications' }, 403)
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return jsonResponse({ error: 'RESEND_API_KEY is not set — cannot send emails' }, 500)
    }

    // All active volunteers get notified that the schedule is out
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
    const monthName = new Date(targetYear, targetMonth - 1, 1)
      .toLocaleDateString('he-IL', { month: 'long' })

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
            subject: `הלוז לחודש ${monthName} פורסם — פנימית`,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; direction: rtl; text-align: right; max-width: 600px;">
                <p>הי ${volunteer.name},</p>
                <p>שיבוצי המשמרות לחודש ${monthName} פורסמו. מוזמנים להיכנס לאפליקציה ולראות את המשמרות שלכם.</p>
                <p><a href="${appUrl}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">צפייה בלוז</a></p>
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

    return jsonResponse({
      success: errors.length === 0,
      message: `Schedule-published email sent to ${sentCount}/${recipients.length} volunteers`,
      sent: sentCount,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    return jsonResponse({ error: error.message }, 400)
  }
})
