import { supabase } from '../lib/supabase';
import { SavedSchedule, SavedScheduleAssignment } from '../types';

// Mapper functions for database format
const mapSavedScheduleFromDB = (dbSchedule: any): SavedSchedule => ({
  id: dbSchedule.id,
  name: dbSchedule.name,
  targetMonth: dbSchedule.target_month,
  targetYear: dbSchedule.target_year,
  createdAt: dbSchedule.created_at,
  createdBy: dbSchedule.created_by,
  notes: dbSchedule.notes,
});

const mapSavedScheduleToDB = (schedule: Partial<SavedSchedule>) => ({
  id: schedule.id,
  name: schedule.name,
  target_month: schedule.targetMonth,
  target_year: schedule.targetYear,
  created_at: schedule.createdAt,
  created_by: schedule.createdBy,
  notes: schedule.notes,
});

const mapSavedAssignmentFromDB = (dbAssignment: any): SavedScheduleAssignment => ({
  id: dbAssignment.id,
  scheduleId: dbAssignment.schedule_id,
  shiftId: dbAssignment.shift_id,
  volunteerId: dbAssignment.volunteer_id,
  createdAt: dbAssignment.created_at,
});

const mapSavedAssignmentToDB = (assignment: Partial<SavedScheduleAssignment>) => ({
  id: assignment.id,
  schedule_id: assignment.scheduleId,
  shift_id: assignment.shiftId,
  volunteer_id: assignment.volunteerId,
  created_at: assignment.createdAt,
});

/**
 * Save a schedule with its assignments to the database
 */
