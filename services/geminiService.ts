import { GoogleGenAI, Type } from "@google/genai";
import { Shift, Volunteer } from "../types";

// Safely access process.env to avoid "process is not defined" reference errors in browser
const apiKey = (typeof process !== 'undefined' && process.env && process.env.API_KEY) 
  ? process.env.API_KEY 
  : '';

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
    location: s.id.toLowerCase().includes('dizengoff') || s.title.toLowerCase().includes('dizengoff') ? 'DIZENGOFF' : 'HATACHANA',
  }));

  const prompt = `
    Role: You are a strict logic engine for scheduling.
    Task: Create a volunteer schedule for ${targetMonth}/${targetYear}.

    *** CRITICAL HARD CONSTRAINTS (ZERO TOLERANCE) ***
    
    1. **MAXIMUM CAPACITY (The most important rule)**: 
       - You MUST NOT assign a volunteer more shifts than their 'monthlyCapacity'.
       - Example: If monthlyCapacity is 2, assigning 3 shifts is a CRITICAL ERROR.
       - It is BETTER to leave a shift empty than to over-assign a volunteer.

    2. **PREFERRED DAYS**:
       - Volunteers can ONLY work on days listed in their 'preferredDays' array.
       - '0'=Sunday, '1'=Monday, '2_evening'=Tuesday PM, etc.
       - You must match the shift's 'dayCode' exactly to one of the volunteer's preferred days.

    3. **LOCATION**:
       - 'HATACHANA' volunteers -> Hatachana shifts only.
       - 'DIZENGOFF' volunteers -> Dizengoff shifts only.
       - 'BOTH' -> Any shift.

    4. **DATES**:
       - Do not assign on 'blackoutDates'.
       - If 'onlyDates' is present, they can ONLY work on those specific dates.

    *** SCHEDULING ALGORITHM ***

    Step 1: Calculate Total Slots
    - Aim for 3 volunteers per shift. Min is 2. Max is 5.
    
    Step 2: Assign
    - Iterate through shifts chronologically.
    - For each shift, find volunteers who match Location AND Day AND Date constraints.
    - **CRITICAL FILTER**: Exclude any volunteer who has already reached their 'monthlyCapacity'.
    - Assign up to 3 volunteers.
    
    Step 3: Verification
    - Count assignments for each volunteer.
    - If any volunteer has > monthlyCapacity, REMOVE their extra assignments immediately.

    Data:
    Volunteers: ${JSON.stringify(enrichedVolunteers)}
    Shifts: ${JSON.stringify(enrichedShifts)}

    Output:
    Return a JSON object with a list of assignments.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            assignments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  shiftId: { type: Type.STRING },
                  volunteerId: { type: Type.STRING },
                  reasoning: { type: Type.STRING }
                },
                required: ['shiftId', 'volunteerId']
              }
            }
          }
        }
      }
    });

    const jsonText = response.text || "{}";
    const data = JSON.parse(jsonText);
    return data.assignments || [];

  } catch (error) {
    console.error("Gemini Scheduling Error:", error);
    throw error;
  }
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