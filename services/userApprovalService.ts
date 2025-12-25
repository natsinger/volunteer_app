import { supabase } from '../lib/supabase';

export interface PendingUser {
  id: string;
  user_id: string;
  email: string;
  provider: string;
  created_at: string;
}

/**
 * Fetches users from pending_users table
 * These are users awaiting admin approval
 */
export async function getPendingUsers(): Promise<PendingUser[]> {
  try {
    const { data, error } = await supabase
      .from('pending_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching pending users:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error getting pending users:', error);
    return [];
  }
}

/**
 * Approves a pending user as an admin
 * The database trigger will automatically remove them from pending_users
 */
export async function approveUserAsAdmin(userId: string, email: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('admins')
      .insert({
        user_id: userId,
        email: email,
      });

    if (error) {
      console.error('Error approving user as admin:', error);
      return { success: false, error: error.message };
    }

    // Trigger will automatically remove from pending_users
    return { success: true };
  } catch (error) {
    console.error('Error approving user as admin:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Approves a pending user as a volunteer with basic info
 * They will need to complete their profile after first login
 * The database trigger will automatically remove them from pending_users
 */
export async function approveUserAsVolunteer(
  userId: string,
  email: string,
  name?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('volunteers')
      .insert({
        user_id: userId,
        email: email,
        name: name || email.split('@')[0], // Use email prefix as placeholder name
        phone: '', // Will be filled in during profile completion
        role: 'NOVICE',
        skill_level: 1,
        frequency: 'Weekly',
        preferred_location: 'BOTH',
        availability_status: 'Active',
      });

    if (error) {
      console.error('Error approving user as volunteer:', error);
      return { success: false, error: error.message };
    }

    // Trigger will automatically remove from pending_users
    return { success: true };
  } catch (error) {
    console.error('Error approving user as volunteer:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Rejects a pending user by removing them from pending_users table
 * Note: This doesn't delete the auth user, just removes them from pending approval
 * If you want to delete the auth user completely, you'll need to do that manually in Supabase
 */
export async function rejectPendingUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('pending_users')
      .delete()
      .eq('user_id', userId);

    if (error) {
      console.error('Error rejecting user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Error rejecting user:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}
