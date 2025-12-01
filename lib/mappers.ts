import { Volunteer, Shift, RecurringShift, DeletedShiftOccurrence } from '../types';

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
  recurring_shift_id?: string | null;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  location?: string;
  required_skills: string[];
  assigned_volunteer_id?: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

interface RecurringShiftRow {
  id: string;
  title: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string;
  required_skills: string[];
  required_volunteers: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface DeletedShiftOccurrenceRow {
  id: string;
  recurring_shift_id: string;
  deleted_date: string;
  deleted_at?: string;
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
  recurringShiftId: row.recurring_shift_id,
  title: row.title,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  location: row.location,
  requiredSkills: row.required_skills || [],
  assignedVolunteerId: row.assigned_volunteer_id,
  status: row.status as 'Open' | 'Assigned' | 'Completed',
});

// Map TypeScript Shift to database row format
export const mapShiftToDB = (shift: Shift): Partial<ShiftRow> => ({
  id: shift.id,
  recurring_shift_id: shift.recurringShiftId,
  title: shift.title,
  date: shift.date,
  start_time: shift.startTime,
  end_time: shift.endTime,
  location: shift.location,
  required_skills: shift.requiredSkills || [],
  assigned_volunteer_id: shift.assignedVolunteerId,
  status: shift.status,
});

// Map database recurring shift row to TypeScript RecurringShift interface
export const mapRecurringShiftFromDB = (row: RecurringShiftRow): RecurringShift => ({
  id: row.id,
  title: row.title,
  dayOfWeek: row.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  startTime: row.start_time,
  endTime: row.end_time,
  location: row.location,
  requiredSkills: row.required_skills || [],
  requiredVolunteers: row.required_volunteers,
  isActive: row.is_active,
});

// Map TypeScript RecurringShift to database row format
export const mapRecurringShiftToDB = (recurringShift: RecurringShift): Partial<RecurringShiftRow> => ({
  id: recurringShift.id,
  title: recurringShift.title,
  day_of_week: recurringShift.dayOfWeek,
  start_time: recurringShift.startTime,
  end_time: recurringShift.endTime,
  location: recurringShift.location,
  required_skills: recurringShift.requiredSkills || [],
  required_volunteers: recurringShift.requiredVolunteers,
  is_active: recurringShift.isActive,
});

// Map database deleted occurrence row to TypeScript DeletedShiftOccurrence interface
export const mapDeletedOccurrenceFromDB = (row: DeletedShiftOccurrenceRow): DeletedShiftOccurrence => ({
  id: row.id,
  recurringShiftId: row.recurring_shift_id,
  deletedDate: row.deleted_date,
});

// Map TypeScript DeletedShiftOccurrence to database row format
export const mapDeletedOccurrenceToDB = (occurrence: DeletedShiftOccurrence): Partial<DeletedShiftOccurrenceRow> => ({
  id: occurrence.id,
  recurring_shift_id: occurrence.recurringShiftId,
  deleted_date: occurrence.deletedDate,
});
