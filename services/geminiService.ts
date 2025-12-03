import { GoogleGenAI, Type } from "@google/genai";
import { Shift, Volunteer } from "../types";

// Access Vite environment variable correctly
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

// Helper to determine monthly capacity based on frequency string
export const getMonthlyCapacity = (frequency: string): number => {
  if (!frequency) return 0;
  const freq = frequency.toUpperCase();
  if (freq.includes('ONCE_A_WEEK')) return 4; // Approx 4 weeks in a month
  if (freq.includes('TWICE_A_MONTH')) return 2;
  if (freq.includes('ONCE_A_MONTH')) return 1;
  return 0; // Default or inactive
};

// Helper to get the specific day code (0, 1, 2_morning, 2_evening, etc.)
const getShiftDayCode = (dateStr: string, timeStr: string): string => {
  const date = new Date(dateStr);
  const day = date.getDay(); // 0 = Sunday
  
  // Specific logic for Tuesday (Day 2) splits
  if (day === 2) {
    const hour = parseInt(timeStr.split(':')[0], 10);
    // Assuming evening starts after 16:00 (4 PM)
    return hour < 16 ? '2_morning' : '2_evening';
  }
  
  return day.toString();
};

/**
 * Enforce strict capacity limits on assignments
 * Removes excess assignments if any volunteer exceeds their capacity
 */
function enforceCapacityLimits(
  assignments: Array<{shiftId: string, volunteerId: string, reasoning?: string}>,
  volunteers: Volunteer[],
  shifts: Shift[]
): Array<{shiftId: string, volunteerId: string, reasoning?: string}> {

  // Create capacity map
  const capacityMap = new Map<string, number>();
  volunteers.forEach(v => {
    capacityMap.set(v.id, getMonthlyCapacity(v.frequency));
  });

  // Count assignments per volunteer
  const assignmentCounts = new Map<string, number>();
  const validAssignments: typeof assignments = [];

  // Sort shifts by date to prioritize earlier shifts
  const shiftDateMap = new Map<string, string>();
  shifts.forEach(s => shiftDateMap.set(s.id, s.date));

  const sortedAssignments = [...assignments].sort((a, b) => {
    const dateA = shiftDateMap.get(a.shiftId) || '';
    const dateB = shiftDateMap.get(b.shiftId) || '';
    return dateA.localeCompare(dateB);
  });

  // Process assignments in order, enforcing capacity
  for (const assignment of sortedAssignments) {
    const volunteerId = assignment.volunteerId;
    const capacity = capacityMap.get(volunteerId) || 0;
    const currentCount = assignmentCounts.get(volunteerId) || 0;

    if (currentCount < capacity) {
      validAssignments.push(assignment);
      assignmentCounts.set(volunteerId, currentCount + 1);
    } else {
      console.warn(`Skipping assignment for ${volunteerId}: already at capacity (${capacity})`);
    }
  }

  // Log enforcement results
  console.log('Capacity Enforcement Results:');
  assignmentCounts.forEach((count, volunteerId) => {
    const capacity = capacityMap.get(volunteerId) || 0;
    const volunteer = volunteers.find(v => v.id === volunteerId);
    console.log(`  ${volunteer?.name}: ${count}/${capacity} assignments`);
  });

  const removed = assignments.length - validAssignments.length;
  if (removed > 0) {
    console.warn(`Removed ${removed} assignments that exceeded capacity limits`);
  }

  return validAssignments;
}

