import React, { useState, useEffect } from 'react';
import { Event } from '../types';
import { createEvent, updateEvent } from '../services/eventService';

interface EventModalFormProps {
  event: Event | null;
  onSave: () => void;
  onCancel: () => void;
}

const EMOJI_OPTIONS = ['📅', '🎉', '🎊', '🎈', '🎁', '🎂', '🍰', '🎵', '🎶', '🎤', '🎸', '🎹', '🎺', '🎻', '🎬', '🎮', '🎯', '🏆', '⚽', '🏀', '🎾', '🏐', '🎳', '🎲', '🃏', '🎭', '🎨', '🎪', '🎡', '🎢', '🎠', '🎰', '🚀', '✈️', '🌟', '⭐', '💫', '✨', '🔥', '💝', '💖', '💗', '💓', '💕', '💞', '💘'];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const EventModalForm: React.FC<EventModalFormProps> = ({ event, onSave, onCancel }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [location, setLocation] = useState('');
  const [emoji, setEmoji] = useState('📅');
  const [isRecurring, setIsRecurring] = useState(false);
  const [date, setDate] = useState('');
  const [recurrenceDayOfWeek, setRecurrenceDayOfWeek] = useState(0);
  const [recurrenceStartDate, setRecurrenceStartDate] = useState('');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setDescription(event.description || '');
      setStartTime(event.startTime);
      setEndTime(event.endTime);
      setLocation(event.location || '');
      setEmoji(event.emoji || '📅');
      setIsRecurring(event.isRecurring);
      setDate(event.date || '');
      setRecurrenceDayOfWeek(event.recurrenceDayOfWeek || 0);
      setRecurrenceStartDate(event.recurrenceStartDate || '');
      setRecurrenceEndDate(event.recurrenceEndDate || '');
    }
  }, [event]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      alert('Please enter an event title');
      return;
    }

    if (!isRecurring && !date) {
      alert('Please select a date for the event');
      return;
    }

    if (isRecurring && !recurrenceStartDate) {
      alert('Please select a start date for recurring events');
      return;
    }

    setIsSaving(true);

    const eventData: Omit<Event, 'id' | 'createdAt' | 'updatedAt'> = {
      title: title.trim(),
      description: description.trim() || undefined,
      startTime,
      endTime,
      location: location.trim() || undefined,
      emoji: emoji || undefined,
      isRecurring,
      date: isRecurring ? undefined : date,
      recurrenceDayOfWeek: isRecurring ? recurrenceDayOfWeek : undefined,
      recurrenceStartDate: isRecurring ? recurrenceStartDate : undefined,
      recurrenceEndDate: isRecurring && recurrenceEndDate ? recurrenceEndDate : undefined,
      isPublished: event?.isPublished || false,
    };

    let result;
    if (event) {
      result = await updateEvent(event.id, eventData);
    } else {
      result = await createEvent(eventData);
    }

    setIsSaving(false);

    if (result.success) {
      alert(event ? 'Event updated successfully!' : 'Event created successfully!');
      onSave();
    } else {
      alert(`Failed to ${event ? 'update' : 'create'} event: ${result.error}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Event Title *
        </label>
        <input
          type="text"
          className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Community Gathering, Workshop, Celebration"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Description
        </label>
        <textarea
          className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add event details..."
        />
      </div>

      {/* Time */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Start Time *
          </label>
          <input
            type="time"
            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            End Time *
          </label>
          <input
            type="time"
            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Location */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Location
        </label>
        <input
          type="text"
          className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g., Main Hall, Online, TBD"
        />
      </div>

      {/* Emoji Picker */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Event Emoji
        </label>
        <div className="flex flex-wrap gap-2 p-3 border border-slate-200 rounded-lg bg-slate-50 max-h-32 overflow-y-auto">
          {EMOJI_OPTIONS.map((emojiOption) => (
            <button
              key={emojiOption}
              type="button"
              onClick={() => setEmoji(emojiOption)}
              className={`text-2xl p-2 rounded-lg hover:bg-white transition-colors ${
                emoji === emojiOption ? 'bg-pink-100 ring-2 ring-pink-500' : 'bg-white'
              }`}
            >
              {emojiOption}
            </button>
          ))}
        </div>
      </div>

      {/* Recurring Toggle */}
      <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg">
        <input
          type="checkbox"
          id="isRecurring"
          className="w-4 h-4 text-pink-600 focus:ring-pink-500 rounded"
          checked={isRecurring}
          onChange={(e) => setIsRecurring(e.target.checked)}
        />
        <label htmlFor="isRecurring" className="text-sm font-medium text-slate-700">
          This is a recurring event
        </label>
      </div>

      {/* Date/Recurrence Fields */}
      {isRecurring ? (
        <div className="space-y-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Day of Week *
            </label>
            <select
              className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none bg-white"
              value={recurrenceDayOfWeek}
              onChange={(e) => setRecurrenceDayOfWeek(parseInt(e.target.value))}
              required
            >
              {DAYS_OF_WEEK.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Start Date *
              </label>
              <input
                type="date"
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                value={recurrenceStartDate}
                onChange={(e) => setRecurrenceStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                End Date (Optional)
              </label>
              <input
                type="date"
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
                value={recurrenceEndDate}
                onChange={(e) => setRecurrenceEndDate(e.target.value)}
                min={recurrenceStartDate}
              />
            </div>
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Event Date *
          </label>
          <input
            type="date"
            className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-pink-500 outline-none"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
          disabled={isSaving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-6 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 disabled:bg-slate-300"
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : event ? 'Update Event' : 'Create Event'}
        </button>
      </div>
    </form>
  );
};

export default EventModalForm;
