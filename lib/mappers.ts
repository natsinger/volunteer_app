import { Volunteer, Shift } from '../types';

// Database row interfaces (snake_case as returned from Supabase)
interface VolunteerRow {
  id: string;
  user_id?: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  skill_level: number;
  frequency: string;
  preferred_location: string;
  skills: string[];
  preferred_days: string[];
  blackout_dates: string[];
  only_dates: string[];
  availability_status: string;
  serial_number?: number;
  created_at?: string;
  updated_at?: string;
}

interface ShiftRow {
  id: string;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  required_skills: string[];
  assigned_volunteer_id?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

// Map database volunteer row to TypeScript Volunteer interface
export const mapVolunteerFromDB = (row: VolunteerRow): Volunteer => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  skillLevel: row.skill_level as 1 | 2 | 3,
  frequency: row.frequency,
  preferredLocation: row.preferred_location,
  skills: row.skills || [],
  preferredDays: row.preferred_days || [],
  blackoutDates: row.blackout_dates || [],
  onlyDates: row.only_dates || [],
  availabilityStatus: row.availability_status as 'Active' | 'Inactive' | 'On Leave',
  serialNumber: row.serial_number,
});

// Map TypeScript Volunteer to database row format
export const mapVolunteerToDB = (volunteer: Volunteer): Partial<VolunteerRow> => ({
  id: volunteer.id,
  name: volunteer.name,
  email: volunteer.email,
  phone: volunteer.phone,
  role: volunteer.role,
  skill_level: volunteer.skillLevel,
  frequency: volunteer.frequency,
  preferred_location: volunteer.preferredLocation,
  skills: volunteer.skills || [],
  preferred_days: volunteer.preferredDays || [],
  blackout_dates: volunteer.blackoutDates || [],
  only_dates: volunteer.onlyDates || [],
  availability_status: volunteer.availabilityStatus,
  serial_number: volunteer.serialNumber,
});

// Map database shift row to TypeScript Shift interface
export const mapShiftFromDB = (row: ShiftRow): Shift => ({
  id: row.id,
  title: row.title,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  requiredSkills: row.required_skills || [],
  assignedVolunteerId: row.assigned_volunteer_id,
  status: row.status as 'Open' | 'Assigned' | 'Completed',
});

// Map TypeScript Shift to database row format
export const mapShiftToDB = (shift: Shift): Partial<ShiftRow> => ({
  id: shift.id,
  title: shift.title,
  date: shift.date,
  start_time: shift.startTime,
  end_time: shift.endTime,
  required_skills: shift.requiredSkills || [],
  assigned_volunteer_id: shift.assignedVolunteerId,
  status: shift.status,
});
