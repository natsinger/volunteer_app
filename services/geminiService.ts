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
): Array<{shiftId: string, volunteerId: string, reasoning: string}> {

  const assignments: Array<{shiftId: string, volunteerId: string, reasoning: string}> = [];

  // Track capacity usage
  const capacityUsed = new Map<string, number>();
  volunteers.forEach(v => capacityUsed.set(v.id, 0));

  // Track assignments per shift
  const shiftAssignments = new Map<string, string[]>();
  shifts.forEach(s => shiftAssignments.set(s.id, []));

  // Sort volunteers by skill level: NOVICE (1) first, then 2, then EXPERIENCED (3)
  // Within same skill level, sort by capacity (higher capacity first)
  const sortedVolunteers = [...volunteers].sort((a, b) => {
    if (a.skillLevel !== b.skillLevel) {
      return a.skillLevel - b.skillLevel; // Ascending: 1, 2, 3
    }
    return getMonthlyCapacity(b.frequency) - getMonthlyCapacity(a.frequency); // Descending capacity
  });

  console.log('Volunteer priority order (novices first):');
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

    // Check blackout dates
    if (volunteer.blackoutDates.includes(shift.date)) return false;

    // Check only dates
    if (volunteer.onlyDates.length > 0 && !volunteer.onlyDates.includes(shift.date)) {
      return false;
    }

    return true;
  };

  // Multiple passes: keep going until all shifts are filled or no capacity remains
  let passNumber = 1;
  let assignmentsMade = true;

  while (assignmentsMade) {
    assignmentsMade = false;
    console.log(`\n=== Pass ${passNumber} ===`);

    // Sort shifts by how many volunteers they have (fewest first)
    const sortedShifts = [...shifts].sort((a, b) => {
      const aCount = shiftAssignments.get(a.id)?.length || 0;
      const bCount = shiftAssignments.get(b.id)?.length || 0;
      if (aCount !== bCount) return aCount - bCount;
      return a.date.localeCompare(b.date); // Earlier dates first
    });

    for (const shift of sortedShifts) {
      const currentAssignees = shiftAssignments.get(shift.id) || [];

      // Target: 3 volunteers per shift, max 5
      if (currentAssignees.length >= 5) continue;

      // Try to assign volunteers (in priority order: novices first)
      for (const volunteer of sortedVolunteers) {
        // Skip if already assigned to this shift
        if (currentAssignees.includes(volunteer.id)) continue;

        // Check if volunteer can work this shift
        if (!canWorkShift(volunteer, shift)) continue;

        // Assign!
        assignments.push({
          shiftId: shift.id,
          volunteerId: volunteer.id,
          reasoning: `Pass ${passNumber}: ${volunteer.name} (skill ${volunteer.skillLevel}) assigned to ${shift.date}`
        });

        currentAssignees.push(volunteer.id);
        shiftAssignments.set(shift.id, currentAssignees);
        capacityUsed.set(volunteer.id, (capacityUsed.get(volunteer.id) || 0) + 1);
        assignmentsMade = true;

        // If shift has 3 volunteers, move to next shift
        if (currentAssignees.length >= 3) break;
      }
    }

    passNumber++;

    // Safety: max 10 passes
    if (passNumber > 10) {
      console.warn('Reached maximum passes (10), stopping');
      break;
    }
  }

  // Report results
  console.log('\n=== Final Results ===');
  console.log(`Total assignments: ${assignments.length}`);
  console.log('Per volunteer:');
  capacityUsed.forEach((used, volId) => {
    const volunteer = volunteers.find(v => v.id === volId);
    const capacity = getMonthlyCapacity(volunteer?.frequency || '');
    if (used > 0) {
      console.log(`  ${volunteer?.name}: ${used}/${capacity} (${Math.round(used/capacity*100)}%)`);
    }
  });

  console.log('Per shift:');
  let emptyShifts = 0;
  shiftAssignments.forEach((assignees, shiftId) => {
    if (assignees.length === 0) emptyShifts++;
  });
  console.log(`  ${shifts.length - emptyShifts}/${shifts.length} shifts filled`);
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