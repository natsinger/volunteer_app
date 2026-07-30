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
  isPublished: dbSchedule.is_published ?? false,
});

const mapSavedScheduleToDB = (schedule: Partial<SavedSchedule>) => ({
  id: schedule.id,
  name: schedule.name,
  target_month: schedule.targetMonth,
  target_year: schedule.targetYear,
  created_at: schedule.createdAt,
  created_by: schedule.createdBy,
  notes: schedule.notes,
  is_published: schedule.isPublished ?? false,
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
 * @param isPublished - When true, the schedule will be visible to volunteers (set to true after Apply to Database)
 */
export const saveSchedule = async (
  name: string,
  targetMonth: number,
  targetYear: number,
  assignments: { shiftId: string; volunteerId: string }[],
  notes?: string,
  isPublished: boolean = false
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
          is_published: isPublished,
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
 * Update an existing schedule with new assignments
 * @param scheduleId - The ID of the schedule to update
 * @param name - Updated schedule name
 * @param assignments - New assignments to replace old ones
 * @param notes - Updated notes
 * @param isPublished - Whether the schedule should be published
 */
export const updateSchedule = async (
  scheduleId: string,
  name: string,
  assignments: { shiftId: string; volunteerId: string }[],
  notes?: string,
  isPublished: boolean = false
): Promise<{ success: boolean; scheduleId?: string; error?: string }> => {
  try {
    // Update the schedule metadata
    const { error: scheduleError } = await supabase
      .from('saved_schedules')
      .update({
        name,
        notes,
        is_published: isPublished,
      })
      .eq('id', scheduleId);

    if (scheduleError) {
      console.error('Error updating schedule:', scheduleError);
      return { success: false, error: scheduleError.message };
    }

    // Delete old assignments
    const { error: deleteError } = await supabase
      .from('saved_schedule_assignments')
      .delete()
      .eq('schedule_id', scheduleId);

    if (deleteError) {
      console.error('Error deleting old assignments:', deleteError);
      return { success: false, error: deleteError.message };
    }

    // Insert new assignments
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
      console.error('Error saving new assignments:', assignmentsError);
      return { success: false, error: assignmentsError.message };
    }

    return { success: true, scheduleId };
  } catch (error: any) {
    console.error('Unexpected error updating schedule:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Load all saved schedules (for admins)
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
 * Load only published schedules (for volunteers)
 * Only returns schedules where is_published = true
 */
export const loadPublishedSchedules = async (): Promise<{
  success: boolean;
  schedules?: SavedSchedule[];
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from('saved_schedules')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading published schedules:', error);
      return { success: false, error: error.message };
    }

    const schedules = (data || []).map(mapSavedScheduleFromDB);
    return { success: true, schedules };
  } catch (error: any) {
    console.error('Unexpected error loading published schedules:', error);
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
 * Delete all saved schedules for a specific month/year
 */
export const deleteSchedulesForMonth = async (
  targetMonth: number,
  targetYear: number
): Promise<{ success: boolean; deletedCount: number; error?: string }> => {
  try {
    // First get all schedules for this month to count them
    const { data: schedules, error: fetchError } = await supabase
      .from('saved_schedules')
      .select('id')
      .eq('target_month', targetMonth)
      .eq('target_year', targetYear);

    if (fetchError) {
      console.error('Error fetching schedules to delete:', fetchError);
      return { success: false, deletedCount: 0, error: fetchError.message };
    }

    const count = schedules?.length || 0;

    if (count === 0) {
      return { success: true, deletedCount: 0 };
    }

    // Delete all schedules for this month (CASCADE will delete assignments)
    const { error } = await supabase
      .from('saved_schedules')
      .delete()
      .eq('target_month', targetMonth)
      .eq('target_year', targetYear);

    if (error) {
      console.error('Error deleting schedules for month:', error);
      return { success: false, deletedCount: 0, error: error.message };
    }

    return { success: true, deletedCount: count };
  } catch (error: any) {
    console.error('Unexpected error deleting schedules for month:', error);
    return { success: false, deletedCount: 0, error: error.message || 'Unknown error' };
  }
};

/**
 * Unpublish all existing schedules for a specific month/year
 * This is used when applying a new schedule to ensure only the latest one is visible to volunteers
 */
export const unpublishPreviousSchedules = async (
  targetMonth: number,
  targetYear: number
): Promise<{ success: boolean; unpublishedCount: number; error?: string }> => {
  try {
    // First get all published schedules for this month to count them
    const { data: schedules, error: fetchError } = await supabase
      .from('saved_schedules')
      .select('id')
      .eq('target_month', targetMonth)
      .eq('target_year', targetYear)
      .eq('is_published', true);

    if (fetchError) {
      console.error('Error fetching schedules to unpublish:', fetchError);
      return { success: false, unpublishedCount: 0, error: fetchError.message };
    }

    const count = schedules?.length || 0;

    if (count === 0) {
      return { success: true, unpublishedCount: 0 };
    }

    // Unpublish all schedules for this month
    const { error } = await supabase
      .from('saved_schedules')
      .update({ is_published: false })
      .eq('target_month', targetMonth)
      .eq('target_year', targetYear)
      .eq('is_published', true);

    if (error) {
      console.error('Error unpublishing schedules for month:', error);
      return { success: false, unpublishedCount: 0, error: error.message };
    }

    console.log(`[ScheduleHistoryService] Unpublished ${count} previous schedule(s) for ${targetMonth}/${targetYear}`);
    return { success: true, unpublishedCount: count };
  } catch (error: any) {
    console.error('Unexpected error unpublishing schedules for month:', error);
    return { success: false, unpublishedCount: 0, error: error.message || 'Unknown error' };
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