export const generateScheduleAI = async (
  volunteers: Volunteer[],
  shifts: Shift[],
  targetMonth: number, // 1-12
  targetYear: number
) => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  // Filter only active volunteers
  const activeVolunteers = volunteers.filter(v => v.availabilityStatus === 'Active');

  // Filter open shifts SPECIFICALLY for the target month and year
  const targetShifts = shifts.filter(s => {
    const d = new Date(s.date);
    return s.status === 'Open' &&
           d.getMonth() + 1 === targetMonth &&
           d.getFullYear() === targetYear;
  });

  if (activeVolunteers.length === 0) {
    throw new Error("No active volunteers found.");
  }

  if (targetShifts.length === 0) {
    throw new Error(`No open shifts found for ${targetMonth}/${targetYear}. Please check your shift calendar.`);
  }

  // Prepare enriched data for the AI
  const enrichedVolunteers = activeVolunteers.map(v => ({
    id: v.id,
    name: v.name,
    monthlyCapacity: getMonthlyCapacity(v.frequency),
    preferredLocation: v.preferredLocation,
    preferredDays: v.preferredDays,
    blackoutDates: v.blackoutDates,
    onlyDates: v.onlyDates
  }));

  const enrichedShifts = targetShifts.map(s => ({
    id: s.id,
    dayCode: getShiftDayCode(s.date, s.startTime),
    date: s.date,
    time: s.startTime,
    location: s.location || 'BOTH', // Use actual shift location field
  }));

/**
 * Deterministic scheduling algorithm that fills ALL shifts
 * Prioritizes novices first, saves experts for last
 * Does multiple passes until all shifts are filled or no capacity remains
 */
