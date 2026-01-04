import { GoogleGenAI, Type } from "@google/genai";
import { Shift, Volunteer } from "../types";

// Access Vite environment variable correctly
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';

const ai = new GoogleGenAI({ apiKey });

/**
 * Fisher-Yates shuffle algorithm for randomizing arrays
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Helper to determine monthly capacity based on frequency string
export const getMonthlyCapacity = (frequency: string): number => {
  if (!frequency) return 0;
  const freq = frequency.toUpperCase();
  if (freq.includes('ONCE_A_WEEK') || freq === 'WEEKLY') return 4; // Approx 4 weeks in a month
  if (freq.includes('TWICE_A_MONTH')) return 2;
  if (freq.includes('ONCE_A_MONTH') || freq === 'MONTHLY') return 1;
  return 0; // Default or inactive
};

// Helper to get the specific day code (0, 1, 2_morning, 2_evening, 5_opening, 5_closing, etc.)
export const getShiftDayCode = (dateStr: string, timeStr: string): string => {
  const date = new Date(dateStr);
  const day = date.getDay(); // 0 = Sunday
  const hour = parseInt(timeStr.split(':')[0], 10);

  // Tuesday (Day 2) splits: morning vs evening
  if (day === 2) {
    // Before 16:00 = morning, 16:00+ = evening
    return hour < 16 ? '2_morning' : '2_evening';
  }

  // Friday (Day 5) splits: opening vs closing
  if (day === 5) {
    // Before 14:00 = opening shift, 14:00+ = closing shift
    return hour < 14 ? '5_opening' : '5_closing';
  }

  return day.toString();
};

/**
 * Get the ISO week number for a given date
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

/**
 * Check if two dates are on the same day
 */
export const areDatesOnSameDay = (date1: string, date2: string): boolean => {
  return date1 === date2;
};

/**
 * Check if a volunteer can work a specific shift based on availability preferences
 * This checks: location, day preference, blackout dates, and only dates
 * Note: This does NOT check capacity - that should be checked separately
 */
