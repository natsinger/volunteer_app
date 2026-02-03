import { Shift } from '../types';

/**
 * Generate a Google Calendar URL that opens the "Add Event" page with pre-filled data
 * This approach requires NO OAuth, NO API access, NO verification - just opens a URL
 */
export function generateGoogleCalendarUrl(shift: Shift): string {
  // Combine date + time and convert to UTC in YYYYMMDDTHHmmssZ format
  const toUtcDateTime = (date: string, time: string): string => {
    const localDate = new Date(`${date}T${time}:00`);
    return localDate
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  };

  const start = toUtcDateTime(shift.date, shift.startTime);
  const end = toUtcDateTime(shift.date, shift.endTime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: shift.title,
    dates: `${start}/${end}`,
    location: shift.location ?? '',
    details: [
      `Volunteer shift`,
      shift.requiredSkills?.length
        ? `Required skills: ${shift.requiredSkills.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join('\n'),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate Google Calendar URLs for multiple shifts
 */
export function generateGoogleCalendarUrls(shifts: Shift[]): { shift: Shift; url: string }[] {
  return shifts.map(shift => ({
    shift,
    url: generateGoogleCalendarUrl(shift)
  }));
}

/**
 * Open Google Calendar to add a shift (opens in new tab)
 */
export function openGoogleCalendarForShift(shift: Shift): void {
  const url = generateGoogleCalendarUrl(shift);
  window.open(url, '_blank');
}

/**
 * Check if the current user signed in with Google
 * Still useful to show Google-specific features
 */
export const isGoogleUser = async (): Promise<boolean> => {
  try {
    const { supabase } = await import('./supabase');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const appProvider = user.app_metadata?.provider;
    const identities = user.identities || [];
    const hasGoogleIdentity = identities.some((id: any) => id.provider === 'google');

    return appProvider === 'google' || hasGoogleIdentity;
  } catch (error) {
    console.error('Error checking if user is Google user:', error);
    return false;
  }
};

// Legacy function - kept for backward compatibility but now just opens URL
export const addShiftToGoogleCalendar = async (
  shift: Shift,
  _location?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    openGoogleCalendarForShift(shift);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

// Legacy function - kept for backward compatibility
export const addShiftsToGoogleCalendar = async (
  shifts: Shift[]
): Promise<{ success: boolean; added: number; failed: number; error?: string }> => {
  try {
    // Open first shift in calendar (opening multiple tabs would be annoying)
    if (shifts.length > 0) {
      openGoogleCalendarForShift(shifts[0]);
    }
    return {
      success: true,
      added: shifts.length > 0 ? 1 : 0,
      failed: shifts.length > 1 ? shifts.length - 1 : 0,
      error: shifts.length > 1 ? 'Only the first shift was opened. Please add others manually.' : undefined
    };
  } catch (error: any) {
    return { success: false, added: 0, failed: shifts.length, error: error.message };
  }
};

// Remove the OAuth-based calendar permission request - no longer needed
export const requestCalendarPermissions = async (): Promise<void> => {
  // No longer needed - URL-based approach requires no permissions
  console.log('Calendar permissions not required with URL-based approach');
};
