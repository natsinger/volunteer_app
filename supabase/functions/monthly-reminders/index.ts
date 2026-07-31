// Supabase Edge Function for automated monthly preference reminders
// This function runs on a schedule (cron job) to send reminders 7 days before month end

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Check for force parameter to bypass date check (for testing)
    const url = new URL(req.url)
    const force = url.searchParams.get('force') === 'true'

    // Create Supabase client with service role key (has admin access)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Check if it's 7 days before end of month (unless force=true)
    const today = new Date()
    const currentMonth = today.getMonth()
    const currentYear = today.getFullYear()
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate()
    const currentDay = today.getDate()
    const daysUntilEnd = lastDay - currentDay

    if (!force && daysUntilEnd !== 7) {
      return new Response(
        JSON.stringify({
          message: `Not time to send reminders (${daysUntilEnd} days until end of month)`,
          hint: 'Add ?force=true to bypass date check for testing'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get all active volunteers
    const { data: volunteers, error: fetchError } = await supabaseAdmin
      .from('volunteers')
      .select('id, name, email')
      .eq('availability_status', 'Active')

    if (fetchError) {
      throw fetchError
    }

    if (!volunteers || volunteers.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No active volunteers to send reminders to' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send email to each volunteer (with 600ms delay to stay under Resend's 2 req/sec limit)
    const appUrl = Deno.env.get('APP_URL') ?? 'https://volunteer-app-self.vercel.app/'
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: 'RESEND_API_KEY is not set — cannot send emails' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    let sentCount = 0
    const errors: string[] = []

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    for (const volunteer of volunteers) {
      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'VolunteerFlow <noreply@pnimeet.org.il>',
            to: volunteer.email,
            subject: 'תזכורת למילוי העדפות באפליקציה של פנימית',
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; direction: rtl; text-align: right; max-width: 600px;">
                <p>הי ${volunteer.name},</p>
                <p>מוזמנים להיכנס לאזור האישי שלכם באפליקציה ולעדכן את הזמינות שלכם לחודש הקרוב. אם כבר עדכנתם — מצוין!</p>
                <p><a href="${appUrl}" style="background-color: #4F46E5; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">כניסה לאפליקציה</a></p>
              </div>
            `
          })
        })

        if (!emailResponse.ok) {
          const errorBody = await emailResponse.text()
          throw new Error(`Resend API error: ${emailResponse.status} - ${errorBody}`)
        }

        console.log(`Successfully sent reminder to: ${volunteer.email}`)
        sentCount++

        // Throttle to stay under Resend's 2 requests/second rate limit
        await delay(600)
      } catch (emailError) {
        console.error(`Failed to send email to ${volunteer.email}:`, emailError)
        errors.push(`${volunteer.email}: ${emailError.message}`)
      }
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        message: `Reminders sent to ${sentCount}/${volunteers.length} volunteers`,
        hasApiKey: !!resendApiKey,
        errors: errors.length > 0 ? errors : undefined
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )
  }
})
