// Supabase Edge Function: Generate Magic Link for Volunteer Invite
// Simplified version that works reliably

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
    console.log('=== FUNCTION START ===')

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    console.log('Supabase URL:', supabaseUrl)
    console.log('Service key exists:', !!supabaseServiceKey)

    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Get request body
    const body = await req.json()
    console.log('Request body:', JSON.stringify(body, null, 2))

    const { email, volunteerId, volunteerName, generateLinkOnly } = body

    if (!email || !volunteerId) {
      throw new Error('Email and volunteerId are required')
    }

    console.log(`Processing invite for: ${volunteerName} (${email})`)
    console.log(`generateLinkOnly: ${generateLinkOnly}`)

    // Check if user already exists
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    if (listError) {
      console.error('Error listing users:', listError)
      throw listError
    }

    console.log(`Total users in system: ${existingUsers.users.length}`)

    const existingUser = existingUsers.users.find((u) => u.email === email)
    console.log('Existing user found:', !!existingUser)

    let userId: string
    let inviteUrl: string | null = null

    if (existingUser) {
      console.log(`User already exists: ${existingUser.id}`)
      userId = existingUser.id

      // For existing users, try to generate a recovery link
      try {
        console.log('Attempting to generate recovery link...')
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'recovery',
          email: email,
        })

        console.log('Generate link response:', { linkData: !!linkData, linkError })

        if (linkError) {
          console.error('Link generation error:', JSON.stringify(linkError, null, 2))
          throw linkError
        }

        if (linkData && linkData.properties && linkData.properties.action_link) {
          inviteUrl = linkData.properties.action_link
          console.log('✅ Recovery link generated successfully')
          console.log('Link structure:', Object.keys(linkData))
          console.log('Properties structure:', Object.keys(linkData.properties || {}))
        } else {
          console.error('❌ No action_link in response:', JSON.stringify(linkData, null, 2))
        }
      } catch (err) {
        console.error('Exception generating link:', err)
        throw err
      }
    } else {
      console.log('Creating new user with invite link...')

      try {
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

        console.log('Generate link response:', { linkData: !!linkData, linkError })

        if (linkError) {
          console.error('Link generation error:', JSON.stringify(linkError, null, 2))
          throw linkError
        }

        if (linkData && linkData.user && linkData.properties && linkData.properties.action_link) {
          inviteUrl = linkData.properties.action_link
          userId = linkData.user.id
          console.log('✅ Invite link generated successfully')
          console.log('New user ID:', userId)
        } else {
          console.error('❌ Invalid response structure:', JSON.stringify(linkData, null, 2))
          throw new Error('Invalid response from generateLink')
        }
      } catch (err) {
        console.error('Exception generating link:', err)
        throw err
      }
    }

    // Link the auth user to the volunteer record
    console.log(`Linking volunteer ${volunteerId} to user ${userId}...`)
    const { error: updateError } = await supabaseAdmin
      .from('volunteers')
      .update({ user_id: userId })
      .eq('id', volunteerId)

    if (updateError) {
      console.error('Error linking volunteer to user:', updateError)
      throw updateError
    }

    console.log('✅ Volunteer linked successfully')
    console.log('Final inviteUrl value:', inviteUrl)

    // Return the response
    const response = {
      success: true,
      message: inviteUrl ? 'Magic link generated successfully' : 'User processed but no link generated',
      userId,
      inviteUrl: inviteUrl || undefined,
      method: generateLinkOnly ? 'magic_link' : 'email',
      debug: {
        hadExistingUser: !!existingUser,
        linkGenerated: !!inviteUrl,
        generateLinkOnly: generateLinkOnly,
      }
    }

    console.log('=== RETURNING RESPONSE ===')
    console.log(JSON.stringify(response, null, 2))

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('=== FUNCTION ERROR ===')
    console.error('Error type:', error.constructor.name)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)

    return new Response(
      JSON.stringify({
        error: error.message || 'An error occurred while processing the invite',
        errorType: error.constructor.name,
        errorStack: error.stack,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
