import { supabase } from '../lib/supabase';
import { Event } from '../types';

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