export const canVolunteerWorkShift = (volunteer: Volunteer, shift: Shift): boolean => {
  // Check location compatibility
  if (volunteer.preferredLocation !== 'BOTH' && shift.location !== 'BOTH') {
    if (volunteer.preferredLocation !== shift.location) return false;
  }

  // Check day preference
  const dayCode = getShiftDayCode(shift.date, shift.startTime);
  if (!volunteer.preferredDays.includes(dayCode)) return false;

  // Check blackout dates
  if (volunteer.blackoutDates.includes(shift.date)) return false;

  // Check only dates - if specified, volunteer can ONLY work these specific dates
  if (volunteer.onlyDates.length > 0 && !volunteer.onlyDates.includes(shift.date)) {
    return false;
  }

  return true;
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

/**
 * Scheduling algorithm that fills ALL shifts
 * Prioritizes novices first, saves experts for last
 * Does multiple passes until all shifts are filled or no capacity remains
 * @param randomize - If true, adds randomization to volunteer ordering within skill level groups
 */
function scheduleShiftsMultiPass(
  volunteers: Volunteer[],
  shifts: Shift[],
  randomize: boolean = false
): Array<{shiftId: string, volunteerId: string, reasoning: string}> {

  const assignments: Array<{shiftId: string, volunteerId: string, reasoning: string}> = [];

  // Track capacity usage
  const capacityUsed = new Map<string, number>();
  volunteers.forEach(v => capacityUsed.set(v.id, 0));

  // Track assignments per shift
  const shiftAssignments = new Map<string, string[]>();
  shifts.forEach(s => shiftAssignments.set(s.id, []));

  // Track which dates each volunteer is assigned to (for same-day/same-week checks)
  const volunteerAssignedDates = new Map<string, string[]>();
  volunteers.forEach(v => volunteerAssignedDates.set(v.id, []));

  // Sort volunteers by skill level: NOVICE (1) first, then 2, then EXPERIENCED (3)
  // Within same skill level, sort by capacity (higher capacity first) or randomize
  let sortedVolunteers: Volunteer[];

  if (randomize) {
    // Group by skill level, shuffle within each group, then combine
    const novices = volunteers.filter(v => v.skillLevel === 1);
    const intermediate = volunteers.filter(v => v.skillLevel === 2);
    const experienced = volunteers.filter(v => v.skillLevel === 3);

    sortedVolunteers = [
      ...shuffleArray(novices),
      ...shuffleArray(intermediate),
      ...shuffleArray(experienced)
    ];

    console.log('Volunteer priority order (RANDOMIZED within skill levels):');
  } else {
    sortedVolunteers = [...volunteers].sort((a, b) => {
      if (a.skillLevel !== b.skillLevel) {
        return a.skillLevel - b.skillLevel; // Ascending: 1, 2, 3
      }
      return getMonthlyCapacity(b.frequency) - getMonthlyCapacity(a.frequency); // Descending capacity
    });

    console.log('Volunteer priority order (novices first):');
  }

  sortedVolunteers.forEach((v, i) => {
    const skillLabel = v.skillLevel === 1 ? 'NOVICE' : v.skillLevel === 2 ? 'INTERMEDIATE' : 'EXPERIENCED';
    console.log(`  ${i + 1}. ${v.name} (${skillLabel}, capacity: ${getMonthlyCapacity(v.frequency)})`);
  });

  // Helper: Check if volunteer can work this shift
  const canWorkShift = (volunteer: Volunteer, shift: Shift): boolean => {
    const capacity = getMonthlyCapacity(volunteer.frequency);
    const used = capacityUsed.get(volunteer.id) || 0;

    // Check capacity
    if (used >= capacity) return false;

    // Check location
    if (volunteer.preferredLocation !== 'BOTH' && shift.location !== 'BOTH') {
      if (volunteer.preferredLocation !== shift.location) return false;
    }

    // Check day preference
    const dayCode = getShiftDayCode(shift.date, shift.startTime);
    if (!volunteer.preferredDays.includes(dayCode)) return false;

    // Check blackout dates (blocked days)
    if (volunteer.blackoutDates.includes(shift.date)) return false;

    // Check only dates
    if (volunteer.onlyDates.length > 0 && !volunteer.onlyDates.includes(shift.date)) {
      return false;
    }

    // Get volunteer's already assigned dates
    const assignedDates = volunteerAssignedDates.get(volunteer.id) || [];

    // NEW CONSTRAINT: Can't have two shifts on the same day (even at different locations)
    if (assignedDates.includes(shift.date)) {
      return false;
    }

    // NEW CONSTRAINT: Can't have two shifts in the same week
    for (const assignedDate of assignedDates) {
      if (areDatesInSameWeek(assignedDate, shift.date)) {
        return false;
      }
    }

    return true;
  };

  // Multiple passes: keep going until everyone is utilized OR shifts are maxed out
  let passNumber = 1;
  let assignmentsMade = true;

  while (assignmentsMade) {
    assignmentsMade = false;
    console.log(`\n=== Pass ${passNumber} ===`);

    // Re-shuffle volunteers each pass if randomization is enabled (for more variety)
    let currentPassVolunteers = sortedVolunteers;
    if (randomize && passNumber > 1) {
      const novices = sortedVolunteers.filter(v => v.skillLevel === 1);
      const intermediate = sortedVolunteers.filter(v => v.skillLevel === 2);
      const experienced = sortedVolunteers.filter(v => v.skillLevel === 3);

      currentPassVolunteers = [
        ...shuffleArray(novices),
        ...shuffleArray(intermediate),
        ...shuffleArray(experienced)
      ];
    }

    // Sort shifts by how many volunteers they have (fewest first)
    let sortedShifts = [...shifts].sort((a, b) => {
      const aCount = shiftAssignments.get(a.id)?.length || 0;
      const bCount = shiftAssignments.get(b.id)?.length || 0;
      if (aCount !== bCount) return aCount - bCount;
      return a.date.localeCompare(b.date); // Earlier dates first
    });

    // Add randomization to shift order if enabled (shuffle shifts with same volunteer count)
    if (randomize) {
      // Group shifts by current assignment count, shuffle within groups
      const shiftGroups = new Map<number, Shift[]>();
      sortedShifts.forEach(shift => {
        const count = shiftAssignments.get(shift.id)?.length || 0;
        if (!shiftGroups.has(count)) {
          shiftGroups.set(count, []);
        }
        shiftGroups.get(count)!.push(shift);
      });

      // Shuffle within each group and recombine
      sortedShifts = [];
      Array.from(shiftGroups.keys()).sort((a, b) => a - b).forEach(count => {
        sortedShifts.push(...shuffleArray(shiftGroups.get(count)!));
      });
    }

    for (const shift of sortedShifts) {
      const currentAssignees = shiftAssignments.get(shift.id) || [];

      // Max 5 volunteers per shift
      if (currentAssignees.length >= 5) continue;

      // Calculate current experience level distribution on this shift
      const currentSkillLevels = currentAssignees.map(id => {
        const vol = volunteers.find(v => v.id === id);
        return vol?.skillLevel || 1;
      });
      const noviceCount = currentSkillLevels.filter(s => s === 1).length;
      const intermediateCount = currentSkillLevels.filter(s => s === 2).length;
      const experiencedCount = currentSkillLevels.filter(s => s === 3).length;

      // Sort volunteers to prefer those who balance the shift
      // Priority: If shift has mostly novices, prefer experienced volunteers
      let volunteersForThisShift = [...currentPassVolunteers];
      if (currentAssignees.length >= 2) {
        volunteersForThisShift.sort((a, b) => {
          // Calculate balance score (higher = better for this shift)
          const getBalanceScore = (vol: Volunteer) => {
            let score = 0;
            // If we have many novices and few experienced, prefer experienced
            if (noviceCount >= 2 && experiencedCount === 0) {
              if (vol.skillLevel === 3) score += 10;
              if (vol.skillLevel === 2) score += 5;
            }
            // If we have many experienced and few novices, prefer novices
            if (experiencedCount >= 2 && noviceCount === 0) {
              if (vol.skillLevel === 1) score += 10;
              if (vol.skillLevel === 2) score += 5;
            }
            // If balanced or first few assignments, slightly prefer novices (to ensure they get shifts)
            if (noviceCount === 0 && currentAssignees.length < 2) {
              if (vol.skillLevel === 1) score += 3;
            }
            return score;
          };
          return getBalanceScore(b) - getBalanceScore(a);
        });
      }

      // Try to assign volunteers with balanced experience levels
      for (const volunteer of volunteersForThisShift) {
        // Skip if already assigned to this shift
        if (currentAssignees.includes(volunteer.id)) continue;

        // Check if volunteer can work this shift
        if (!canWorkShift(volunteer, shift)) continue;

        // Assign!
        const skillLabel = volunteer.skillLevel === 1 ? 'NOVICE' : volunteer.skillLevel === 2 ? 'INTERMEDIATE' : 'EXPERIENCED';
        assignments.push({
          shiftId: shift.id,
          volunteerId: volunteer.id,
          reasoning: `Pass ${passNumber}: ${volunteer.name} (${skillLabel}) assigned to ${shift.date} - Balancing experience levels`
        });

        currentAssignees.push(volunteer.id);
        shiftAssignments.set(shift.id, currentAssignees);
        capacityUsed.set(volunteer.id, (capacityUsed.get(volunteer.id) || 0) + 1);
        assignmentsMade = true;

        // Track assigned date for same-day/same-week constraint checks
        const currentAssignedDates = volunteerAssignedDates.get(volunteer.id) || [];
        currentAssignedDates.push(shift.date);
        volunteerAssignedDates.set(volunteer.id, currentAssignedDates);

        // For passes 1-2, prioritize breadth (3 volunteers per shift)
        // After that, continue adding to utilize all capacity
        if (passNumber <= 2 && currentAssignees.length >= 3) {
          break; // Move to next shift to spread volunteers
        }
      }
    }

    passNumber++;

    // Safety: max 20 passes (increased to ensure everyone gets to 100%)
    if (passNumber > 20) {
      console.warn('Reached maximum passes (20), stopping');
      break;
    }
  }

  // Report results
  console.log('\n=== Final Results ===');
  console.log(`Total assignments: ${assignments.length}`);
  console.log('\nUtilization per volunteer:');

  let totalCapacity = 0;
  let totalUsed = 0;
  const unassignedVolunteers: Volunteer[] = [];
  const underutilizedVolunteers: Array<{volunteer: Volunteer, used: number, capacity: number}> = [];

  capacityUsed.forEach((used, volId) => {
    const volunteer = volunteers.find(v => v.id === volId);
    const capacity = getMonthlyCapacity(volunteer?.frequency || '');
    totalCapacity += capacity;
    totalUsed += used;

    const skillLabel = volunteer?.skillLevel === 1 ? 'NOVICE' : volunteer?.skillLevel === 2 ? 'INTERMEDIATE' : 'EXPERIENCED';
    const percentage = capacity > 0 ? Math.round(used/capacity*100) : 0;
    console.log(`  ${volunteer?.name} (${skillLabel}): ${used}/${capacity} (${percentage}%)`);

    if (used === 0 && capacity > 0 && volunteer) {
      unassignedVolunteers.push(volunteer);
    } else if (used < capacity && volunteer) {
      underutilizedVolunteers.push({volunteer, used, capacity});
    }
  });

  const overallUtilization = totalCapacity > 0 ? Math.round(totalUsed/totalCapacity*100) : 0;
  console.log(`\nOverall utilization: ${totalUsed}/${totalCapacity} (${overallUtilization}%)`);

  // Report unassigned volunteers and why
  if (unassignedVolunteers.length > 0) {
    console.log(`\n⚠️  ${unassignedVolunteers.length} volunteers got ZERO assignments:`);
    unassignedVolunteers.forEach(vol => {
      console.log(`  - ${vol.name}:`);
      console.log(`    Location: ${vol.preferredLocation}`);
      console.log(`    Days: ${vol.preferredDays.join(', ')}`);
      console.log(`    Blackout dates: ${vol.blackoutDates.length > 0 ? vol.blackoutDates.join(', ') : 'none'}`);
      console.log(`    Only dates: ${vol.onlyDates.length > 0 ? vol.onlyDates.join(', ') : 'any'}`);

      // Check how many shifts they could theoretically work
      let matchingShifts = 0;
      shifts.forEach(shift => {
        if (canVolunteerWorkShift(vol, shift)) {
          matchingShifts++;
        }
      });
      console.log(`    → Can work ${matchingShifts}/${shifts.length} shifts based on preferences`);
    });
  }

  if (underutilizedVolunteers.length > 0) {
    console.log(`\n📊 ${underutilizedVolunteers.length} volunteers are underutilized:`);
    underutilizedVolunteers.forEach(({volunteer, used, capacity}) => {
      const percentage = Math.round((used / capacity) * 100);
      console.log(`  - ${volunteer.name}: ${used}/${capacity} (${percentage}%)`);
    });
  }

  console.log('\nShift coverage:');
  let emptyShifts = 0;
  let wellStaffed = 0;
  shiftAssignments.forEach((assignees, shiftId) => {
    if (assignees.length === 0) emptyShifts++;
    if (assignees.length >= 3) wellStaffed++;
  });
  console.log(`  ${wellStaffed}/${shifts.length} shifts well-staffed (3+ volunteers)`);
  console.log(`  ${shifts.length - emptyShifts}/${shifts.length} shifts covered (1+ volunteers)`);
  console.log(`  ${emptyShifts} shifts remain empty`);

  return assignments;
}

/**
 * Filter blackout dates to only include dates in the target month
 * This ensures old/irrelevant blackout dates don't affect scheduling
 */
const filterRelevantBlackoutDates = (
  blackoutDates: string[],
  targetMonth: number,
  targetYear: number
): string[] => {
  return blackoutDates.filter(dateStr => {
    const date = new Date(dateStr);
    return date.getMonth() + 1 === targetMonth && date.getFullYear() === targetYear;
  });
};

export const generateScheduleAI = async (
  volunteers: Volunteer[],
  shifts: Shift[],
  targetMonth: number, // 1-12
  targetYear: number,
  randomize: boolean = false
) => {
  if (!apiKey) {
    throw new Error("API Key is missing. Please check your environment configuration.");
  }

  // Filter only active volunteers
  const activeVolunteers = volunteers.filter(v => v.availabilityStatus === 'Active');

  // Pre-process volunteers: filter blackout dates to only include relevant dates for the target month
  const processedVolunteers = activeVolunteers.map(v => ({
    ...v,
    blackoutDates: filterRelevantBlackoutDates(v.blackoutDates, targetMonth, targetYear)
  }));

  console.log('\n[Pre-scheduling] Validating blocked days for target month:');
  processedVolunteers.forEach(v => {
    if (v.blackoutDates.length > 0) {
      console.log(`  ${v.name}: ${v.blackoutDates.length} blocked days in ${targetMonth}/${targetYear}`);
    }
  });

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

  console.log(`\n🔄 Starting ${randomize ? 'RANDOMIZED' : 'deterministic'} scheduling:`);
  console.log(`  Volunteers: ${processedVolunteers.length} active`);
  console.log(`  Shifts: ${targetShifts.length} open shifts`);

  // Use multi-pass algorithm with optional randomization
  // Using processedVolunteers which has filtered blackout dates for the target month
  const validAssignments = scheduleShiftsMultiPass(processedVolunteers, targetShifts, randomize);

  console.log(`\n✅ Scheduling complete: ${validAssignments.length} assignments created`);

  return validAssignments;
};

/**
 * Generate multiple schedule solutions with different randomized volunteer orderings
 * This allows admins to choose from several valid options to ensure variety month-to-month
 */
export const generateMultipleScheduleOptions = async (
  volunteers: Volunteer[],
  shifts: Shift[],
  targetMonth: number,
  targetYear: number,
  numberOfOptions: number = 3
): Promise<Array<{
  id: number;
  assignments: Array<{shiftId: string, volunteerId: string, reasoning: string}>;
  statistics: {
    totalAssignments: number;
    utilizationPercentage: number;
    wellStaffedShifts: number;
    totalShifts: number;
    unassignedVolunteers: number;
    underutilizedVolunteers: number;
  };
}>> => {
  const options = [];

  // Filter only active volunteers
  const activeVolunteers = volunteers.filter(v => v.availabilityStatus === 'Active');

  // Pre-process volunteers: filter blackout dates to only include relevant dates for the target month
  const processedVolunteers = activeVolunteers.map(v => ({
    ...v,
    blackoutDates: filterRelevantBlackoutDates(v.blackoutDates, targetMonth, targetYear)
  }));

  // Filter open shifts for the target month
  const targetShifts = shifts.filter(s => {
    const d = new Date(s.date);
    return s.status === 'Open' &&
           d.getMonth() + 1 === targetMonth &&
           d.getFullYear() === targetYear;
  });

  if (processedVolunteers.length === 0) {
    throw new Error("No active volunteers found.");
  }

  if (targetShifts.length === 0) {
    throw new Error(`No open shifts found for ${targetMonth}/${targetYear}.`);
  }

  console.log(`\n🎲 Generating ${numberOfOptions} different schedule options...`);

  for (let i = 0; i < numberOfOptions; i++) {
    console.log(`\n--- Option ${i + 1} ---`);
    // Use randomization for all options to get different results
    // Using processedVolunteers which has filtered blackout dates for the target month
    const assignments = scheduleShiftsMultiPass(processedVolunteers, targetShifts, true);

    // Calculate statistics
    const capacityMap = new Map<string, number>();
    processedVolunteers.forEach(v => {
      capacityMap.set(v.id, getMonthlyCapacity(v.frequency));
    });

    const assignmentCounts = new Map<string, number>();
    assignments.forEach(a => {
      assignmentCounts.set(a.volunteerId, (assignmentCounts.get(a.volunteerId) || 0) + 1);
    });

    let totalCapacity = 0;
    let totalUsed = 0;
    let unassignedCount = 0;
    let underutilizedCount = 0;

    capacityMap.forEach((capacity, volId) => {
      totalCapacity += capacity;
      const used = assignmentCounts.get(volId) || 0;
      totalUsed += used;

      if (used === 0 && capacity > 0) {
        unassignedCount++;
      } else if (used < capacity) {
        underutilizedCount++;
      }
    });

    const shiftAssignments = new Map<string, number>();
    assignments.forEach(a => {
      shiftAssignments.set(a.shiftId, (shiftAssignments.get(a.shiftId) || 0) + 1);
    });

    let wellStaffed = 0;
    shiftAssignments.forEach(count => {
      if (count >= 3) wellStaffed++;
    });

    options.push({
      id: i + 1,
      assignments,
      statistics: {
        totalAssignments: assignments.length,
        utilizationPercentage: totalCapacity > 0 ? Math.round((totalUsed / totalCapacity) * 100) : 0,
        wellStaffedShifts: wellStaffed,
        totalShifts: targetShifts.length,
        unassignedVolunteers: unassignedCount,
        underutilizedVolunteers: underutilizedCount
      }
    });
  }

  console.log(`\n✅ Generated ${numberOfOptions} schedule options`);
  return options;
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
      - preferredDays (array of strings like "0", "1", "2_morning", "2_evening", "5_opening", "5_closing", "6")
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
