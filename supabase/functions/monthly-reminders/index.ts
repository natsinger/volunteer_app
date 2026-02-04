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

    // Send email to each volunteer
    const appUrl = Deno.env.get('APP_URL') ?? 'https://volunteer-app-self.vercel.app/'
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    let sentCount = 0
    const errors: string[] = []

    for (const volunteer of volunteers) {
      try {
        if (!resendApiKey) {
          console.log(`[NO API KEY] Would send reminder to: ${volunteer.email}`)
          sentCount++
          continue
        }

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'VolunteerFlow <noreply@pnimeet.org.il>',
            to: volunteer.email,
            subject: 'Update Your Volunteer Preferences',
            html: `
              <h2>Hi ${volunteer.name},</h2>
              <p>This is a friendly reminder to update your volunteer preferences for next month.</p>
              <p>Please log in and review:</p>
              <ul>
                <li>Your preferred days</li>
                <li>Any blackout dates</li>
                <li>Your availability status</li>
                <li>Your location preference</li>
              </ul>
              <p><a href="${appUrl}">Update your preferences</a></p>
              <p>Thank you for your continued support!</p>
            `
          })
        })

        if (!emailResponse.ok) {
          const errorBody = await emailResponse.text()
          throw new Error(`Resend API error: ${emailResponse.status} - ${errorBody}`)
        }

        console.log(`Successfully sent reminder to: ${volunteer.email}`)
        sentCount++
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