function scheduleShiftsMultiPass(
  volunteers: Volunteer[],
  shifts: Shift[]
): Array<{ shiftId: string; volunteerId: string; reasoning: string }> {
  const assignments: Array<{ shiftId: string; volunteerId: string; reasoning: string }> = [];

  // ---- Basic tracking ----
  const capacityUsed = new Map<string, number>();
  const shiftAssignments = new Map<string, string[]>();
  const shiftExpertsCount = new Map<string, number>(); // skillLevel >= 2
  const shiftNovicesCount = new Map<string, number>(); // skillLevel === 1
  const weeklyUsage = new Map<string, Set<number>>(); // volunteerId -> set of week indices
  const volunteerDateTimes = new Map<string, Set<string>>(); // volunteerId -> set of "date|time"

  // Index volunteers by id for quick lookup
  const volunteerById = new Map<string, Volunteer>();
  volunteers.forEach((v) => {
    volunteerById.set(v.id, v);
    capacityUsed.set(v.id, 0);
    weeklyUsage.set(v.id, new Set());
    volunteerDateTimes.set(v.id, new Set());
  });

  // Initialize per-shift tracking
  const dateTimeByShift = new Map<string, string>();
  shifts.forEach((s) => {
    shiftAssignments.set(s.id, []);
    shiftExpertsCount.set(s.id, 0);
    shiftNovicesCount.set(s.id, 0);
    dateTimeByShift.set(s.id, `${s.date}|${s.startTime}`);
  });

  // ---- Helper: compute week index (1-based) for a date, Sunday–Saturday weeks ----
  const getWeekIndex = (dateStr: string): number => {
    const [yearStr, monthStr, dayStr] = dateStr.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr) - 1; // JS Date month is 0-based
    const day = Number(dayStr);

    const date = new Date(year, month, day);
    const weekday = date.getDay(); // 0=Sun..6=Sat

    // Sunday starting this week
    const sundayThisWeek = new Date(date);
    sundayThisWeek.setDate(date.getDate() - weekday);

    // Week 1 is the Sunday–Saturday block that contains the 1st of the month
    const firstOfMonth = new Date(year, month, 1);
    const firstOfMonthWeekday = firstOfMonth.getDay();
    const week1Sunday = new Date(firstOfMonth);
    week1Sunday.setDate(firstOfMonth.getDate() - firstOfMonthWeekday);

    const diffMs = sundayThisWeek.getTime() - week1Sunday.getTime();
    const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks + 1;
  };

  // ---- Helper: static eligibility (ignores current capacity, weekly usage, double-booking) ----
  const isStaticallyEligible = (volunteer: Volunteer, shift: Shift): boolean => {
    // Location
    if (volunteer.preferredLocation !== 'BOTH' && shift.location !== 'BOTH') {
      if (volunteer.preferredLocation !== shift.location) return false;
    }

    // Day preference
    const dayCode = getShiftDayCode(shift.date, shift.startTime);
    if (!volunteer.preferredDays.includes(dayCode)) return false;

    // Blackout dates
    if (volunteer.blackoutDates.includes(shift.date)) return false;

    // Only dates
    if (volunteer.onlyDates.length > 0 && !volunteer.onlyDates.includes(shift.date)) {
      return false;
    }

    return true;
  };

  // ---- Helper: full check if volunteer can be assigned to this shift right now ----
  const canAssignToShift = (volunteer: Volunteer, shift: Shift): boolean => {
    const used = capacityUsed.get(volunteer.id) || 0;
    const capacity = getMonthlyCapacity(volunteer.frequency);

    // Capacity limit
    if (used >= capacity) return false;

    // Static eligibility first (location, day, blackout, only-dates)
    if (!isStaticallyEligible(volunteer, shift)) return false;

    // Weekly constraint for ONCE_A_WEEK
    if (volunteer.frequency === 'ONCE_A_WEEK') {
      const weekIndex = getWeekIndex(shift.date);
      const weeks = weeklyUsage.get(volunteer.id)!;
      if (weeks.has(weekIndex)) return false;
    }

    // Double-booking: same date+time not allowed
    const dtKey = dateTimeByShift.get(shift.id)!;
    const dtSet = volunteerDateTimes.get(volunteer.id)!;
    if (dtSet.has(dtKey)) return false;

    // Shift capacity
    const currentAssignees = shiftAssignments.get(shift.id)!;
    if (currentAssignees.length >= 5) return false;

    return true;
  };

  // ---- Precompute feasible shifts per volunteer (static) ----
  const feasibleShiftsByVolunteer = new Map<string, Shift[]>();
  const feasibleCountByVolunteer = new Map<string, number>();

  for (const v of volunteers) {
    const feasible: Shift[] = [];
    for (const s of shifts) {
      if (isStaticallyEligible(v, s)) {
        feasible.push(s);
      }
    }
    feasibleShiftsByVolunteer.set(v.id, feasible);
    feasibleCountByVolunteer.set(v.id, feasible.length);
  }

  // ---- Utility: assignment operation ----
  const assignVolunteerToShift = (
    volunteer: Volunteer,
    shift: Shift,
    phaseLabel: string
  ) => {
    const currentAssignees = shiftAssignments.get(shift.id)!;
    currentAssignees.push(volunteer.id);
    shiftAssignments.set(shift.id, currentAssignees);

    // Update counts
    const used = capacityUsed.get(volunteer.id) || 0;
    capacityUsed.set(volunteer.id, used + 1);

    if (volunteer.frequency === 'ONCE_A_WEEK') {
      const weekIndex = getWeekIndex(shift.date);
      const weeks = weeklyUsage.get(volunteer.id)!;
      weeks.add(weekIndex);
      weeklyUsage.set(volunteer.id, weeks);
    }

    const dtKey = dateTimeByShift.get(shift.id)!;
    const dtSet = volunteerDateTimes.get(volunteer.id)!;
    dtSet.add(dtKey);
    volunteerDateTimes.set(volunteer.id, dtSet);

    if (volunteer.skillLevel >= 2) {
      shiftExpertsCount.set(shift.id, (shiftExpertsCount.get(shift.id) || 0) + 1);
    } else if (volunteer.skillLevel === 1) {
      shiftNovicesCount.set(shift.id, (shiftNovicesCount.get(shift.id) || 0) + 1);
    }

    assignments.push({
      shiftId: shift.id,
      volunteerId: volunteer.id,
      reasoning: `${phaseLabel}: ${volunteer.name} (skill ${volunteer.skillLevel}) assigned to ${shift.date}`,
    });
  };

  const hasCapacityLeft = (v: Volunteer): boolean => {
    const used = capacityUsed.get(v.id) || 0;
    const capacity = getMonthlyCapacity(v.frequency);
    return used < capacity;
  };

  console.log('=== Phase 0: Feasibility & volunteer overview ===');
  volunteers.forEach((v) => {
    const feasibleCount = feasibleCountByVolunteer.get(v.id) || 0;
    const cap = getMonthlyCapacity(v.frequency);
    const skillLabel =
      v.skillLevel === 1 ? 'NOVICE' : v.skillLevel === 2 ? 'EXPERT' : 'SENIOR';
    console.log(
      `  ${v.name} (${skillLabel}, freq: ${v.frequency}, cap: ${cap}, feasible shifts: ${feasibleCount})`
    );
  });

  // ---- Phase 1: Experienced Backbone (skillLevel >= 2) ----
  console.log('\n=== Phase 1: Experienced backbone (experts & seniors) ===');
  const experiencedVols = volunteers.filter((v) => v.skillLevel >= 2);
  const sortedExperienced = [...experiencedVols].sort((a, b) => {
    const fa = feasibleCountByVolunteer.get(a.id) || 0;
    const fb = feasibleCountByVolunteer.get(b.id) || 0;
    if (fa !== fb) return fa - fb; // more constrained first
    const capA = getMonthlyCapacity(a.frequency);
    const capB = getMonthlyCapacity(b.frequency);
    return capA - capB; // lower capacity first
  });

  for (const v of sortedExperienced) {
    console.log(
      `  Considering ${v.name} (skill ${v.skillLevel}, feasible: ${
        feasibleCountByVolunteer.get(v.id) || 0
      })`
    );
    let assignedSomething = true;
    while (hasCapacityLeft(v) && assignedSomething) {
      assignedSomething = false;

      const feasibleShifts = feasibleShiftsByVolunteer.get(v.id) || [];
      const candidateShifts = feasibleShifts.filter((s) => canAssignToShift(v, s));

      if (candidateShifts.length === 0) break;

      // Prefer shifts with no expert yet, then lowest currentAssignments, then earliest date
      let bestShift: Shift | null = null;
      for (const s of candidateShifts) {
        const experts = shiftExpertsCount.get(s.id) || 0;
        const assignees = shiftAssignments.get(s.id)!.length;
        if (!bestShift) {
          bestShift = s;
          continue;
        }
        const bestExperts = shiftExpertsCount.get(bestShift.id) || 0;
        const bestAssignees = shiftAssignments.get(bestShift.id)!.length;

        if (experts === 0 && bestExperts > 0) {
          bestShift = s;
        } else if (experts === bestExperts) {
          if (assignees < bestAssignees) {
            bestShift = s;
          } else if (assignees === bestAssignees) {
            if (s.date < bestShift.date) bestShift = s;
          }
        }
      }

      if (bestShift) {
        assignVolunteerToShift(v, bestShift, 'Phase 1 (Backbone)');
        assignedSomething = true;
      }
    }
  }

  // ---- Phase 2: Novice Priority (skillLevel === 1) ----
  console.log('\n=== Phase 2: Novice priority ===');
  const noviceVols = volunteers.filter((v) => v.skillLevel === 1);
  const sortedNovices = [...noviceVols].sort((a, b) => {
    const fa = feasibleCountByVolunteer.get(a.id) || 0;
    const fb = feasibleCountByVolunteer.get(b.id) || 0;
    if (fa !== fb) return fa - fb; // more constrained first
    const capA = getMonthlyCapacity(a.frequency);
    const capB = getMonthlyCapacity(b.frequency);
    return capA - capB; // lower capacity first
  });

  for (const v of sortedNovices) {
    console.log(
      `  Considering novice ${v.name} (feasible: ${
        feasibleCountByVolunteer.get(v.id) || 0
      })`
    );
    let assignedSomething = true;
    while (hasCapacityLeft(v) && assignedSomething) {
      assignedSomething = false;

      const feasibleShifts = feasibleShiftsByVolunteer.get(v.id) || [];
      const candidateShifts = feasibleShifts.filter((s) => canAssignToShift(v, s));
      if (candidateShifts.length === 0) break;

      // Prefer shifts that already have an expert
      const withExpert = candidateShifts.filter(
        (s) => (shiftExpertsCount.get(s.id) || 0) >= 1
      );
      const pool = withExpert.length > 0 ? withExpert : candidateShifts;

      let bestShift: Shift | null = null;
      for (const s of pool) {
        const assignees = shiftAssignments.get(s.id)!.length;
        if (!bestShift) {
          bestShift = s;
          continue;
        }
        const bestAssignees = shiftAssignments.get(bestShift.id)!.length;

        if (assignees < bestAssignees) {
          bestShift = s;
        } else if (assignees === bestAssignees) {
          if (s.date < bestShift.date) bestShift = s;
        }
      }

      if (bestShift) {
        assignVolunteerToShift(v, bestShift, 'Phase 2 (Novice priority)');
        assignedSomething = true;
      }
    }
  }

  // ---- Phase 3: Fair fill (all volunteers, still respecting all constraints) ----
  console.log('\n=== Phase 3: Fair fill (all volunteers) ===');
  const poolVolunteers = volunteers.filter((v) => {
    const feasible = feasibleCountByVolunteer.get(v.id) || 0;
    return feasible > 0 && hasCapacityLeft(v);
  });

  const sortedPool = [...poolVolunteers].sort((a, b) => {
    const fa = feasibleCountByVolunteer.get(a.id) || 0;
    const fb = feasibleCountByVolunteer.get(b.id) || 0;
    if (fa !== fb) return fa - fb; // more constrained first

    const usedA = capacityUsed.get(a.id) || 0;
    const usedB = capacityUsed.get(b.id) || 0;
    const capA = getMonthlyCapacity(a.frequency);
    const capB = getMonthlyCapacity(b.frequency);
    const remainingA = capA - usedA;
    const remainingB = capB - usedB;
    return remainingB - remainingA; // those with more remaining capacity first
  });

  let madeAssignment = true;
  let passCount = 0;
  while (madeAssignment) {
    madeAssignment = false;
    passCount++;
    console.log(`  Phase 3 pass ${passCount}`);

    for (const v of sortedPool) {
      if (!hasCapacityLeft(v)) continue;

      const feasibleShifts = feasibleShiftsByVolunteer.get(v.id) || [];
      const candidateShifts = feasibleShifts.filter((s) => canAssignToShift(v, s));
      if (candidateShifts.length === 0) continue;

      let bestShift: Shift | null = null;

      for (const s of candidateShifts) {
        const assignees = shiftAssignments.get(s.id)!.length;
        const experts = shiftExpertsCount.get(s.id) || 0;

        if (!bestShift) {
          bestShift = s;
          continue;
        }

        const bestAssignees = shiftAssignments.get(bestShift.id)!.length;
        const bestExperts = shiftExpertsCount.get(bestShift.id) || 0;

        // For novices: prefer shifts with experts; for experts, prefer shifts lacking experts
        if (v.skillLevel === 1) {
          const sHasExpert = experts > 0;
          const bestHasExpert = bestExperts > 0;
          if (sHasExpert && !bestHasExpert) {
            bestShift = s;
            continue;
          }
          if (sHasExpert === bestHasExpert) {
            if (assignees < bestAssignees) {
              bestShift = s;
            } else if (assignees === bestAssignees && s.date < bestShift.date) {
              bestShift = s;
            }
          }
        } else {
          // expert/senior: prefer shifts with fewer experts
          if (experts < bestExperts) {
            bestShift = s;
          } else if (experts === bestExperts) {
            if (assignees < bestAssignees) {
              bestShift = s;
            } else if (assignees === bestAssignees && s.date < bestShift.date) {
              bestShift = s;
            }
          }
        }
      }

      if (bestShift) {
        assignVolunteerToShift(v, bestShift, 'Phase 3 (Fair fill)');
        madeAssignment = true;
      }
    }

    if (passCount > 30) {
      console.warn('Phase 3: reached safety pass limit (30), stopping.');
      break;
    }
  }

  // ---- Final reporting (similar to your original) ----
  console.log('\n=== Final Results ===');
  console.log(`Total assignments: ${assignments.length}`);
  console.log('\nUtilization per volunteer:');

  let totalCapacity = 0;
  let totalUsed = 0;

  capacityUsed.forEach((used, volId) => {
    const volunteer = volunteerById.get(volId);
    const capacity = getMonthlyCapacity(volunteer?.frequency || '');
    totalCapacity += capacity;
    totalUsed += used;

    const skillLabel =
      volunteer?.skillLevel === 1
        ? 'NOVICE'
        : volunteer?.skillLevel === 2
        ? 'EXPERT'
        : 'SENIOR';
    const percentage = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
    console.log(`  ${volunteer?.name} (${skillLabel}): ${used}/${capacity} (${percentage}%)`);
  });

  const overallUtilization = totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0;
  console.log(`\nOverall utilization: ${totalUsed}/${totalCapacity} (${overallUtilization}%)`);

  console.log('\nShift coverage:');
  let emptyShifts = 0;
  let wellStaffed = 0;
  shifts.forEach((shift) => {
    const assignees = shiftAssignments.get(shift.id)!;
    if (assignees.length === 0) emptyShifts++;
    if (assignees.length >= 3) wellStaffed++;
  });
  console.log(`  ${wellStaffed}/${shifts.length} shifts well-staffed (3+ volunteers)`);
  console.log(`  ${shifts.length - emptyShifts}/${shifts.length} shifts covered (1+ volunteers)`);
  console.log(`  ${emptyShifts} shifts remain empty`);

  return assignments;
}

