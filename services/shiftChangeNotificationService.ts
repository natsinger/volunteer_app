import { supabase } from '../lib/supabase';
import type { Volunteer, Shift } from '../types';

interface ShiftChange {
  volunteerId: string;
  volunteerName: string;
  volunteerEmail: string;
  changes: {
    type: 'added' | 'removed' | 'modified';
    oldShift?: Shift;
    newShift?: Shift;
  }[];
}

interface ShiftAssignmentSnapshot {
  shiftId: string;
  volunteerId: string;
}

/**
 * Compare old and new shift assignments to detect changes
 */
export function detectShiftChanges(
  oldAssignments: ShiftAssignmentSnapshot[],
  newAssignments: ShiftAssignmentSnapshot[],
  shifts: Shift[],
  volunteers: Volunteer[]
): ShiftChange[] {
  const changes: Map<string, ShiftChange> = new Map();

  // Helper to get or create change entry for a volunteer
  const getVolunteerChange = (volunteerId: string): ShiftChange => {
    if (!changes.has(volunteerId)) {
      const volunteer = volunteers.find(v => v.id === volunteerId);
      if (!volunteer) {
        throw new Error(`Volunteer ${volunteerId} not found`);
      }
      changes.set(volunteerId, {
        volunteerId,
        volunteerName: volunteer.name,
        volunteerEmail: volunteer.email,
        changes: []
      });
    }
    return changes.get(volunteerId)!;
  };

  // Create maps for easier lookup
  const oldMap = new Map<string, string[]>(); // volunteerId -> shiftIds[]
  const newMap = new Map<string, string[]>();

  oldAssignments.forEach(a => {
    if (!oldMap.has(a.volunteerId)) oldMap.set(a.volunteerId, []);
    oldMap.get(a.volunteerId)!.push(a.shiftId);
  });

  newAssignments.forEach(a => {
    if (!newMap.has(a.volunteerId)) newMap.set(a.volunteerId, []);
    newMap.get(a.volunteerId)!.push(a.shiftId);
  });

  // Find all affected volunteers
  const allVolunteerIds = new Set([...oldMap.keys(), ...newMap.keys()]);

  allVolunteerIds.forEach(volunteerId => {
    const oldShiftIds = oldMap.get(volunteerId) || [];
    const newShiftIds = newMap.get(volunteerId) || [];

    // Find removed shifts
    const removedShiftIds = oldShiftIds.filter(id => !newShiftIds.includes(id));
    removedShiftIds.forEach(shiftId => {
      const shift = shifts.find(s => s.id === shiftId);
      if (shift) {
        const change = getVolunteerChange(volunteerId);
        change.changes.push({
          type: 'removed',
          oldShift: shift
        });
      }
    });

    // Find added shifts
    const addedShiftIds = newShiftIds.filter(id => !oldShiftIds.includes(id));
    addedShiftIds.forEach(shiftId => {
      const shift = shifts.find(s => s.id === shiftId);
      if (shift) {
        const change = getVolunteerChange(volunteerId);
        change.changes.push({
          type: 'added',
          newShift: shift
        });
      }
    });
  });

  return Array.from(changes.values()).filter(c => c.changes.length > 0);
}


/**
 * Send email notification to a volunteer about their shift changes
 */
async function sendChangeEmail(
  volunteerEmail: string,
  volunteerName: string,
  changes: ShiftChange['changes']
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    if (!supabaseUrl) {
      console.error('Supabase URL not configured');
      return { success: false, error: 'Email service not configured' };
    }

    // Format changes for the edge function
    const formattedChanges = changes.map(change => ({
      type: change.type,
      shift: change.type === 'removed' ? change.oldShift : change.newShift,
    })).filter(c => c.shift).map(c => ({
      type: c.type,
      shift: {
        title: c.shift!.title,
        date: c.shift!.date,
        startTime: c.shift!.startTime,
        endTime: c.shift!.endTime,
        location: c.shift!.location,
      }
    }));

    // Call the edge function to send email
    const response = await fetch(`${supabaseUrl}/functions/v1/send-shift-change-notification`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        volunteerEmail,
        volunteerName,
        changes: formattedChanges,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error(`✗ Failed to send email to ${volunteerEmail}:`, errorData);
      return { success: false, error: errorData.error || 'Failed to send email' };
    }

    console.log(`✓ Shift change notification sent to ${volunteerEmail}`);
    return { success: true };
  } catch (error) {
    console.error(`✗ Failed to send email to ${volunteerEmail}:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Send shift change notifications to all affected volunteers
 */
export async function sendShiftChangeNotifications(
  oldAssignments: ShiftAssignmentSnapshot[],
  newAssignments: ShiftAssignmentSnapshot[],
  shifts: Shift[],
  volunteers: Volunteer[]
): Promise<{ success: boolean; emailsSent: number; errors: string[] }> {
  const changes = detectShiftChanges(oldAssignments, newAssignments, shifts, volunteers);

  if (changes.length === 0) {
    console.log('No shift changes detected, no notifications to send');
    return { success: true, emailsSent: 0, errors: [] };
  }

  console.log(`Detected changes for ${changes.length} volunteer(s)`);

  const results = await Promise.all(
    changes.map(change =>
      sendChangeEmail(change.volunteerEmail, change.volunteerName, change.changes)
    )
  );

  const emailsSent = results.filter(r => r.success).length;
  const errors = results.filter(r => !r.success).map(r => r.error || 'Unknown error');

  return {
    success: errors.length === 0,
    emailsSent,
    errors
  };
}

/**
 * Helper to fetch current shift assignments from the database
 */
export async function getCurrentAssignments(
  month: number,
  year: number
): Promise<ShiftAssignmentSnapshot[]> {
  const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
  const endDate = new Date(year, month, 0).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('shift_assignments')
    .select('shift_id, volunteer_id, shifts!inner(date)')
    .gte('shifts.date', startDate)
    .lte('shifts.date', endDate);

  if (error) {
    console.error('Error fetching current assignments:', error);
    return [];
  }

  return (data || []).map(item => ({
    shiftId: item.shift_id,
    volunteerId: item.volunteer_id
  }));
}
