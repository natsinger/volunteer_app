import { supabase } from '../lib/supabase';
import { Event, EventAttendance } from '../types';

// Mapper functions for database format
const mapEventFromDB = (dbEvent: any): Event => ({
  id: dbEvent.id,
  title: dbEvent.title,
  description: dbEvent.description,
  startTime: dbEvent.start_time,
  endTime: dbEvent.end_time,
  location: dbEvent.location,
  emoji: dbEvent.emoji,
  imageUrl: dbEvent.image_url,
  isRecurring: dbEvent.is_recurring ?? false,
  date: dbEvent.date,
  recurrenceDayOfWeek: dbEvent.recurrence_day_of_week,
  recurrenceStartDate: dbEvent.recurrence_start_date,
  recurrenceEndDate: dbEvent.recurrence_end_date,
  isPublished: dbEvent.is_published ?? false,
  createdBy: dbEvent.created_by,
  createdAt: dbEvent.created_at,
  updatedAt: dbEvent.updated_at,
});

const mapEventToDB = (event: Partial<Event>) => ({
  id: event.id,
  title: event.title,
  description: event.description,
  start_time: event.startTime,
  end_time: event.endTime,
  location: event.location,
  emoji: event.emoji,
  image_url: event.imageUrl,
  is_recurring: event.isRecurring ?? false,
  date: event.date,
  recurrence_day_of_week: event.recurrenceDayOfWeek,
  recurrence_start_date: event.recurrenceStartDate,
  recurrence_end_date: event.recurrenceEndDate,
  is_published: event.isPublished ?? false,
  created_by: event.createdBy,
  created_at: event.createdAt,
  updated_at: event.updatedAt,
});

/**
 * Load all events (for admins)
 */
export const loadAllEvents = async (): Promise<{
  success: boolean;
  events?: Event[];
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading events:', error);
      return { success: false, error: error.message };
    }

    const events = (data || []).map(mapEventFromDB);
    return { success: true, events };
  } catch (error: any) {
    console.error('Unexpected error loading events:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Load only published events (for volunteers)
 */
export const loadPublishedEvents = async (): Promise<{
  success: boolean;
  events?: Event[];
  error?: string;
}> => {
  try {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('is_published', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading published events:', error);
      return { success: false, error: error.message };
    }

    const events = (data || []).map(mapEventFromDB);
    return { success: true, events };
  } catch (error: any) {
    console.error('Unexpected error loading published events:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Create a new event
 */
export const createEvent = async (
  event: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; eventId?: string; error?: string }> => {
  try {
    const dbEvent = mapEventToDB(event);
    delete dbEvent.id;
    delete dbEvent.created_at;
    delete dbEvent.updated_at;

    const { data, error } = await supabase
      .from('events')
      .insert([dbEvent])
      .select()
      .single();

    if (error) {
      console.error('Error creating event:', error);
      return { success: false, error: error.message };
    }

    return { success: true, eventId: data.id };
  } catch (error: any) {
    console.error('Unexpected error creating event:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Update an existing event
 */
export const updateEvent = async (
  eventId: string,
  updates: Partial<Event>
): Promise<{ success: boolean; error?: string }> => {
  try {
    const dbUpdates = mapEventToDB(updates);
    delete dbUpdates.id;
    delete dbUpdates.created_at;

    const { error } = await supabase
      .from('events')
      .update(dbUpdates)
      .eq('id', eventId);

    if (error) {
      console.error('Error updating event:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Unexpected error updating event:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Delete an event
 */
export const deleteEvent = async (
  eventId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', eventId);

    if (error) {
      console.error('Error deleting event:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error('Unexpected error deleting event:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Publish an event (make it visible to volunteers)
 */
export const publishEvent = async (
  eventId: string
): Promise<{ success: boolean; error?: string }> => {
  return updateEvent(eventId, { isPublished: true });
};

/**
 * Unpublish an event (hide from volunteers)
 */
export const unpublishEvent = async (
  eventId: string
): Promise<{ success: boolean; error?: string }> => {
  return updateEvent(eventId, { isPublished: false });
};

/**
 * Get events for a specific date range (useful for calendar views)
 */
export const getEventsForDateRange = async (
  startDate: string, // YYYY-MM-DD
  endDate: string, // YYYY-MM-DD
  publishedOnly: boolean = false
): Promise<{
  success: boolean;
  events?: Event[];
  error?: string;
}> => {
  try {
    let query = supabase
      .from('events')
      .select('*');

    if (publishedOnly) {
      query = query.eq('is_published', true);
    }

    // Get one-time events in date range
    query = query.or(`date.gte.${startDate},date.lte.${endDate}`);

    // TODO: Handle recurring events - need to generate instances based on recurrence pattern

    const { data, error } = await query.order('date', { ascending: true });

    if (error) {
      console.error('Error loading events for date range:', error);
      return { success: false, error: error.message };
    }

    const events = (data || []).map(mapEventFromDB);
    return { success: true, events };
  } catch (error: any) {
    console.error('Unexpected error loading events for date range:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

// ==================== Event Attendance ====================

const mapAttendanceFromDB = (row: any): EventAttendance => ({
  id: row.id,
  eventId: row.event_id,
  volunteerId: row.volunteer_id,
  eventDate: row.event_date,
  createdAt: row.created_at,
});

/**
 * Get all attendances for a set of event IDs (used to show counts and status)
 */
export const getEventAttendances = async (
  eventIds: string[]
): Promise<{ success: boolean; attendances?: EventAttendance[]; error?: string }> => {
  if (eventIds.length === 0) return { success: true, attendances: [] };
  try {
    const { data, error } = await supabase
      .from('event_attendances')
      .select('*')
      .in('event_id', eventIds);

    if (error) {
      console.error('Error loading event attendances:', error);
      return { success: false, error: error.message };
    }

    return { success: true, attendances: (data || []).map(mapAttendanceFromDB) };
  } catch (error: any) {
    console.error('Unexpected error loading event attendances:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};

/**
 * Toggle attendance for a volunteer on a specific event + date.
 * Returns the new attending state.
 */
export const toggleEventAttendance = async (
  eventId: string,
  volunteerId: string,
  eventDate: string
): Promise<{ success: boolean; attending?: boolean; error?: string }> => {
  try {
    // Check if already attending
    const { data: existing, error: checkError } = await supabase
      .from('event_attendances')
      .select('id')
      .eq('event_id', eventId)
      .eq('volunteer_id', volunteerId)
      .eq('event_date', eventDate)
      .maybeSingle();

    if (checkError) {
      console.error('Error checking attendance:', checkError);
      return { success: false, error: checkError.message };
    }

    if (existing) {
      // Remove attendance
      const { error: deleteError } = await supabase
        .from('event_attendances')
        .delete()
        .eq('id', existing.id);

      if (deleteError) {
        console.error('Error removing attendance:', deleteError);
        return { success: false, error: deleteError.message };
      }
      return { success: true, attending: false };
    } else {
      // Add attendance
      const { error: insertError } = await supabase
        .from('event_attendances')
        .insert([{ event_id: eventId, volunteer_id: volunteerId, event_date: eventDate }]);

      if (insertError) {
        console.error('Error adding attendance:', insertError);
        return { success: false, error: insertError.message };
      }
      return { success: true, attending: true };
    }
  } catch (error: any) {
    console.error('Unexpected error toggling attendance:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
};