export const generateScheduleAI = async (
  volunteers: Volunteer[],
  shifts: Shift[],
  targetMonth: number, // 1-12
  targetYear: number
) => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  // Filter only active volunteers
  const activeVolunteers = volunteers.filter(v => v.availabilityStatus === 'Active');

  // Filter open shifts SPECIFICALLY for the target month and year
  const targetShifts = shifts.filter(s => {
    const d = new Date(s.date);
    return s.status === 'Open' &&
           d.getMonth() + 1 === targetMonth &&
           d.getFullYear() === targetYear;
  });

  if (activeVolunteers.length === 0) {
    throw new Error("No active volunteers found.");
  }

  if (targetShifts.length === 0) {
    throw new Error(`No open shifts found for ${targetMonth}/${targetYear}. Please check your shift calendar.`);
  }

  console.log(`\n🔄 Starting deterministic scheduling:`);
  console.log(`  Volunteers: ${activeVolunteers.length} active`);
  console.log(`  Shifts: ${targetShifts.length} open shifts`);

  // Use deterministic multi-pass algorithm instead of AI
  const validAssignments = scheduleShiftsMultiPass(activeVolunteers, targetShifts);

  console.log(`\n✅ Scheduling complete: ${validAssignments.length} assignments created`);

  return validAssignments;
};

