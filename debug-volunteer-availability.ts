/**
 * Debug utility to diagnose why volunteers show 0 possible shifts
 * Run this in the browser console while on the admin dashboard
 */

import { Volunteer, Shift } from './types';
import { getShiftDayCode, canVolunteerWorkShift } from './services/geminiService';

export function debugVolunteerAvailability(
  volunteers: Volunteer[],
  shifts: Shift[],
  targetMonth: number,
  targetYear: number
) {
  console.log('\n=== VOLUNTEER AVAILABILITY DEBUG ===\n');

  // Filter active volunteers and target shifts
  const activeVolunteers = volunteers.filter(v => v.availabilityStatus === 'Active');
  const targetShifts = shifts.filter(s => {
    const d = new Date(s.date);
    return s.status === 'Open' &&
           d.getMonth() + 1 === targetMonth &&
           d.getFullYear() === targetYear;
  });

  console.log(`Active Volunteers: ${activeVolunteers.length}`);
  console.log(`Target Shifts: ${targetShifts.length} (${targetMonth}/${targetYear})\n`);

  // Check each volunteer
  activeVolunteers.forEach((volunteer, index) => {
    console.log(`\n--- Volunteer ${index + 1}: ${volunteer.name} ---`);
    console.log(`ID: ${volunteer.id}`);
    console.log(`Location: ${volunteer.preferredLocation}`);
    console.log(`Preferred Days:`, volunteer.preferredDays);
    console.log(`  - Is array? ${Array.isArray(volunteer.preferredDays)}`);
    console.log(`  - Length: ${volunteer.preferredDays ? volunteer.preferredDays.length : 'NULL'}`);
    console.log(`  - Values: ${volunteer.preferredDays ? JSON.stringify(volunteer.preferredDays) : 'NULL'}`);
    console.log(`Blackout Dates: ${volunteer.blackoutDates.length} date(s)`);
    console.log(`Only Dates: ${volunteer.onlyDates.length} date(s)`);

    // Check compatibility with each shift
    let compatibleShifts = 0;
    const incompatibilityReasons: { [key: string]: number } = {
      'Location mismatch': 0,
      'Day not preferred': 0,
      'Blackout date': 0,
      'Not in only_dates': 0
    };

    targetShifts.forEach(shift => {
      const dayCode = getShiftDayCode(shift.date, shift.startTime);

      // Check each condition individually
      let canWork = true;
      let reason = '';

      // Location check
      if (volunteer.preferredLocation !== 'BOTH' && shift.location !== 'BOTH') {
        if (volunteer.preferredLocation !== shift.location) {
          canWork = false;
          reason = 'Location mismatch';
          incompatibilityReasons['Location mismatch']++;
        }
      }

      // Day preference check
      if (canWork && !volunteer.preferredDays.includes(dayCode)) {
        canWork = false;
        reason = 'Day not preferred';
        incompatibilityReasons['Day not preferred']++;

        // Extra debugging for day mismatch
        if (index === 0) { // Only show details for first volunteer to avoid spam
          console.log(`  ⚠️ Shift "${shift.title}" on ${shift.date} at ${shift.startTime}`);
          console.log(`     Calculated day code: "${dayCode}"`);
          console.log(`     Volunteer's preferred days: ${JSON.stringify(volunteer.preferredDays)}`);
          console.log(`     Includes check result: ${volunteer.preferredDays.includes(dayCode)}`);
        }
      }

      // Blackout check
      if (canWork && volunteer.blackoutDates.includes(shift.date)) {
        canWork = false;
        reason = 'Blackout date';
        incompatibilityReasons['Blackout date']++;
      }

      // Only dates check
      if (canWork && volunteer.onlyDates.length > 0 && !volunteer.onlyDates.includes(shift.date)) {
        canWork = false;
        reason = 'Not in only_dates';
        incompatibilityReasons['Not in only_dates']++;
      }

      if (canWork) {
        compatibleShifts++;
      }
    });

    console.log(`\n  ✅ Can work ${compatibleShifts}/${targetShifts.length} shifts`);

    if (compatibleShifts === 0) {
      console.log(`  ❌ PROBLEM: This volunteer has ZERO compatible shifts!`);
      console.log(`  Reasons for incompatibility:`);
      Object.entries(incompatibilityReasons).forEach(([reason, count]) => {
        if (count > 0) {
          console.log(`    - ${reason}: ${count} shifts`);
        }
      });
    } else if (compatibleShifts < targetShifts.length) {
      console.log(`  Reasons for incompatibility with some shifts:`);
      Object.entries(incompatibilityReasons).forEach(([reason, count]) => {
        if (count > 0) {
          console.log(`    - ${reason}: ${count} shifts`);
        }
      });
    }
  });

  // Sample of shifts and their day codes
  console.log(`\n\n=== SAMPLE SHIFTS AND DAY CODES ===\n`);
  targetShifts.slice(0, 5).forEach(shift => {
    const dayCode = getShiftDayCode(shift.date, shift.startTime);
    const shiftDate = new Date(shift.date);
    const dayOfWeek = shiftDate.getDay();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    console.log(`Shift: ${shift.title}`);
    console.log(`  Date: ${shift.date} (${dayNames[dayOfWeek]})`);
    console.log(`  Time: ${shift.startTime} - ${shift.endTime}`);
    console.log(`  Location: ${shift.location}`);
    console.log(`  Calculated day code: "${dayCode}"`);
    console.log(``);
  });

  // Summary
  const volunteersWithZeroShifts = activeVolunteers.filter(v => {
    return !targetShifts.some(s => canVolunteerWorkShift(v, s));
  }).length;

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total active volunteers: ${activeVolunteers.length}`);
  console.log(`Volunteers with ZERO compatible shifts: ${volunteersWithZeroShifts}`);
  console.log(`Volunteers with at least one compatible shift: ${activeVolunteers.length - volunteersWithZeroShifts}`);

  if (volunteersWithZeroShifts > 0) {
    console.log(`\n⚠️ WARNING: ${volunteersWithZeroShifts} volunteer(s) cannot work ANY shifts!`);
    console.log(`This will result in "0 possible shifts" in the scheduler statistics.`);
    console.log(`\nMost common causes:`);
    console.log(`1. Empty preferredDays array - check if day preferences were saved correctly`);
    console.log(`2. Location mismatch - volunteer location doesn't match any shift locations`);
    console.log(`3. All shifts on blackout dates`);
    console.log(`4. only_dates set but no shifts match those specific dates`);
  }
}
