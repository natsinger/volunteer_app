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
