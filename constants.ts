import { Shift, Volunteer } from "./types";

export const MOCK_VOLUNTEERS: Volunteer[] = [
  {
    id: 'v1',
    name: 'Alice Johnson',
    email: 'alice@example.com',
    phone: '555-0101',
    role: 'EXPERIENCED',
    skillLevel: 3,
    frequency: 'ONCE_A_WEEK',
    preferredLocation: 'BOTH',
    skills: ['First Aid', 'Crowd Control'],
    preferredDays: ['6', '0'], // 6=Sat, 0=Sun
    blackoutDates: [],
    onlyDates: [],
    availabilityStatus: 'Active',
    serialNumber: 1
  },
  {
    id: 'v2',
    name: 'Bob Smith',
    email: 'bob@example.com',
    phone: '555-0102',
    role: 'NOVICE',
    skillLevel: 1,
    frequency: 'TWICE_A_MONTH',
    preferredLocation: 'HATACHANA',
    skills: ['Logistics', 'Driving'],
    preferredDays: ['1', '5'],
    blackoutDates: ['2023-11-15'],
    onlyDates: [],
    availabilityStatus: 'Active',
    serialNumber: 2
  },
  {
    id: 'v3',
    name: 'Charlie Davis',
    email: 'charlie@example.com',
    phone: '555-0103',
    role: 'EXPERIENCED',
    skillLevel: 2,
    frequency: 'ONCE_A_WEEK',
    preferredLocation: 'DIZENGOFF',
    skills: ['First Aid'],
    preferredDays: ['2', '4'],
    blackoutDates: [],
    onlyDates: [],
    availabilityStatus: 'On Leave',
    serialNumber: 3
  },
  {
    id: 'v4',
    name: 'Diana Prince',
    email: 'diana@example.com',
    phone: '555-0104',
    role: 'EXPERIENCED',
    skillLevel: 3,
    frequency: 'ONCE_A_WEEK',
    preferredLocation: 'BOTH',
    skills: ['Leadership', 'Crowd Control', 'Logistics'],
    preferredDays: ['6', '0'],
    blackoutDates: [],
    onlyDates: [],
    availabilityStatus: 'Active',
    serialNumber: 4
  }
];

// Template definitions for recurring weekly shifts
const SHIFT_TEMPLATES = [
  { dayOfWeek: 0, startTime: '17:30', endTime: '20:30', location: 'DIZENGOFF' }, // Sunday
  { dayOfWeek: 2, startTime: '17:30', endTime: '20:30', location: 'DIZENGOFF' }, // Tuesday
  { dayOfWeek: 3, startTime: '17:30', endTime: '20:30', location: 'DIZENGOFF' }, // Wednesday
  { dayOfWeek: 1, startTime: '17:30', endTime: '20:30', location: 'HATACHANA' }, // Monday
  { dayOfWeek: 2, startTime: '09:00', endTime: '12:00', location: 'HATACHANA' }, // Tuesday Morning
  { dayOfWeek: 2, startTime: '17:30', endTime: '20:30', location: 'HATACHANA' }, // Tuesday Evening
  { dayOfWeek: 3, startTime: '17:30', endTime: '20:30', location: 'HATACHANA' }, // Wednesday
  { dayOfWeek: 5, startTime: '09:00', endTime: '12:00', location: 'HATACHANA' }, // Friday
];

// Function to generate concrete shifts for the next 90 days based on templates
const generateMockShifts = (): Shift[] => {
  const shifts: Shift[] = [];
  const today = new Date();
  
  // Generate shifts for the next 90 days (approx 3 months) to ensure "next month" is fully covered
  for (let i = 0; i < 90; i++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + i);
    
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const dateString = currentDate.toISOString().split('T')[0];
    
    // Find all templates that match this day of the week
    const templatesForDay = SHIFT_TEMPLATES.filter(t => t.dayOfWeek === dayOfWeek);
    
    templatesForDay.forEach((t, idx) => {
      shifts.push({
        id: `auto-${dateString}-${idx}-${t.location.toLowerCase()}`,
        title: `${t.location} Shift`, // Standard title
        date: dateString,
        startTime: t.startTime,
        endTime: t.endTime,
        requiredSkills: [], // No mandatory skills by default
        status: 'Open',
        assignedVolunteerId: null
      });
    });
  }
  return shifts;
};

export const MOCK_SHIFTS: Shift[] = generateMockShifts();

export const SKILL_OPTIONS = ['First Aid', 'Crowd Control', 'Logistics', 'Driving', 'Leadership', 'Cooking', 'Registration'];