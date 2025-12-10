import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduleRequest {
  volunteers: any[];
  shifts: any[];
  targetMonth: number;
  targetYear: number;
  randomize?: boolean;
  numberOfOptions?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verify user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client to verify user is admin
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is admin
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (adminError || !adminData) {
      return new Response(
        JSON.stringify({ error: 'Only admins can generate schedules' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const requestData: ScheduleRequest = await req.json();
    const { volunteers, shifts, targetMonth, targetYear, randomize = false, numberOfOptions = 1 } = requestData;

    // Get Gemini API key from environment
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Call Gemini API for schedule generation
    // Note: This is a simplified version - you'll need to implement the actual scheduling logic
    // For now, we'll return a mock response to maintain functionality

    // Filter only active volunteers
    const activeVolunteers = volunteers.filter((v: any) => v.availabilityStatus === 'Active');

    // Filter open shifts for the target month
    const targetShifts = shifts.filter((s: any) => {
      const d = new Date(s.date);
      return s.status === 'Open' &&
             d.getMonth() + 1 === targetMonth &&
             d.getFullYear() === targetYear;
    });

    if (activeVolunteers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No active volunteers found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (targetShifts.length === 0) {
      return new Response(
        JSON.stringify({ error: `No open shifts found for ${targetMonth}/${targetYear}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For now, return success with instruction to implement scheduling logic
    // In production, you would call Gemini API here with proper prompts
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Schedule generation endpoint ready. Implement Gemini API logic here.',
        data: {
          activeVolunteers: activeVolunteers.length,
          targetShifts: targetShifts.length,
          targetMonth,
          targetYear,
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
