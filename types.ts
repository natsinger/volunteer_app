export interface Volunteer {
  id: string;
  name: string; // Maps to fullName
  email: string;
  phone: string;
  role: 'EXPERIENCED' | 'NOVICE' | string;
  skillLevel: 1 | 2 | 3; // 1=Entry, 2=Intermediate, 3=Expert
  frequency: string; // e.g. 'ONCE_A_WEEK', 'TWICE_A_MONTH'
  preferredLocation: 'HATACHANA' | 'DIZENGOFF' | 'BOTH' | string;
  skills: string[];
  preferredDays: string[]; // e.g., "0", "1", "2_evening" - Moved to top level
  blackoutDates: string[]; // Dates they cannot work YYYY-MM-DD
  onlyDates: string[]; // If present, can ONLY work these dates YYYY-MM-DD
  availabilityStatus: 'Active' | 'Inactive' | 'On Leave';
  serialNumber?: number;
}

export interface Shift {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  requiredSkills: string[];
  assignedVolunteerId?: string | null;
  status: 'Open' | 'Assigned' | 'Completed';
}

export interface ScheduleGenerationResult {
  assignments: {
    shiftId: string;
    volunteerId: string;
    reasoning: string;
  }[];
}

export enum UserRole {
  ADMIN = 'ADMIN',
  VOLUNTEER = 'VOLUNTEER',
  GUEST = 'GUEST'
}

export interface AppState {
  volunteers: Volunteer[];
  shifts: Shift[];
  currentUser: Volunteer | null; // For volunteer view
  role: UserRole;
}