export const saveSchedule = async (
  name: string,
  targetMonth: number,
  targetYear: number,
  assignments: { shiftId: string; volunteerId: string }[],
  notes?: string
): Promise<{ success: boolean; scheduleId?: string; error?: string }> => {
  try {
    // Insert the schedule metadata
    const { data: scheduleData, error: scheduleError } = await supabase
      .from('saved_schedules')
      .insert([
        {
          name,
          target_month: targetMonth,
          target_year: targetYear,
          notes,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (scheduleError) {
      console.error('Error saving schedule:', scheduleError);
      return { success: false, error: scheduleError.message };
    }

    const scheduleId = scheduleData.id;

    // Insert all assignments
    const assignmentRecords = assignments.map((a) => ({
      schedule_id: scheduleId,
      shift_id: a.shiftId,
      volunteer_id: a.volunteerId,
      created_at: new Date().toISOString(),
    }));

    const { error: assignmentsError } = await supabase
      .from('saved_schedule_assignments')
      .insert(assignmentRecords);

    if (assignmentsError) {
      console.error('Error saving assignments:', assignmentsError);
      // Try to clean up the schedule record
      await supabase.from('saved_schedules').delete().eq('id', scheduleId);
      return { success: false, error: assignmentsError.message };
    }

    return { success: true, scheduleId };
  } catch (error: any) {
    console.error('Unexpected error saving schedule:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Load all saved schedules
 */
export const loadSavedSchedules = async (): Promise<{
  success: boolean;
  schedules?: SavedSchedule[];
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from('saved_schedules')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading saved schedules:', error);
      return { success: false, error: error.message };
    }

    const schedules = (data || []).map(mapSavedScheduleFromDB);
    return { success: true, schedules };
  } catch (error: any) {
    console.error('Unexpected error loading saved schedules:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Load assignments for a specific saved schedule
 */
export const loadScheduleAssignments = async (
  scheduleId: string
): Promise<{
  success: boolean;
  assignments?: SavedScheduleAssignment[];
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from('saved_schedule_assignments')
      .select('*')
      .eq('schedule_id', scheduleId);

    if (error) {
      console.error('Error loading schedule assignments:', error);
      return { success: false, error: error.message };
    }

    const assignments = (data || []).map(mapSavedAssignmentFromDB);
    return { success: true, assignments };
  } catch (error: any) {
    console.error('Unexpected error loading schedule assignments:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Delete a saved schedule and all its assignments
 */
export const deleteSchedule = async (
  scheduleId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Delete the schedule (CASCADE will delete assignments)
    const { error } = await supabase
      .from('saved_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) {
      console.error('Error deleting schedule:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Unexpected error deleting schedule:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Get the most recent saved schedule for a specific month/year
 */
export const getLatestScheduleForMonth = async (
  targetMonth: number,
  targetYear: number
): Promise<{
  success: boolean;
  schedule?: SavedSchedule;
  assignments?: SavedScheduleAssignment[];
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from('saved_schedules')
      .select('*')
      .eq('target_month', targetMonth)
      .eq('target_year', targetYear)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return { success: true, schedule: undefined, assignments: [] };
      }
      console.error('Error loading latest schedule:', error);
      return { success: false, error: error.message };
    }

    const schedule = mapSavedScheduleFromDB(data);

    // Load assignments for this schedule
    const assignmentsResult = await loadScheduleAssignments(schedule.id);
    if (!assignmentsResult.success) {
      return { success: false, error: assignmentsResult.error };
    }

    return {
      success: true,
      schedule,
      assignments: assignmentsResult.assignments,
    };
  } catch (error: any) {
    console.error('Unexpected error loading latest schedule:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Send email notifications to all volunteers when a schedule is published
 * Sends to ALL active volunteers, not just those with assignments
 */
export const sendScheduleNotifications = async (
  scheduleId: string,
  scheduleName: string,
  targetMonth: number,
  targetYear: number
): Promise<{ success: boolean; emailsSent: number; error?: string }> => {
  try {
    // Load assignments for this schedule
    const assignmentsResult = await loadScheduleAssignments(scheduleId);
    if (!assignmentsResult.success || !assignmentsResult.assignments) {
      return { success: false, emailsSent: 0, error: assignmentsResult.error };
    }

    // Fetch ALL active volunteers (not just assigned ones)
    const { data: allVolunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('id, name, email')
      .eq('availability_status', 'Active');

    if (volunteersError) {
      console.error('Error fetching volunteers:', volunteersError);
      return { success: false, emailsSent: 0, error: volunteersError.message };
    }

    if (!allVolunteers || allVolunteers.length === 0) {
      return { success: true, emailsSent: 0 };
    }

    // Get all shifts for this schedule to show context
    const shiftIds = [...new Set(assignmentsResult.assignments.map(a => a.shiftId))];
    const { data: shifts, error: shiftsError } = await supabase
      .from('shifts')
      .select('id, title, date, start_time, end_time, location')
      .in('id', shiftIds);

    if (shiftsError) {
      console.error('Error fetching shifts:', shiftsError);
      return { success: false, emailsSent: 0, error: shiftsError.message };
    }

    const monthName = new Date(targetYear, targetMonth - 1).toLocaleString('en-US', { month: 'long' });

    // Send notifications to ALL active volunteers
    let emailsSent = 0;
    for (const volunteer of allVolunteers) {
      if (!volunteer.email) continue;

      // Find all shifts assigned to this volunteer
      const volunteerAssignments = assignmentsResult.assignments.filter(
        a => a.volunteerId === volunteer.id
      );

      const volunteerShifts = volunteerAssignments
        .map(a => shifts?.find(s => s.id === a.shiftId))
        .filter(s => s != null);

      // Build email content based on whether they have assignments
      let emailBody: string;
      const emailSubject = `${monthName} ${targetYear} Schedule Published!`;

      if (volunteerShifts.length > 0) {
        // Has assignments - show their specific shifts
        const shiftsList = volunteerShifts
          .map(s => `• ${s.title} - ${s.date} at ${s.start_time} (${s.location || 'TBD'})`)
          .join('\n');

        emailBody = `Hi ${volunteer.name},

The schedule "${scheduleName}" for ${monthName} ${targetYear} has been published!

You have been assigned to the following shifts:

${shiftsList}

Please review your assignments and contact us if you have any conflicts or questions.

Thank you for your dedication!

Best regards,
VolunteerFlow Team`;
      } else {
        // No assignments - notify them the schedule is ready but they're not assigned
        emailBody = `Hi ${volunteer.name},

The schedule "${scheduleName}" for ${monthName} ${targetYear} has been published!

You are not scheduled for any shifts this month. If you believe this is an error or would like to be added to the schedule, please contact us.

You can view the complete monthly schedule in your volunteer dashboard.

Thank you!

Best regards,
VolunteerFlow Team`;
      }

      // Log the email (placeholder for actual email sending)
      console.log(`[Schedule Notification] Would send email to ${volunteer.email}:`);
      console.log(`Subject: ${emailSubject}`);
      console.log(`Body:\n${emailBody}\n`);

      emailsSent++;
    }

    // TODO: Replace console.log with actual email service integration
    // For example, using Resend, SendGrid, or Supabase Edge Functions

    return { success: true, emailsSent };
  } catch (error: any) {
    console.error('Unexpected error sending schedule notifications:', error);
    return { success: false, emailsSent: 0, error: error.message || 'Unknown error' };
  }
};
