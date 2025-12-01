import { supabase } from './supabase';
import { RecurringShift, Shift, DeletedShiftOccurrence } from '../types';
import { mapRecurringShiftFromDB, mapDeletedOccurrenceFromDB, mapShiftToDB } from './mappers';
import { generateShiftInstances, getMonthRange } from './recurringShiftUtils';

/**
 * Generate and save shift instances from recurring shifts for a given month
 * This ensures the shifts table is populated with actual shift records
 * that the AI scheduler can use
 */
export async function generateAndSaveShiftsForMonth(year: number, month: number): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    // Load recurring shifts
    const { data: recurringData, error: recurringError } = await supabase
      .from('recurring_shifts')
      .select('*')
      .eq('is_active', true);

    if (recurringError) throw recurringError;

    const recurringShifts = (recurringData || []).map(mapRecurringShiftFromDB);

    if (recurringShifts.length === 0) {
      return { success: true, count: 0 };
    }

    // Load deleted occurrences
    const { data: deletedData, error: deletedError } = await supabase
      .from('deleted_shift_occurrences')
      .select('*');

    if (deletedError) throw deletedError;

    const deletedOccurrences = (deletedData || []).map(mapDeletedOccurrenceFromDB);

    // Generate shift instances for the month
    const { start, end } = getMonthRange(year, month);
    const generatedShifts = generateShiftInstances(recurringShifts, deletedOccurrences, start, end);

    // Check which shifts already exist in the database
    const { data: existingShifts, error: existingError } = await supabase
      .from('shifts')
      .select('id, recurring_shift_id, date')
      .gte('date', start.toISOString().split('T')[0])
      .lte('date', end.toISOString().split('T')[0]);

    if (existingError) throw existingError;

    // Create a set of existing shift keys (recurring_shift_id + date)
    const existingKeys = new Set(
      (existingShifts || [])
        .filter(s => s.recurring_shift_id)
        .map(s => `${s.recurring_shift_id}-${s.date}`)
    );

    // Filter out shifts that already exist
    const newShifts = generatedShifts.filter(shift => {
      if (!shift.recurringShiftId || !shift.date) return false;
      const key = `${shift.recurringShiftId}-${shift.date}`;
      return !existingKeys.has(key);
    });

    if (newShifts.length === 0) {
      return { success: true, count: 0 };
    }

    // Convert to database format and remove IDs (let Supabase generate them)
    const dbShifts = newShifts.map(shift => {
      const dbShift = mapShiftToDB(shift);
      const { id, ...shiftWithoutId } = dbShift;
      return shiftWithoutId;
    });

    // Insert shifts into database
    const { error: insertError } = await supabase
      .from('shifts')
      .insert(dbShifts);

    if (insertError) throw insertError;

    return { success: true, count: newShifts.length };
  } catch (error: any) {
    console.error('Error generating shifts for month:', error);
    return { success: false, count: 0, error: error.message };
  }
}

/**
 * Generate and save shifts for the next N months
 */
export async function generateShiftsForNextMonths(monthsAhead: number = 3): Promise<{ success: boolean; totalCount: number; error?: string }> {
  let totalCount = 0;
  const today = new Date();

  for (let i = 0; i < monthsAhead; i++) {
    const targetDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth(); // 0-11

    const result = await generateAndSaveShiftsForMonth(year, month);

    if (!result.success) {
      return { success: false, totalCount, error: result.error };
    }

    totalCount += result.count;
  }

  return { success: true, totalCount };
}
