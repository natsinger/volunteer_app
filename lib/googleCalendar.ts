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
const getGoogleAccessToken = async (): Promise<string | null> => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Google OAuth token is stored in the session
    return session.provider_token || null;
  } catch (error) {
    console.error('Error getting Google access token:', error);
    return null;
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
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      return {
        success: false,
        error: 'No Google access token found. Please sign in with Google to use calendar sync.'
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
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google Calendar API error:', errorData);
      return {
        success: false,
        error: errorData.error?.message || 'Failed to add event to calendar'
      };
    }

    const data = await response.json();
    console.log('Event added to Google Calendar:', data.htmlLink);

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
