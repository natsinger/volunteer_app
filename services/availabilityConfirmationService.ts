// Data access for availability_confirmations: per-volunteer, per-target-month
// records that availability is up to date ('updated' = real save, 'confirmed' =
// "nothing changed" confirmation). Powers the volunteer confirm flow and the
// admin "who updated for {month}" indicator.
import { supabase } from '../lib/supabase';

export type ConfirmationSource = 'confirmed' | 'updated';

export interface AvailabilityConfirmation {
  id: string;
  volunteerId: string;
  targetMonth: number; // 1-12
  targetYear: number;
  source: ConfirmationSource;
  confirmedAt: string;
}

interface ConfirmationRow {
  id: string;
  volunteer_id: string;
  target_month: number;
  target_year: number;
  source: ConfirmationSource;
  confirmed_at: string;
}

const mapFromDB = (row: ConfirmationRow): AvailabilityConfirmation => ({
  id: row.id,
  volunteerId: row.volunteer_id,
  targetMonth: row.target_month,
  targetYear: row.target_year,
  source: row.source,
  confirmedAt: row.confirmed_at,
});

/**
 * The month volunteers are currently asked to confirm availability for:
 * always the NEXT calendar month (scheduling happens ahead of time).
 */
export const getSchedulingTargetMonth = (now: Date = new Date()): { month: number; year: number } => {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { month: next.getMonth() + 1, year: next.getFullYear() };
};

/**
 * Record that a volunteer's availability is current for a target month.
 * Upserts: a repeat confirmation refreshes confirmed_at, and a real save
 * ('updated') overwrites a prior bare confirmation.
 */
export const confirmAvailability = async (
  volunteerId: string,
  targetMonth: number,
  targetYear: number,
  source: ConfirmationSource
): Promise<{ success: boolean; error?: string }> => {
  const { error } = await supabase
    .from('availability_confirmations')
    .upsert(
      {
        volunteer_id: volunteerId,
        target_month: targetMonth,
        target_year: targetYear,
        source,
        confirmed_at: new Date().toISOString(),
      },
      { onConflict: 'volunteer_id,target_month,target_year' }
    );

  if (error) {
    console.error('[availabilityConfirmation] Failed to confirm:', error);
    return { success: false, error: error.message };
  }
  return { success: true };
};

/** The current volunteer's confirmation for a target month, if any. */
export const getMyConfirmation = async (
  volunteerId: string,
  targetMonth: number,
  targetYear: number
): Promise<AvailabilityConfirmation | null> => {
  const { data, error } = await supabase
    .from('availability_confirmations')
    .select('*')
    .eq('volunteer_id', volunteerId)
    .eq('target_month', targetMonth)
    .eq('target_year', targetYear)
    .maybeSingle();

  if (error) {
    console.error('[availabilityConfirmation] Failed to load confirmation:', error);
    return null;
  }
  return data ? mapFromDB(data as ConfirmationRow) : null;
};

/** All confirmations for a target month (admin indicator). */
export const getConfirmationsForMonth = async (
  targetMonth: number,
  targetYear: number
): Promise<AvailabilityConfirmation[]> => {
  const { data, error } = await supabase
    .from('availability_confirmations')
    .select('*')
    .eq('target_month', targetMonth)
    .eq('target_year', targetYear);

  if (error) {
    console.error('[availabilityConfirmation] Failed to load month confirmations:', error);
    return [];
  }
  return (data as ConfirmationRow[]).map(mapFromDB);
};
