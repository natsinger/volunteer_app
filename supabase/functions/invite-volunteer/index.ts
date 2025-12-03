// Follow this setup guide to integrate the Deno runtime into your editor:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Get request body
    const { email, volunteerId, volunteerName } = await req.json()

    if (!email || !volunteerId) {
      throw new Error('Email and volunteerId are required')
    }

    console.log(`Processing invite for volunteer: ${volunteerName} (${email})`)

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.error('Error listing users:', listError)
      throw listError
    }

    const existingUser = existingUsers.users.find((u) => u.email === email)

    let userId: string

    if (existingUser) {
      console.log(`User already exists: ${existingUser.id}`)
      userId = existingUser.id

      // If user exists but hasn't verified email, resend invite
      if (!existingUser.email_confirmed_at) {
        const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
          redirectTo: `${req.headers.get('origin') || 'http://localhost:5173'}`,
        })

        if (inviteError) {
          console.error('Error resending invite:', inviteError)
          throw inviteError
        }

        console.log('Invite email resent')
      }
    } else {
      // Create new user and send invite
      const { data: newUser, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo: `${req.headers.get('origin') || 'http://localhost:5173'}`,
        }
      )

      if (inviteError) {
        console.error('Error creating user and sending invite:', inviteError)
        throw inviteError
      }

      if (!newUser.user) {
        throw new Error('Failed to create user')
      }

      userId = newUser.user.id
      console.log(`New user created: ${userId}`)
    }

    // Link the auth user to the volunteer record
    const { error: updateError } = await supabaseAdmin
      .from('volunteers')
      .update({ user_id: userId })
      .eq('id', volunteerId)

    if (updateError) {
      console.error('Error linking volunteer to user:', updateError)
      throw updateError
    }

    console.log(`Volunteer ${volunteerId} linked to user ${userId}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invite sent successfully',
        userId,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in invite-volunteer function:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'An error occurred while sending the invite',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
