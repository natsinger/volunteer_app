import { RecurringShift, Shift, DeletedShiftOccurrence } from '../types';

/**
 * Generate shift instances from recurring shift patterns for a given date range
 */
export function generateShiftInstances(
  recurringShifts: RecurringShift[],
  deletedOccurrences: DeletedShiftOccurrence[],
  startDate: Date,
  endDate: Date
): Shift[] {
  const generatedShifts: Shift[] = [];

  // Create a set of deleted dates for quick lookup
  const deletedDatesMap = new Map<string, Set<string>>();
  deletedOccurrences.forEach(occ => {
    if (!deletedDatesMap.has(occ.recurringShiftId)) {
      deletedDatesMap.set(occ.recurringShiftId, new Set());
    }
    deletedDatesMap.get(occ.recurringShiftId)!.add(occ.deletedDate);
  });

  // For each active recurring shift
  recurringShifts.filter(rs => rs.isActive).forEach(recurringShift => {
    const deletedDates = deletedDatesMap.get(recurringShift.id) || new Set();

    // Find all dates in the range that match the day of week
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      if (currentDate.getDay() === recurringShift.dayOfWeek) {
        const dateStr = formatDate(currentDate);

        // Only create shift if not deleted
        if (!deletedDates.has(dateStr)) {
          generatedShifts.push({
            id: `generated-${recurringShift.id}-${dateStr}`,
            recurringShiftId: recurringShift.id,
            title: recurringShift.title,
            date: dateStr,
            startTime: recurringShift.startTime,
            endTime: recurringShift.endTime,
            location: recurringShift.location,
            requiredSkills: recurringShift.requiredSkills,
            assignedVolunteerId: null,
            status: 'Open',
          });
        }
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }
  });

  return generatedShifts;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get day of week name
 */
export function getDayName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] || 'Unknown';
}

/**
 * Get short day of week name
 */
export function getShortDayName(dayOfWeek: number): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[dayOfWeek] || '?';
}

/**
 * Get the start and end dates for a given month
 */
export function getMonthRange(year: number, month: number): { start: Date; end: Date } {
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return { start, end };
}

/**
 * Merge generated shifts with actual assigned shifts from database
 * Assigned shifts from DB take precedence over generated ones
 */
export function mergeShifts(generatedShifts: Shift[], dbShifts: Shift[]): Shift[] {
  const dbShiftsMap = new Map<string, Shift>();

  // Index DB shifts by recurring_shift_id + date
  dbShifts.forEach(shift => {
    if (shift.recurringShiftId && shift.date) {
      const key = `${shift.recurringShiftId}-${shift.date}`;
      dbShiftsMap.set(key, shift);
    }
  });

  // Replace generated shifts with actual DB shifts where they exist
  const mergedShifts = generatedShifts.map(genShift => {
    if (genShift.recurringShiftId && genShift.date) {
      const key = `${genShift.recurringShiftId}-${genShift.date}`;
      return dbShiftsMap.get(key) || genShift;
    }
    return genShift;
  });

  return mergedShifts;
}