export const parseBulkUploadAI = async (rawData: string): Promise<Partial<Volunteer>[]> => {
    if (!apiKey) return [];

    const prompt = `
      Parse the following raw text data into a structured JSON array of volunteers. 
      The data might be CSV, copy-pasted from Excel, or natural language.
      
      The target structure should map to these fields:
      - name (or fullName)
      - email
      - phone
      - role (EXPERIENCED or NOVICE)
      - skillLevel (1, 2, or 3) - Default to 1 if unknown or novice, 3 if expert.
      - frequency (ONCE_A_WEEK, TWICE_A_MONTH, etc)
      - preferredLocation (HATACHANA, DIZENGOFF, BOTH)
      - preferredDays (array of strings like "0", "1", "2_morning", "5")
      - blackoutDates (array of YYYY-MM-DD)
      - onlyDates (array of YYYY-MM-DD)
      - serialNumber (number)
      
      Raw Data:
      ${rawData}
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                email: { type: Type.STRING },
                phone: { type: Type.STRING },
                role: { type: Type.STRING },
                skillLevel: { type: Type.INTEGER },
                frequency: { type: Type.STRING },
                preferredLocation: { type: Type.STRING },
                preferredDays: { type: Type.ARRAY, items: { type: Type.STRING } },
                blackoutDates: { type: Type.ARRAY, items: { type: Type.STRING } },
                onlyDates: { type: Type.ARRAY, items: { type: Type.STRING } },
                serialNumber: { type: Type.NUMBER }
              }
            }
          }
        }
      });
      
      return JSON.parse(response.text || "[]");
    } catch (e) {
      console.error("Bulk upload parse error", e);
      return [];
    }
};
