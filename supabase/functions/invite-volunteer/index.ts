// Supabase Edge Function: Generate Magic Link for Volunteer Invite
// This version returns the invite link instead of sending email

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
    const { email, volunteerId, volunteerName, generateLinkOnly } = await req.json()

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
    let inviteUrl: string

    if (existingUser) {
      console.log(`User already exists: ${existingUser.id}`)
      userId = existingUser.id

      // Generate a magic link for existing user (password reset type)
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: email,
      })

      if (linkError) {
        console.error('Error generating magic link:', linkError)
        throw linkError
      }

      inviteUrl = linkData.properties.action_link
      console.log('Magic link generated for existing user')
    } else {
      // Generate an invite link for new user
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: {
          data: {
            volunteer_name: volunteerName,
            volunteer_id: volunteerId,
          },
        },
      })

      if (linkError) {
        console.error('Error generating invite link:', linkError)
        throw linkError
      }

      // The user is created automatically when generating an invite link
      inviteUrl = linkData.properties.action_link
      userId = linkData.user.id
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

    // If generateLinkOnly is true, just return the link without sending email
    if (generateLinkOnly) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Magic link generated successfully',
          userId,
          inviteUrl,
          method: 'magic_link',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // Otherwise, send email via Supabase (if SMTP is configured)
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${req.headers.get('origin') || 'http://localhost:5173'}`,
    })

    if (inviteError) {
      // If email fails, still return the magic link
      console.warn('Email sending failed, but magic link was generated:', inviteError)
      return new Response(
        JSON.stringify({
          success: true,
          message: 'User created but email failed. Use the magic link below.',
          userId,
          inviteUrl,
          emailError: inviteError.message,
          method: 'magic_link_fallback',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Invite sent successfully',
        userId,
        inviteUrl,
        method: 'email',
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
        error: error.message || 'An error occurred while processing the invite',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
