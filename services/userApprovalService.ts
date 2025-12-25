import { supabase } from '../lib/supabase';

export interface PendingUser {
  id: string;
  email: string;
  created_at: string;
  email_confirmed_at: string | null;
}

/**
 * Fetches users who are in auth.users but not in admins or volunteers tables
 * These are users awaiting admin approval
 */
export async function getPendingUsers(): Promise<PendingUser[]> {
  try {
    // Get all auth users
    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

    if (usersError) {
      console.error('Error fetching auth users:', usersError);
      return [];
    }

    if (!users || users.length === 0) {
      return [];
    }

    // Get all admins
    const { data: admins, error: adminsError } = await supabase
      .from('admins')
      .select('user_id');

    if (adminsError) {
      console.error('Error fetching admins:', adminsError);
    }

    // Get all volunteers
    const { data: volunteers, error: volunteersError } = await supabase
      .from('volunteers')
      .select('user_id');

    if (volunteersError) {
      console.error('Error fetching volunteers:', volunteersError);
    }

    // Create sets of user IDs that already have roles
    const adminUserIds = new Set((admins || []).map(a => a.user_id));
    const volunteerUserIds = new Set((volunteers || []).map(v => v.user_id));

    // Filter users who don't have a role assigned
    const pendingUsers = users
      .filter(user => !adminUserIds.has(user.id) && !volunteerUserIds.has(user.id))
      .map(user => ({
        id: user.id,
        email: user.email || '',
        created_at: user.created_at,
        email_confirmed_at: user.email_confirmed_at,
      }));

    return pendingUsers;
  } catch (error) {
    console.error('Error getting pending users:', error);
    return [];
  }
}

/**
 * Approves a pending user as an admin
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

    return { success: true };
  } catch (error) {
    console.error('Error approving user as admin:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Approves a pending user as a volunteer with basic info
 * They will need to complete their profile after first login
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

    return { success: true };
  } catch (error) {
    console.error('Error approving user as volunteer:', error);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Rejects a pending user by deleting them from auth
 */
export async function rejectPendingUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.auth.admin.deleteUser(userId);

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
