// Effective monthly capacity: how many shifts a volunteer can realistically take
// in a given month, based on their frequency AND the shifts they are actually
// eligible for (weekday preferences, blackout dates, only-dates, location).
//
// The old flat rule (ONCE_A_WEEK = always 4) made "100% assigned" unreachable for
// anyone with a blocked week, and under-filled 5-week months. Here capacity is
// derived from the number of distinct weeks containing at least one eligible
// shift: a once-a-week volunteer in a 5-week month has capacity 5; one who
// blocked one of their 4 Wednesdays has capacity 3 and can genuinely reach 100%.
import { Shift, Volunteer } from '../types';
import { canVolunteerWorkShift, getWeekNumber } from './availabilityUtils';

/** Flat frequency ceiling: the most shifts a frequency allows in any month. */
export const getFrequencyCapacity = (frequency: string): number => {
  if (!frequency) return 0;
  const freq = frequency.toUpperCase();
  if (freq.includes('ONCE_A_WEEK') || freq === 'WEEKLY') return 4; // Approx 4 weeks in a month
  if (freq.includes('TWICE_A_MONTH')) return 2;
  if (freq.includes('ONCE_A_MONTH') || freq === 'MONTHLY') return 1;
  return 0; // Default or inactive
};

export interface EffectiveCapacityOptions {
  /** Compute capacity as if the volunteer had no blackout/only-date restrictions. */
  ignoreDateRestrictions?: boolean;
}

/** Distinct weeks (Sun-Sat) of the given shifts that contain >=1 eligible shift. */
const countEligibleWeeks = (volunteer: Volunteer, monthShifts: Shift[]): number => {
  const weeks = new Set<string>();
  for (const shift of monthShifts) {
    if (canVolunteerWorkShift(volunteer, shift)) {
      const { year, week } = getWeekNumber(shift.date);
      weeks.add(`${year}-${week}`);
    }
  }
  return weeks.size;
};

/**
 * Effective capacity for the month covered by `monthShifts` (pass only the
 * target month's shifts). The scheduler's same-week constraint means a
 * volunteer can take at most one shift per week, so eligible-week count is
 * the natural ceiling for ONCE_A_WEEK and caps the other frequencies too.
 */
export const getEffectiveCapacity = (
  volunteer: Volunteer,
  monthShifts: Shift[],
  options: EffectiveCapacityOptions = {}
): number => {
  const vol = options.ignoreDateRestrictions
    ? { ...volunteer, blackoutDates: [], onlyDates: [] }
    : volunteer;

  const frequencyCapacity = getFrequencyCapacity(vol.frequency);
  if (frequencyCapacity === 0) return 0;

  const eligibleWeeks = countEligibleWeeks(vol, monthShifts);
  const freq = (vol.frequency || '').toUpperCase();
  if (freq.includes('ONCE_A_WEEK') || freq === 'WEEKLY') {
    // One shift per eligible week — 5 in a 5-week month, fewer when weeks are blocked
    return eligibleWeeks;
  }
  return Math.min(frequencyCapacity, eligibleWeeks);
};

/**
 * True when the volunteer's own date restrictions (blackouts / only-dates)
 * zero out an otherwise workable month — the "blocked the entire month" flag.
 * Volunteers with no eligible shifts for structural reasons (frequency,
 * weekday, location) are NOT flagged.
 */
export const isMonthFullyBlocked = (volunteer: Volunteer, monthShifts: Shift[]): boolean =>
  getEffectiveCapacity(volunteer, monthShifts) === 0 &&
  getEffectiveCapacity(volunteer, monthShifts, { ignoreDateRestrictions: true }) > 0;
