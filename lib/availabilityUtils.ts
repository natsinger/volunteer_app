// Single source of truth for "can this volunteer work this shift?" preference
// checks (location, weekday, blackout dates, only-dates) and the day-code helpers
// they rely on. Used by the scheduler (services/geminiService.ts) and by both
// dashboards, so eligibility can never diverge between the algorithm and the UI.
//
// Only-dates semantics: a date the volunteer explicitly listed in `onlyDates`
// ("Days I CAN come") is authoritative — it makes them eligible on that date even
// if the weekday is not in their preferred days. When `onlyDates` is non-empty,
// all OTHER dates are ineligible regardless of weekday match. Blackout always wins.
import { Shift, Volunteer } from '../types';

/**
 * Get the day code used to match a shift against a volunteer's preferredDays.
 *
 * Codes:
 *   - '0'..'6'                          → Sun..Sat (single-slot days)
 *   - '2_morning' / '2_evening'         → Tuesday split
 *   - '5_opening' / '5_closing'         → Friday split
 *
 * For split days (2 and 5), this prefers the shift's explicit `shiftSlot`
 * tag when set, and only falls back to the legacy time-of-day heuristic
 * (Tuesday < 16:00 = morning; Friday < 14:00 = opening) when no tag exists.
 *
 * Two call shapes are supported:
 *   getShiftDayCode(shift)               // preferred — uses shiftSlot
 *   getShiftDayCode(dateStr, timeStr)    // legacy — time-based only
 */
export function getShiftDayCode(shift: Shift): string;
export function getShiftDayCode(dateStr: string, timeStr: string): string;
export function getShiftDayCode(shiftOrDate: Shift | string, timeStr?: string): string {
  // Normalize arguments
  const dateStr = typeof shiftOrDate === 'string' ? shiftOrDate : shiftOrDate.date;
  const startTime = typeof shiftOrDate === 'string' ? (timeStr ?? '') : shiftOrDate.startTime;
  const explicitSlot = typeof shiftOrDate === 'string' ? null : (shiftOrDate.shiftSlot ?? null);

  const date = new Date(dateStr);
  const day = date.getDay(); // 0 = Sunday
  const hour = parseInt(startTime.split(':')[0], 10);

  // Tuesday (Day 2) splits: morning vs evening
  if (day === 2) {
    if (explicitSlot === 'morning' || explicitSlot === 'evening') {
      return `2_${explicitSlot}`;
    }
    // Fallback: Before 16:00 = morning, 16:00+ = evening
    return hour < 16 ? '2_morning' : '2_evening';
  }

  // Friday (Day 5) splits: opening vs closing
  if (day === 5) {
    if (explicitSlot === 'opening' || explicitSlot === 'closing') {
      return `5_${explicitSlot}`;
    }
    // Fallback: Before 14:00 = opening, 14:00+ = closing
    return hour < 14 ? '5_opening' : '5_closing';
  }

  return day.toString();
}

/**
 * Whether a Friday shift is the opening or the closing one.
 * Prefers the explicit shiftSlot tag; falls back to the same start-time
 * heuristic getShiftDayCode uses (before 14:00 = opening).
 */
export const isOpeningShift = (shift: Shift): boolean =>
  shift.shiftSlot
    ? shift.shiftSlot === 'opening'
    : parseInt(shift.startTime.split(':')[0], 10) < 14;

/**
 * Get the week number for a given date (year + week-of-year, Sunday-based)
 * Used to check if two shifts are in the same week
 */
export const getWeekNumber = (dateStr: string): { year: number; week: number } => {
  const date = new Date(dateStr);
  // Get the first day of the year
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  // Calculate the number of days since the start of the year
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  // Calculate the week number
  const weekNumber = Math.ceil((days + startOfYear.getDay() + 1) / 7);
  return { year: date.getFullYear(), week: weekNumber };
};

/**
 * Check if two dates are in the same week
 */
export const areDatesInSameWeek = (date1: string, date2: string): boolean => {
  const week1 = getWeekNumber(date1);
  const week2 = getWeekNumber(date2);
  return week1.year === week2.year && week1.week === week2.week;
};

/** Why a volunteer cannot work a given shift. Empty array = eligible. */
export type EligibilityIssue = 'location' | 'day' | 'blackout' | 'not_in_only_dates';

export const ELIGIBILITY_ISSUE_LABELS: Record<EligibilityIssue, string> = {
  location: 'Location mismatch',
  day: 'Not a preferred day',
  blackout: 'Blocked date',
  not_in_only_dates: 'Not in their allowed dates',
};

/**
 * Compute every preference-based reason a volunteer cannot work a shift.
 * Does NOT check capacity or same-day/same-week constraints — those depend on
 * the rest of the schedule and are checked by the scheduler / calling UI.
 */
export const getEligibilityIssues = (volunteer: Volunteer, shift: Shift): EligibilityIssue[] => {
  const issues: EligibilityIssue[] = [];

  // Location compatibility
  if (volunteer.preferredLocation !== 'BOTH' && shift.location !== 'BOTH') {
    if (volunteer.preferredLocation !== shift.location) issues.push('location');
  }

  // Blackout dates always win, even over an explicit only-date
  if (volunteer.blackoutDates.includes(shift.date)) issues.push('blackout');

  if (volunteer.onlyDates.length > 0) {
    // Only-dates are authoritative: listed date → eligible regardless of weekday
    // preference; any other date → ineligible regardless of weekday preference.
    if (!volunteer.onlyDates.includes(shift.date)) issues.push('not_in_only_dates');
  } else {
    // Weekday preference (uses shift.shiftSlot when set, time-based fallback otherwise)
    const dayCode = getShiftDayCode(shift);
    if (!volunteer.preferredDays.includes(dayCode)) issues.push('day');
  }

  return issues;
};

/**
 * Check if a volunteer can work a specific shift based on availability preferences
 * This checks: location, day preference, blackout dates, and only dates
 * Note: This does NOT check capacity - that should be checked separately
 */
export const canVolunteerWorkShift = (volunteer: Volunteer, shift: Shift): boolean =>
  getEligibilityIssues(volunteer, shift).length === 0;
