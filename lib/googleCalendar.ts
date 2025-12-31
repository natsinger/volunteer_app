import { Shift } from '../types';
import { supabase } from './supabase';

/**
 * Check if the current user signed in with Google
 */
export const isGoogleUser = async (): Promise<boolean> => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check if the provider is Google
    const provider = user.app_metadata?.provider || user.user_metadata?.iss;
    return provider === 'google' || (typeof provider === 'string' && provider.includes('google'));
  } catch (error) {
    console.error('Error checking if user is Google user:', error);
    return false;
  }
};

/**
 * Get the user's Google access token from Supabase session
 */
const getGoogleAccessToken = async (): Promise<{ token: string | null; error?: string }> => {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
      console.error('[GoogleCalendar] Session error:', sessionError);
      return { token: null, error: `Session error: ${sessionError.message}` };
    }

    if (!session) {
      console.log('[GoogleCalendar] No session found');
      return { token: null, error: 'No active session. Please sign in again.' };
    }

    console.log('[GoogleCalendar] Session found, provider:', session.user?.app_metadata?.provider);
    console.log('[GoogleCalendar] Provider token exists:', !!session.provider_token);
    console.log('[GoogleCalendar] Provider refresh token exists:', !!session.provider_refresh_token);

    if (!session.provider_token) {
      console.log('[GoogleCalendar] No provider token. User may need to re-authenticate with calendar scope.');
      return {
        token: null,
        error: 'No Google Calendar access. Please sign out and sign in again with Google, granting calendar permissions.'
      };
    }

    return { token: session.provider_token };
  } catch (error: any) {
    console.error('[GoogleCalendar] Error getting access token:', error);
    return { token: null, error: error.message || 'Failed to get access token' };
  }
};

/**
 * Add a shift to Google Calendar
 * @param shift - The shift to add
 * @param location - Optional location details
 * @returns Success status
 */
export const addShiftToGoogleCalendar = async (
  shift: Shift,
  location?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    console.log('[GoogleCalendar] Adding shift to calendar:', shift.title, shift.date);
    const { token: accessToken, error: tokenError } = await getGoogleAccessToken();
    if (!accessToken) {
      console.error('[GoogleCalendar] No access token:', tokenError);
      return {
        success: false,
        error: tokenError || 'No Google access token found. Please sign in with Google to use calendar sync.'
      };
    }

    // Parse shift date and times
    const shiftDate = new Date(shift.date);
    const [startHour, startMinute] = shift.startTime.split(':').map(Number);
    const [endHour, endMinute] = shift.endTime.split(':').map(Number);

    // Create start and end datetime
    const startDateTime = new Date(shiftDate);
    startDateTime.setHours(startHour, startMinute, 0, 0);

    const endDateTime = new Date(shiftDate);
    endDateTime.setHours(endHour, endMinute, 0, 0);

    // Create calendar event
    const event = {
      summary: shift.title,
      description: `Volunteer shift at ${location || shift.location || 'TBD'}`,
      location: location || shift.location || '',
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },  // 1 hour before
          { method: 'popup', minutes: 1440 }, // 1 day before
        ],
      },
      colorId: '9', // Blue color for volunteer shifts
    };

    // Add to Google Calendar via API
    console.log('[GoogleCalendar] Sending request to Google Calendar API...');
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    console.log('[GoogleCalendar] API response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[GoogleCalendar] API error:', errorData);

      // Provide more helpful error messages
      let errorMessage = errorData.error?.message || 'Failed to add event to calendar';
      if (response.status === 401) {
        errorMessage = 'Google Calendar access expired. Please sign out and sign in again with Google.';
      } else if (response.status === 403) {
        errorMessage = 'Calendar permission denied. Please sign out and sign in again with Google, granting calendar access.';
      }

      return { success: false, error: errorMessage };
    }

    const data = await response.json();
    console.log('[GoogleCalendar] Event added successfully:', data.htmlLink);

    return { success: true };
  } catch (error: any) {
    console.error('Error adding shift to Google Calendar:', error);
    return {
      success: false,
      error: error.message || 'Failed to add shift to calendar'
    };
  }
};

/**
 * Add multiple shifts to Google Calendar
 * @param shifts - Array of shifts to add
 * @returns Number of shifts successfully added
 */
export const addShiftsToGoogleCalendar = async (
  shifts: Shift[]
): Promise<{ success: boolean; added: number; failed: number; error?: string }> => {
  try {
    const isGoogle = await isGoogleUser();
    if (!isGoogle) {
      return {
        success: false,
        added: 0,
        failed: shifts.length,
        error: 'You need to sign in with Google to use calendar sync'
      };
    }

    let added = 0;
    let failed = 0;

    for (const shift of shifts) {
      const result = await addShiftToGoogleCalendar(shift);
      if (result.success) {
        added++;
      } else {
        failed++;
        console.error(`Failed to add shift ${shift.title}:`, result.error);
      }
    }

    return {
      success: added > 0,
      added,
      failed
    };
  } catch (error: any) {
    console.error('Error adding shifts to Google Calendar:', error);
    return {
      success: false,
      added: 0,
      failed: shifts.length,
      error: error.message || 'Failed to sync shifts'
    };
  }
};

/**
 * Request additional Google Calendar permissions
 * This will trigger a re-authentication flow with calendar scope
 */
export const requestCalendarPermissions = async (): Promise<void> => {
  try {
    // Sign in with Google OAuth with calendar scope
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      console.error('Error requesting calendar permissions:', error);
      alert('Failed to request calendar permissions');
    }
  } catch (error) {
    console.error('Exception requesting calendar permissions:', error);
    alert('Failed to request calendar permissions');
  }
};
