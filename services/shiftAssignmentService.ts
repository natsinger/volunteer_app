import { supabase } from '../lib/supabase';
import { ShiftAssignment, ShiftSwitchRequest } from '../types';
import { mapShiftAssignmentFromDB, mapShiftAssignmentToDB, mapShiftSwitchRequestFromDB, mapShiftSwitchRequestToDB } from '../lib/mappers';

/**
 * Apply schedule assignments to the database
 * This creates shift_assignment records for each volunteer-shift pair
 */
export const applyScheduleAssignments = async (
  assignments: Array<{ shiftId: string; volunteerId: string }>
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Map to database format
    const assignmentRecords = assignments.map(a => ({
      shift_id: a.shiftId,
      volunteer_id: a.volunteerId,
      status: 'assigned'
    }));

    // Insert assignments (using upsert to handle duplicates)
    const { error } = await supabase
      .from('shift_assignments')
      .upsert(assignmentRecords, {
        onConflict: 'shift_id,volunteer_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('Error applying assignments:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception applying assignments:', err);
    return { success: false, error: String(err) };
  }
};

/**
 * Clear all assignments for a specific month
 */
export const clearMonthAssignments = async (
  shiftIds: string[]
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .in('shift_id', shiftIds);

    if (error) {
      console.error('Error clearing assignments:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception clearing assignments:', err);
    return { success: false, error: String(err) };
  }
};

/**
 * Get all assignments for specific shifts
 */
export const getShiftAssignments = async (
  shiftIds: string[]
): Promise<ShiftAssignment[]> => {
  try {
    const { data, error } = await supabase
      .from('shift_assignments')
      .select('*')
      .in('shift_id', shiftIds)
      .eq('status', 'assigned');

    if (error) {
      console.error('Error fetching assignments:', error);
      return [];
    }

    return (data || []).map(mapShiftAssignmentFromDB);
  } catch (err) {
    console.error('Exception fetching assignments:', err);
    return [];
  }
};

/**
 * Get all assignments for a specific volunteer
 */
export const getVolunteerAssignments = async (
  volunteerId: string
): Promise<ShiftAssignment[]> => {
  try {
    const { data, error } = await supabase
      .from('shift_assignments')
      .select('*')
      .eq('volunteer_id', volunteerId)
      .eq('status', 'assigned')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching volunteer assignments:', error);
      return [];
    }

    return (data || []).map(mapShiftAssignmentFromDB);
  } catch (err) {
    console.error('Exception fetching volunteer assignments:', err);
    return [];
  }
};

/**
 * Add a single volunteer to a shift
 */
export const addVolunteerToShift = async (
  shiftId: string,
  volunteerId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('shift_assignments')
      .insert({
        shift_id: shiftId,
        volunteer_id: volunteerId,
        status: 'assigned'
      });

    if (error) {
      console.error('Error adding volunteer to shift:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception adding volunteer to shift:', err);
    return { success: false, error: String(err) };
  }
};

/**
 * Remove a volunteer from a shift
 */
export const removeVolunteerFromShift = async (
  shiftId: string,
  volunteerId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('shift_assignments')
      .delete()
      .eq('shift_id', shiftId)
      .eq('volunteer_id', volunteerId);

    if (error) {
      console.error('Error removing volunteer from shift:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception removing volunteer from shift:', err);
    return { success: false, error: String(err) };
  }
};

/**
 * Create a shift switch request
 */
export const createSwitchRequest = async (
  shiftId: string,
  requestingVolunteerId: string,
  targetVolunteerId: string | null,
  message: string | null
): Promise<{ success: boolean; error?: string; requestId?: string }> => {
  try {
    const { data, error } = await supabase
      .from('shift_switch_requests')
      .insert({
        shift_id: shiftId,
        requesting_volunteer_id: requestingVolunteerId,
        target_volunteer_id: targetVolunteerId,
        message: message,
        status: 'pending'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating switch request:', error);
      return { success: false, error: error.message };
    }

    return { success: true, requestId: data.id };
  } catch (err) {
    console.error('Exception creating switch request:', err);
    return { success: false, error: String(err) };
  }
};

/**
 * Get all pending switch requests (for admin or volunteer dashboard)
 */
export const getPendingSwitchRequests = async (): Promise<ShiftSwitchRequest[]> => {
  try {
    const { data, error } = await supabase
      .from('shift_switch_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching switch requests:', error);
      return [];
    }

    return (data || []).map(mapShiftSwitchRequestFromDB);
  } catch (err) {
    console.error('Exception fetching switch requests:', err);
    return [];
  }
};

/**
 * Get switch requests for a specific volunteer
 */
export const getVolunteerSwitchRequests = async (
  volunteerId: string
): Promise<ShiftSwitchRequest[]> => {
  try {
    const { data, error } = await supabase
      .from('shift_switch_requests')
      .select('*')
      .or(`requesting_volunteer_id.eq.${volunteerId},target_volunteer_id.eq.${volunteerId}`)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching volunteer switch requests:', error);
      return [];
    }

    return (data || []).map(mapShiftSwitchRequestFromDB);
  } catch (err) {
    console.error('Exception fetching volunteer switch requests:', err);
    return [];
  }
};

/**
 * Accept a switch request (admin or target volunteer)
 * This removes the requesting volunteer and adds the target volunteer
 */
export const acceptSwitchRequest = async (
  requestId: string,
  resolvedBy: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Get the request details
    const { data: request, error: fetchError } = await supabase
      .from('shift_switch_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return { success: false, error: 'Request not found' };
    }

    // Update the request status
    const { error: updateError } = await supabase
      .from('shift_switch_requests')
      .update({
        status: 'accepted',
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy
      })
      .eq('id', requestId);

    if (updateError) {
      return { success: false, error: updateError.message };
    }

    // If there's a target volunteer, perform the switch
    if (request.target_volunteer_id) {
      // Remove requesting volunteer
      await removeVolunteerFromShift(request.shift_id, request.requesting_volunteer_id);

      // Add target volunteer
      await addVolunteerToShift(request.shift_id, request.target_volunteer_id);
    } else {
      // If no target, just remove the requesting volunteer
      await removeVolunteerFromShift(request.shift_id, request.requesting_volunteer_id);
    }

    return { success: true };
  } catch (err) {
    console.error('Exception accepting switch request:', err);
    return { success: false, error: String(err) };
  }
};

/**
 * Reject a switch request
 */
export const rejectSwitchRequest = async (
  requestId: string,
  resolvedBy: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('shift_switch_requests')
      .update({
        status: 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: resolvedBy
      })
      .eq('id', requestId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception rejecting switch request:', err);
    return { success: false, error: String(err) };
  }
};

/**
 * Cancel a switch request (by requesting volunteer)
 */
export const cancelSwitchRequest = async (
  requestId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('shift_switch_requests')
      .update({
        status: 'cancelled'
      })
      .eq('id', requestId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Exception cancelling switch request:', err);
    return { success: false, error: String(err) };
  }
};
