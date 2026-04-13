import React, { useState, useEffect } from 'react';
import {
  Users, Calendar, Sparkles, Plus, Trash2, Edit2,
  Search, CheckCircle, Clock, Upload, RefreshCw, BarChart3, ChevronLeft, ChevronRight, X, AlertTriangle, MapPin, User, Save, History, UserPlus, UserMinus, Mail, Repeat, UserCheck, ShieldCheck
} from 'lucide-react';
import { Volunteer, Shift, RecurringShift, DeletedShiftOccurrence, SavedSchedule, SavedScheduleAssignment, ShiftSwitchRequest, Event, EventAttendance } from '../types';
import { generateScheduleAI, getMonthlyCapacity, canVolunteerWorkShift, generateMultipleScheduleOptions } from '../services/geminiService';
import BulkUploadModal from './BulkUploadModal';
import InviteVolunteerModal from './InviteVolunteerModal';
import EventModalForm from './EventModalForm';
import { supabase } from '../lib/supabase';
import { mapVolunteerToDB, mapVolunteerFromDB, mapShiftToDB, mapShiftFromDB, mapRecurringShiftFromDB, mapRecurringShiftToDB, mapDeletedOccurrenceFromDB } from '../lib/mappers';
import { generateShiftInstances, mergeShifts, getMonthRange, getDayName } from '../lib/recurringShiftUtils';
import { generateShiftsForNextMonths } from '../lib/shiftGenerator';
import { saveSchedule, updateSchedule, loadSavedSchedules, loadScheduleAssignments, deleteSchedule, getLatestScheduleForMonth, sendScheduleNotifications, unpublishPreviousSchedules } from '../services/scheduleHistoryService';
import { applyScheduleAssignments, getShiftAssignments, addVolunteerToShift as dbAddVolunteerToShift, removeVolunteerFromShift as dbRemoveVolunteerFromShift, clearMonthAssignments, getPendingSwitchRequests, getAllSwitchRequests } from '../services/shiftAssignmentService';
import { getPendingUsers, approveUserAsAdmin, approveUserAsVolunteer, rejectPendingUser, PendingUser } from '../services/userApprovalService';
import { sendPreferenceReminders } from '../services/reminderService';
import { loadAllEvents, createEvent, updateEvent, deleteEvent, publishEvent, unpublishEvent, getEventAttendances } from '../services/eventService';
import { sendShiftChangeNotifications, getCurrentAssignments } from '../services/shiftChangeNotificationService';

interface AdminDashboardProps {
  volunteers: Volunteer[];
  shifts: Shift[];
  setVolunteers: React.Dispatch<React.SetStateAction<Volunteer[]>>;
  setShifts: React.Dispatch<React.SetStateAction<Shift[]>>;
}

const DAYS = [
  { id: '0', label: 'Sun' },
  { id: '1', label: 'Mon' },
  { id: '2_morning', label: 'Tue (AM)' },
  { id: '2_evening', label: 'Tue (PM)' },
  { id: '3', label: 'Wed' },
  { id: '4', label: 'Thu' },
  { id: '5_opening', label: 'Fri (Open)' },
  { id: '5_closing', label: 'Fri (Close)' },
  { id: '6', label: 'Sat' },
];

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  volunteers, shifts, setVolunteers, setShifts
}) => {
  const [activeTab, setActiveTab] = useState<'volunteers' | 'shifts' | 'auto' | 'events' | 'switchRequests' | 'pendingUsers'>('volunteers');
  const [switchRequests, setSwitchRequests] = useState<ShiftSwitchRequest[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loadingPendingUsers, setLoadingPendingUsers] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [scheduleResultView, setScheduleResultView] = useState<'none' | 'calendar' | 'stats'>('none');

  // Volunteer Management State
  const [searchTerm, setSearchTerm] = useState('');
  const [statsSearchTerm, setStatsSearchTerm] = useState('');
  const [expandedVolunteerId, setExpandedVolunteerId] = useState<string | null>(null);
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);
  const [invitingVolunteer, setInvitingVolunteer] = useState<Volunteer | null>(null);
  const [adminNewBlackoutDate, setAdminNewBlackoutDate] = useState('');
  const [adminNewBlackoutEndDate, setAdminNewBlackoutEndDate] = useState('');

  // Recurring Shift Management State
  const [recurringShifts, setRecurringShifts] = useState<RecurringShift[]>([]);
  const [deletedOccurrences, setDeletedOccurrences] = useState<DeletedShiftOccurrence[]>([]);
  const [displayedShifts, setDisplayedShifts] = useState<Shift[]>([]);

  // New Recurring Shift State (changed from date to dayOfWeek)
  const [newRecurringShift, setNewRecurringShift] = useState<Partial<RecurringShift>>({
    title: '', dayOfWeek: 1, startTime: '09:00', endTime: '17:00', location: 'BOTH', requiredVolunteers: 1
  });

  // Calendar Details State
  const [selectedShiftForDetails, setSelectedShiftForDetails] = useState<Shift | null>(null);
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<Event | null>(null);

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'volunteer' | 'shift', id: string, name?: string } | null>(null);

  // Schedule History State
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [showScheduleHistory, setShowScheduleHistory] = useState(false);
  const [showSaveScheduleModal, setShowSaveScheduleModal] = useState(false);
  const [scheduleNameInput, setScheduleNameInput] = useState('');
  const [scheduleNotesInput, setScheduleNotesInput] = useState('');
  const [saveMode, setSaveMode] = useState<'create' | 'update'>('create');
  const [selectedScheduleToUpdate, setSelectedScheduleToUpdate] = useState<string | null>(null);

  // Events State
  const [events, setEvents] = useState<Event[]>([]);
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [eventAttendances, setEventAttendances] = useState<EventAttendance[]>([]);

  // Auto-Scheduler State: Default to Next Month
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const [targetMonth, setTargetMonth] = useState<number>(nextMonth.getMonth() + 1); // 1-12
  const [targetYear, setTargetYear] = useState<number>(nextMonth.getFullYear());

  // Warn admin about unsaved changes on page refresh/navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (scheduleResultView !== 'none' || editingVolunteer) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [scheduleResultView, editingVolunteer]);

  // Load recurring shifts and deleted occurrences on mount
  useEffect(() => {
    loadRecurringShifts();
    loadDeletedOccurrences();
    loadScheduleHistory();
    loadSwitchRequests();
    loadPendingUsers();
    loadEvents();
  }, []);

  // Note: Removed automatic schedule loading to allow manual selection from saved schedules list
  // Users can now choose which saved schedule to load via the UI

  // Generate displayed shifts whenever data changes
  useEffect(() => {
    const { start, end } = getMonthRange(targetYear, targetMonth - 1);
    const generatedShifts = generateShiftInstances(recurringShifts, deletedOccurrences, start, end);
    const merged = mergeShifts(generatedShifts, shifts);
    setDisplayedShifts(merged);
  }, [recurringShifts, deletedOccurrences, shifts, targetMonth, targetYear]);

  // Load existing assignments from database when month changes
  useEffect(() => {
    loadExistingAssignments();
  }, [targetMonth, targetYear, displayedShifts]);

  const loadRecurringShifts = async () => {
    try {
      const { data, error } = await supabase
        .from('recurring_shifts')
        .select('*')
        .order('day_of_week', { ascending: true });

      if (error) throw error;
      setRecurringShifts((data || []).map(mapRecurringShiftFromDB));
    } catch (error) {
      console.error('Error loading recurring shifts:', error);
    }
  };

  const loadDeletedOccurrences = async () => {
    try {
      const { data, error } = await supabase
        .from('deleted_shift_occurrences')
        .select('*');

      if (error) throw error;
      setDeletedOccurrences((data || []).map(mapDeletedOccurrenceFromDB));
    } catch (error) {
      console.error('Error loading deleted occurrences:', error);
    }
  };

  const loadSwitchRequests = async () => {
    try {
      const requests = await getAllSwitchRequests();
      setSwitchRequests(requests);
    } catch (error) {
      console.error('Error loading switch requests:', error);
    }
  };

  const loadPendingUsers = async () => {
    setLoadingPendingUsers(true);
    try {
      const users = await getPendingUsers();
      setPendingUsers(users);
    } catch (error) {
      console.error('Error loading pending users:', error);
    } finally {
      setLoadingPendingUsers(false);
    }
  };

  const handleApproveAsAdmin = async (userId: string, email: string) => {
    const result = await approveUserAsAdmin(userId, email);
    if (result.success) {
      alert(`${email} has been approved as an admin!`);
      await loadPendingUsers(); // Refresh the list
    } else {
      alert(`Failed to approve user: ${result.error}`);
    }
  };

  const handleApproveAsVolunteer = async (userId: string, email: string, name?: string) => {
    const result = await approveUserAsVolunteer(userId, email, name);
    if (result.success) {
      const displayName = name || email;
      alert(`${displayName} has been approved as a volunteer!`);
      await loadPendingUsers(); // Refresh the list
    } else {
      alert(`Failed to approve user: ${result.error}`);
    }
  };

  const handleRejectUser = async (userId: string, email: string) => {
    if (!confirm(`Are you sure you want to reject ${email}? This will delete their account.`)) {
      return;
    }
    const result = await rejectPendingUser(userId);
    if (result.success) {
      alert(`${email} has been rejected and removed.`);
      await loadPendingUsers(); // Refresh the list
    } else {
      alert(`Failed to reject user: ${result.error}`);
    }
  };

  const handleSendReminders = async () => {
    if (!confirm('Send preference update reminders to all active volunteers?')) {
      return;
    }

    const result = await sendPreferenceReminders();
    if (result.success) {
      alert(`Reminder sent to ${result.sent} volunteers!`);
    } else {
      alert(`Failed to send reminders: ${result.error}`);
    }
  };

  const handleGenerateSchedule = async () => {
    setIsGenerating(true);
    try {
      // Generate 3 different schedule options
      const options = await generateMultipleScheduleOptions(volunteers, shifts, targetMonth, targetYear, 3);

      if (options && options.length > 0) {
        setScheduleOptions(options);
        setShowOptionsModal(true);
      } else {
        alert(`No assignments could be generated for ${targetMonth}/${targetYear}.`);
      }
    } catch (error: any) {
      console.error(error);
      alert(`Failed to generate schedule: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectScheduleOption = (optionId: number) => {
    const selectedOption = scheduleOptions.find(opt => opt.id === optionId);
    if (selectedOption) {
      // Remove the reasoning field to match the expected type
      const assignments = selectedOption.assignments.map(({ shiftId, volunteerId }) => ({
        shiftId,
        volunteerId
      }));
      setGeneratedAssignments(assignments);
      // Capture initial state for change detection
      setInitialAssignments([...assignments]);
      setSelectedOptionId(optionId);
      setShowOptionsModal(false);
      setScheduleResultView('calendar');
    }
  };

  // We need a place to store the assignments since the Shift type is 1-to-1
  const [generatedAssignments, setGeneratedAssignments] = useState<{shiftId: string, volunteerId: string}[]>([]);
  const [isApplyingAssignments, setIsApplyingAssignments] = useState(false);
  const [assignmentsApplied, setAssignmentsApplied] = useState(false);
  const [initialAssignments, setInitialAssignments] = useState<{shiftId: string, volunteerId: string}[]>([]);

  // Multiple schedule options state
  const [scheduleOptions, setScheduleOptions] = useState<Array<{
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
  }>>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  const handleAddRecurringShift = async () => {
    if (!newRecurringShift.title || newRecurringShift.dayOfWeek === undefined) return;

    try {
      const recurringShift: RecurringShift = {
        id: `rs-${Date.now()}`,
        title: newRecurringShift.title,
        dayOfWeek: newRecurringShift.dayOfWeek as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        startTime: newRecurringShift.startTime || '09:00',
        endTime: newRecurringShift.endTime || '17:00',
        location: newRecurringShift.location || 'BOTH',
        requiredSkills: [],
        requiredVolunteers: newRecurringShift.requiredVolunteers || 1,
        isActive: true,
      };

      // Convert to database format and remove id (let Supabase generate it)
      const dbRecurringShift = mapRecurringShiftToDB(recurringShift);
      const { id, ...shiftWithoutId } = dbRecurringShift;

      // Insert into Supabase
      const { data, error } = await supabase
        .from('recurring_shifts')
        .insert([shiftWithoutId])
        .select();

      if (error) {
        console.error('Error inserting recurring shift:', error);
        alert(`Failed to create recurring shift: ${error.message}`);
        return;
      }

      // Update local state
      if (data && data.length > 0) {
        const savedRecurringShift = mapRecurringShiftFromDB(data[0]);
        setRecurringShifts([...recurringShifts, savedRecurringShift]);
      }

      // Generate shift instances for the next 3 months
      console.log('Generating shift instances for the next 3 months...');
      const generateResult = await generateShiftsForNextMonths(3);

      if (generateResult.success) {
        console.log(`Generated ${generateResult.totalCount} shift instances`);
        // Reload shifts from database
        const { data: shiftsData } = await supabase
          .from('shifts')
          .select('*')
          .order('date', { ascending: true });
        if (shiftsData) {
          setShifts(shiftsData.map(mapShiftFromDB));
        }
      } else {
        console.error('Failed to generate shifts:', generateResult.error);
      }

      // Reset form
      setNewRecurringShift({ title: '', dayOfWeek: 1, startTime: '09:00', endTime: '17:00', location: 'BOTH', requiredVolunteers: 1 });

      alert(`Recurring shift created! Generated ${generateResult.totalCount || 0} shift instances for the next 3 months.`);
    } catch (err) {
      console.error('Unexpected error during recurring shift creation:', err);
      alert('An unexpected error occurred while creating recurring shift');
    }
  };

  const requestDeleteShift = (id: string, title: string) => {
    setDeleteConfirmation({ type: 'shift', id, name: title });
  };

  const requestDeleteVolunteer = (id: string, name: string) => {
    setDeleteConfirmation({ type: 'volunteer', id, name });
  };

  const handleDeleteShiftOccurrence = async (shift: Shift) => {
    // Only allow deleting generated shift instances (those with recurringShiftId)
    if (!shift.recurringShiftId || !shift.date) {
      alert('Cannot delete this shift. Only recurring shift occurrences can be deleted.');
      return;
    }

    try {
      // Add to deleted_shift_occurrences table
      const { error } = await supabase
        .from('deleted_shift_occurrences')
        .insert([{
          recurring_shift_id: shift.recurringShiftId,
          deleted_date: shift.date,
        }]);

      if (error) {
        console.error('Error deleting shift occurrence:', error);
        alert(`Failed to delete shift occurrence: ${error.message}`);
        return;
      }

      // Reload deleted occurrences
      await loadDeletedOccurrences();
    } catch (err) {
      console.error('Unexpected error during shift occurrence deletion:', err);
      alert('An unexpected error occurred while deleting shift occurrence');
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmation) return;

    try {
      if (deleteConfirmation.type === 'volunteer') {
        const id = deleteConfirmation.id;

        // Delete from Supabase
        const { error } = await supabase
          .from('volunteers')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Error deleting volunteer:', error);
          alert(`Failed to delete volunteer: ${error.message}`);
          return;
        }

        // Update local state
        setVolunteers(prev => prev.filter(v => v.id !== id));
        // Remove from generated assignments
        setGeneratedAssignments(prev => prev.filter(a => a.volunteerId !== id));
      } else if (deleteConfirmation.type === 'shift') {
        const id = deleteConfirmation.id;

        // Delete from Supabase
        const { error } = await supabase
          .from('shifts')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Error deleting shift:', error);
          alert(`Failed to delete shift: ${error.message}`);
          return;
        }

        // Update local state
        setShifts(prev => prev.filter(s => s.id !== id));
        setGeneratedAssignments(prev => prev.filter(a => a.shiftId !== id));
      }

      setDeleteConfirmation(null);
    } catch (err) {
      console.error('Unexpected error during delete:', err);
      alert('An unexpected error occurred while deleting');
    }
  };

  const handleBulkUpload = async (newVols: Volunteer[]) => {
    try {
      // Convert volunteers to database format
      const dbVolunteers = newVols.map(v => {
        const dbVol = mapVolunteerToDB(v);
        // Remove the id field to let Supabase generate it
        const { id, ...volunteerWithoutId } = dbVol;
        return volunteerWithoutId;
      });

      // Insert volunteers into Supabase
      const { data, error } = await supabase
        .from('volunteers')
        .insert(dbVolunteers)
        .select();

      if (error) {
        console.error('Error inserting volunteers:', error);
        alert(`Failed to save volunteers: ${error.message}`);
        return;
      }

      // Map returned data back to Volunteer format and update local state
      if (data) {
        const savedVolunteers = data.map(mapVolunteerFromDB);
        setVolunteers(prev => [...prev, ...savedVolunteers]);
      }
    } catch (err) {
      console.error('Unexpected error during bulk upload:', err);
      alert('An unexpected error occurred while saving volunteers');
    }
  };

  const handleSkillLevelChange = async (id: string, level: 1 | 2 | 3) => {
    // Update local state immediately for responsive UI
    setVolunteers(prev => prev.map(v => v.id === id ? { ...v, skillLevel: level } : v));

    // Save to database
    try {
      const volunteer = volunteers.find(v => v.id === id);
      if (!volunteer) return;

      const updatedVolunteer = { ...volunteer, skillLevel: level };
      const dbVolunteer = mapVolunteerToDB(updatedVolunteer);

      const { error } = await supabase
        .from('volunteers')
        .update(dbVolunteer)
        .eq('id', id);

      if (error) {
        console.error('Error updating skill level:', error);
        // Revert local state on error
        setVolunteers(prev => prev.map(v => v.id === id ? volunteer : v));
      }
    } catch (error) {
      console.error('Error saving skill level:', error);
    }
  };

  const addAdminBlackoutDate = () => {
    if (!adminNewBlackoutDate || !editingVolunteer) return;

    const datesToAdd: string[] = [];

    // If end date is specified, add all dates in range
    if (adminNewBlackoutEndDate && adminNewBlackoutEndDate >= adminNewBlackoutDate) {
      const startDate = new Date(adminNewBlackoutDate);
      const endDate = new Date(adminNewBlackoutEndDate);

      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (!editingVolunteer.blackoutDates.includes(dateStr)) {
          datesToAdd.push(dateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else {
      // Single date
      if (!editingVolunteer.blackoutDates.includes(adminNewBlackoutDate)) {
        datesToAdd.push(adminNewBlackoutDate);
      }
    }

    if (datesToAdd.length > 0) {
      setEditingVolunteer({
        ...editingVolunteer,
        blackoutDates: [...editingVolunteer.blackoutDates, ...datesToAdd].sort()
      });
    }

    setAdminNewBlackoutDate('');
    setAdminNewBlackoutEndDate('');
  };

  const removeAdminBlackoutDate = (date: string) => {
    if (!editingVolunteer) return;
    setEditingVolunteer({
      ...editingVolunteer,
      blackoutDates: editingVolunteer.blackoutDates.filter(d => d !== date)
    });
  };

  // Temporarily allow editing the current month (April 2026) since the schedule needs updates
  const getDefaultMinDate = () => {
    const today = new Date();
    if (today.getFullYear() === 2026 && today.getMonth() === 3) { // April 2026
      return today.toISOString().split('T')[0];
    }
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  };

  const handleSaveVolunteerEdit = async () => {
    if (!editingVolunteer) return;

    // Strip past-month dates before saving
    const currentMonthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
    const cleanedVolunteer = {
      ...editingVolunteer,
      blackoutDates: editingVolunteer.blackoutDates.filter(d => d >= currentMonthStart),
    };

    try {
      // Convert volunteer to database format
      const dbVolunteer = mapVolunteerToDB(cleanedVolunteer);

      // Update in Supabase
      const { error } = await supabase
        .from('volunteers')
        .update(dbVolunteer)
        .eq('id', cleanedVolunteer.id);

      if (error) {
        console.error('Error updating volunteer:', error);
        alert(`Failed to update volunteer: ${error.message}`);
        return;
      }

      // Update local state
      setVolunteers(prev => prev.map(v => v.id === cleanedVolunteer.id ? cleanedVolunteer : v));
      setEditingVolunteer(null);
    } catch (err) {
      console.error('Unexpected error during update:', err);
      alert('An unexpected error occurred while updating volunteer');
    }
  };

  // Schedule History Functions
  const loadScheduleHistory = async () => {
    const result = await loadSavedSchedules();
    if (result.success && result.schedules) {
      setSavedSchedules(result.schedules);
    }
  };

  // Events Functions
  const loadEvents = async () => {
    const result = await loadAllEvents();
    if (result.success && result.events) {
      setEvents(result.events);
      // Load attendances for all events
      if (result.events.length > 0) {
        const attendResult = await getEventAttendances(result.events.map(e => e.id));
        if (attendResult.success && attendResult.attendances) {
          setEventAttendances(attendResult.attendances);
        }
      }
    }
  };

  const handleCreateEvent = () => {
    setEditingEvent(null);
    setShowEventModal(true);
  };

  const handleEditEvent = (event: Event) => {
    setEditingEvent(event);
    setShowEventModal(true);
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    const result = await deleteEvent(eventId);
    if (result.success) {
      alert('Event deleted successfully');
      loadEvents();
    } else {
      alert(`Failed to delete event: ${result.error}`);
    }
  };

  const handleToggleEventPublish = async (event: Event) => {
    const result = event.isPublished
      ? await unpublishEvent(event.id)
      : await publishEvent(event.id);

    if (result.success) {
      alert(`Event ${event.isPublished ? 'unpublished' : 'published'} successfully`);
      loadEvents();
    } else {
      alert(`Failed to ${event.isPublished ? 'unpublish' : 'publish'} event: ${result.error}`);
    }
  };

  const loadLastScheduleForMonth = async () => {
    const result = await getLatestScheduleForMonth(targetMonth, targetYear);
    if (result.success && result.schedule && result.assignments) {
      // Load the assignments into the current state
      const assignments = result.assignments.map(a => ({
        shiftId: a.shiftId,
        volunteerId: a.volunteerId,
      }));
      setGeneratedAssignments(assignments);
      setScheduleResultView('calendar');
    }
  };

  // Load existing assignments from the database
  const loadExistingAssignments = async () => {
    if (displayedShifts.length === 0) return;

    const shiftIds = displayedShifts.map(s => s.id);
    const dbAssignments = await getShiftAssignments(shiftIds);

    // Convert to the format expected by generatedAssignments
    const assignments = dbAssignments.map(a => ({
      shiftId: a.shiftId,
      volunteerId: a.volunteerId,
    }));

    if (assignments.length > 0) {
      setGeneratedAssignments(assignments);
      setAssignmentsApplied(true);
      setScheduleResultView('calendar');
    }
  };

  // Apply assignments to database so volunteers can see their shifts
  const handleApplyAssignments = async () => {
    if (generatedAssignments.length === 0) {
      alert('No assignments to apply');
      return;
    }

    if (!confirm('Apply these assignments to the database? This will replace any existing assignments for this month. Volunteers will be able to see their shifts.')) {
      return;
    }

    setIsApplyingAssignments(true);
    try {
      // Step 1: Unpublish any previous schedules for this month
      console.log('[AdminDashboard] Unpublishing previous schedules for', targetMonth, targetYear);
      const unpublishResult = await unpublishPreviousSchedules(targetMonth, targetYear);

      if (!unpublishResult.success) {
        alert(`Failed to unpublish previous schedules: ${unpublishResult.error}`);
        setIsApplyingAssignments(false);
        return;
      }

      if (unpublishResult.unpublishedCount > 0) {
        console.log('[AdminDashboard] Unpublished', unpublishResult.unpublishedCount, 'previous schedule(s)');
      }

      // Step 2: Get ALL shift IDs that will be affected (from both displayed shifts and assignments)
      const displayedShiftIds = new Set(displayedShifts.map(s => s.id));
      const assignmentShiftIds = new Set(generatedAssignments.map(a => a.shiftId));
      const allShiftIds = [...new Set([...displayedShiftIds, ...assignmentShiftIds])];

      console.log('[AdminDashboard] Applying assignments');
      console.log('[AdminDashboard] Displayed shifts:', displayedShiftIds.size);
      console.log('[AdminDashboard] Assignment shifts:', assignmentShiftIds.size);
      console.log('[AdminDashboard] Total unique shifts to clear:', allShiftIds.length);

      // Step 3: Clear existing assignments for all these shifts to avoid duplicates
      const clearResult = await clearMonthAssignments(allShiftIds);

      if (!clearResult.success) {
        alert(`Failed to clear existing assignments: ${clearResult.error}`);
        setIsApplyingAssignments(false);
        return;
      }

      console.log('[AdminDashboard] Cleared', clearResult.deletedCount, 'existing assignments');

      // Step 4: Apply the new assignments
      const result = await applyScheduleAssignments(generatedAssignments);

      if (!result.success) {
        alert(`Failed to apply assignments: ${result.error}`);
        setIsApplyingAssignments(false);
        return;
      }

      // Step 5: Automatically save the schedule with a timestamp-based name and publish it
      const monthName = new Date(targetYear, targetMonth - 1).toLocaleString('en-US', { month: 'long' });
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      const scheduleName = `${monthName} ${targetYear} Schedule - Applied ${timestamp}`;

      console.log('[AdminDashboard] Auto-saving schedule as:', scheduleName);
      const saveResult = await saveSchedule(
        scheduleName,
        targetMonth,
        targetYear,
        generatedAssignments,
        'Automatically created when Apply to Database was clicked',
        true // is_published = true
      );

      if (!saveResult.success) {
        console.error('[AdminDashboard] Failed to auto-save schedule:', saveResult.error);
        // Don't fail the whole operation - assignments are already applied
        alert(`Assignments applied successfully!\n\nCleared ${clearResult.deletedCount || 0} old assignment(s)\nApplied ${generatedAssignments.length} new assignment(s)\n\nWarning: Failed to save schedule to history: ${saveResult.error}\n\nVolunteers can now see their shifts.`);
      } else {
        console.log('[AdminDashboard] Schedule auto-saved with ID:', saveResult.scheduleId);
        alert(`Assignments applied successfully!\n\nCleared ${clearResult.deletedCount || 0} old assignment(s)\nApplied ${generatedAssignments.length} new assignment(s)\nSchedule saved as: "${scheduleName}"\n\nVolunteers can now see their shifts and the schedule in their Monthly Schedule tab.`);
        // Reload schedule history to show the new schedule
        loadScheduleHistory();
      }

      setAssignmentsApplied(true);
      // Capture initial state after applying for change detection
      setInitialAssignments([...generatedAssignments]);
    } catch (err) {
      console.error('Exception applying assignments:', err);
      alert('An error occurred while applying assignments');
    } finally {
      setIsApplyingAssignments(false);
    }
  };

  // Clear all assignments for the current month (only from shift_assignments table, not saved history)
  const handleClearAssignments = async () => {
    const monthName = new Date(targetYear, targetMonth - 1).toLocaleString('en-US', { month: 'long' });

    if (!confirm(`Clear ALL volunteer assignments for ${monthName} ${targetYear}?\n\nThis will:\n• Remove all volunteer shift assignments from the database\n• Volunteers will no longer see these shifts\n• Saved schedules in history will NOT be deleted\n• Current view will be cleared\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      // Get ALL shift IDs (from both displayed shifts and any loaded assignments)
      const displayedShiftIds = new Set(displayedShifts.map(s => s.id));
      const assignmentShiftIds = new Set(generatedAssignments.map(a => a.shiftId));
      const allShiftIds = [...new Set([...displayedShiftIds, ...assignmentShiftIds])];

      console.log('[AdminDashboard] Clearing assignments');
      console.log('[AdminDashboard] Displayed shifts:', displayedShiftIds.size);
      console.log('[AdminDashboard] Assignment shifts:', assignmentShiftIds.size);
      console.log('[AdminDashboard] Total unique shifts to clear:', allShiftIds.length);

      const clearResult = await clearMonthAssignments(allShiftIds);
      console.log('[AdminDashboard] Clear result:', clearResult);

      if (!clearResult.success) {
        alert(`Failed to clear assignments: ${clearResult.error}`);
        return;
      }

      // Clear the UI state
      setGeneratedAssignments([]);
      setAssignmentsApplied(false);
      setScheduleResultView('none');

      const deletedCount = clearResult.deletedCount || 0;
      alert(`Cleared ${deletedCount} volunteer assignment(s) for ${monthName} ${targetYear}.\n\nVolunteers will no longer see these shifts.\nSaved schedules in history are preserved.`);
    } catch (err) {
      console.error('Exception clearing assignments:', err);
      alert('An error occurred while clearing assignments');
    }
  };

  const handleSaveSchedule = async () => {
    if (!scheduleNameInput.trim()) {
      alert('Please enter a schedule name');
      return;
    }

    if (generatedAssignments.length === 0) {
      alert('No assignments to save');
      return;
    }

    if (saveMode === 'update' && !selectedScheduleToUpdate) {
      alert('Please select a schedule to update');
      return;
    }

    let result;
    if (saveMode === 'update' && selectedScheduleToUpdate) {
      // Update existing schedule
      result = await updateSchedule(
        selectedScheduleToUpdate,
        scheduleNameInput,
        generatedAssignments,
        scheduleNotesInput,
        assignmentsApplied
      );
    } else {
      // Create new schedule
      result = await saveSchedule(
        scheduleNameInput,
        targetMonth,
        targetYear,
        generatedAssignments,
        scheduleNotesInput,
        assignmentsApplied
      );
    }

    if (result.success && result.scheduleId) {
      // Detect shift changes and send notifications to affected volunteers
      let changeNotificationsSent = 0;
      try {
        const changeResult = await sendShiftChangeNotifications(
          initialAssignments,
          generatedAssignments,
          displayedShifts,
          volunteers
        );

        if (changeResult.success) {
          changeNotificationsSent = changeResult.emailsSent;
          if (changeResult.emailsSent > 0) {
            console.log(`✓ Sent ${changeResult.emailsSent} shift change notification(s)`);
          }
        } else if (changeResult.errors.length > 0) {
          console.warn('Some shift change notifications failed:', changeResult.errors);
        }
      } catch (error) {
        console.error('Error sending shift change notifications:', error);
      }

      // Update initial assignments to current state for future comparisons
      setInitialAssignments([...generatedAssignments]);

      const action = saveMode === 'update' ? 'updated' : 'saved';
      if (changeNotificationsSent > 0) {
        alert(`Schedule ${action} successfully!\n\nSent ${changeNotificationsSent} shift change notification${changeNotificationsSent !== 1 ? 's' : ''} to affected volunteers.`);
      } else {
        alert(`Schedule ${action} successfully!`);
      }

      setShowSaveScheduleModal(false);
      setScheduleNameInput('');
      setScheduleNotesInput('');
      setSaveMode('create');
      setSelectedScheduleToUpdate(null);
      loadScheduleHistory();
    } else {
      const action = saveMode === 'update' ? 'update' : 'save';
      alert(`Failed to ${action} schedule: ${result.error}`);
    }
  };

  const handleLoadSchedule = async (scheduleId: string) => {
    const result = await loadScheduleAssignments(scheduleId);
    if (result.success && result.assignments) {
      const assignments = result.assignments.map(a => ({
        shiftId: a.shiftId,
        volunteerId: a.volunteerId,
      }));
      setGeneratedAssignments(assignments);
      // Capture initial state for change detection
      setInitialAssignments([...assignments]);
      setScheduleResultView('calendar');
      setShowScheduleHistory(false);

      // Set the target month/year to match the loaded schedule
      const schedule = savedSchedules.find(s => s.id === scheduleId);
      if (schedule) {
        setTargetMonth(schedule.targetMonth);
        setTargetYear(schedule.targetYear);
      }
    } else {
      alert(`Failed to load schedule: ${result.error}`);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    const schedule = savedSchedules.find(s => s.id === scheduleId);
    const scheduleName = schedule?.name || 'this schedule';

    if (!confirm(`Delete "${scheduleName}"?\n\nThis will:\n• Remove the schedule from history\n• Remove all volunteer shift assignments (volunteers will no longer see these shifts)\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      // First, load the assignments from this saved schedule to get shift IDs
      const assignmentsResult = await loadScheduleAssignments(scheduleId);

      if (assignmentsResult.success && assignmentsResult.assignments && assignmentsResult.assignments.length > 0) {
        // Get unique shift IDs from this schedule
        const shiftIds = [...new Set(assignmentsResult.assignments.map(a => a.shiftId))];

        console.log('[AdminDashboard] Deleting schedule and clearing', shiftIds.length, 'shifts from shift_assignments');

        // Clear these assignments from shift_assignments (what volunteers see)
        const clearResult = await clearMonthAssignments(shiftIds);

        if (!clearResult.success) {
          console.error('[AdminDashboard] Failed to clear shift_assignments:', clearResult.error);
          // Continue anyway to delete the saved schedule
        } else {
          console.log('[AdminDashboard] Cleared', clearResult.deletedCount, 'volunteer assignments');
        }
      }

      // Now delete the saved schedule from history
      const result = await deleteSchedule(scheduleId);

      if (result.success) {
        alert(`Schedule "${scheduleName}" deleted successfully.\n\nVolunteers will no longer see these shifts.`);
        loadScheduleHistory();

        // Clear UI state if we were viewing this schedule
        setGeneratedAssignments([]);
        setAssignmentsApplied(false);
        setScheduleResultView('none');
      } else {
        alert(`Failed to delete schedule: ${result.error}`);
      }
    } catch (err) {
      console.error('Exception deleting schedule:', err);
      alert('An error occurred while deleting the schedule');
    }
  };

  // Assignment Management Functions
  const handleAddVolunteerToShift = async (shiftId: string, volunteerId: string) => {
    // Check if already assigned
    const isAlreadyAssigned = generatedAssignments.some(
      a => a.shiftId === shiftId && a.volunteerId === volunteerId
    );

    if (isAlreadyAssigned) {
      alert('This volunteer is already assigned to this shift');
      return;
    }

    // Check if shift is at recommended capacity (5) - allow admin to override
    const currentCount = generatedAssignments.filter(a => a.shiftId === shiftId).length;
    if (currentCount >= 5) {
      const confirmed = confirm(
        `This shift already has ${currentCount} volunteers (recommended maximum is 5).\n\n` +
        `Are you sure you want to add another volunteer?\n\n` +
        `Adding more volunteers may result in overcrowding.`
      );
      if (!confirmed) {
        return;
      }
    }

    // Update local state
    setGeneratedAssignments(prev => [...prev, { shiftId, volunteerId }]);

    // Update database
    const result = await dbAddVolunteerToShift(shiftId, volunteerId);
    if (!result.success) {
      console.error('Failed to add volunteer to shift in database:', result.error);
      // Rollback local state
      setGeneratedAssignments(prev => prev.filter(a => !(a.shiftId === shiftId && a.volunteerId === volunteerId)));
      alert('Failed to assign volunteer. Please try again.');
    }
  };

  const handleRemoveVolunteerFromShift = async (shiftId: string, volunteerId: string) => {
    console.log('[AdminDashboard] Removing volunteer from shift:', { shiftId, volunteerId });

    // Update local state first
    setGeneratedAssignments(prev =>
      prev.filter(a => !(a.shiftId === shiftId && a.volunteerId === volunteerId))
    );

    // Only try to update database if assignments have been applied
    // If we're editing a draft schedule, the assignment might not exist in DB yet
    const result = await dbRemoveVolunteerFromShift(shiftId, volunteerId);
    console.log('[AdminDashboard] Remove result:', result);

    if (!result.success) {
      // Check if this is just a "not found" error (draft schedule, not in DB yet)
      // In that case, the local state update is sufficient
      const isNotFoundError = result.error?.includes('not have permission') || result.error?.includes('Could not remove');

      if (isNotFoundError) {
        // Assignment wasn't in DB - that's OK for draft schedules
        console.log('[AdminDashboard] Assignment not in database (draft schedule) - local state updated');
      } else {
        // Real error - rollback
        console.error('[AdminDashboard] Failed to remove volunteer from shift in database:', result.error);
        setGeneratedAssignments(prev => [...prev, { shiftId, volunteerId }]);
        alert(`Failed to remove volunteer from database: ${result.error || 'Unknown error'}`);
      }
    } else {
      console.log('[AdminDashboard] Successfully removed volunteer from shift_assignments table');
    }
  };

  const filteredVolunteers = volunteers
    .filter(v =>
      v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.role.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically by name

  // Helper function to check if volunteer updated preferences in last 7 days
  const wasRecentlyUpdated = (updatedAt?: string): boolean => {
    if (!updatedAt) return false;
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return new Date(updatedAt) > sevenDaysAgo;
  };

  // Count recently updated volunteers
  const recentlyUpdatedCount = volunteers.filter(vol => wasRecentlyUpdated(vol.updatedAt)).length;

  const getUpcomingWeekShifts = (allShifts: Shift[]) => {
    const today = new Date();
    const currentDay = today.getDay(); 
    const endOfWeek = new Date(today);
    endOfWeek.setDate(today.getDate() + (6 - currentDay));
    const todayStr = today.toISOString().split('T')[0];
    const endOfWeekStr = endOfWeek.toISOString().split('T')[0];
    return allShifts.filter(shift => shift.date >= todayStr && shift.date <= endOfWeekStr);
  };

  const visibleShifts = activeTab === 'shifts' ? getUpcomingWeekShifts(displayedShifts) : displayedShifts;

  // --- Calendar & Stats Helper Components ---

  const CalendarView = () => {
    const year = targetYear;
    const month = targetMonth - 1;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOffset = firstDay.getDay();
    const monthName = firstDay.toLocaleString('default', { month: 'long', year: 'numeric' });

    const days: (number | null)[] = [];
    for (let i = 0; i < startDayOffset; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    // Filter published events for display
    const publishedEvents = events.filter(e => e.isPublished);

    return (
      <div className="animate-fade-in">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-xl font-bold text-slate-900">{monthName} Schedule</h2>
          <div className="flex flex-wrap gap-3 text-xs sm:text-sm bg-white px-4 py-3 rounded-lg border border-slate-200 shadow-sm">
            <div className="font-semibold text-slate-600 mr-1">Locations:</div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">H</span>
              <span>Hatachana</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-orange-500 text-white text-[9px] font-bold flex items-center justify-center">D</span>
              <span>Dizengoff</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-purple-500 text-white text-[9px] font-bold flex items-center justify-center">B</span>
              <span>Both</span>
            </div>
            <div className="w-px h-4 bg-slate-300"></div>
            <div className="font-semibold text-slate-600">Staffing:</div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-red-500"></span>
              <span>Critical (&lt;2)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-amber-400"></span>
              <span>Minimal (2)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-emerald-500"></span>
              <span>Good (3+)</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="py-3 text-center text-sm font-semibold text-slate-600">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 auto-rows-fr bg-slate-100 gap-px border-l border-slate-200">
            {days.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} className="bg-white min-h-[200px]" />;

              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const daysShifts = shifts.filter(s => s.date === dateStr).sort((a, b) => a.startTime.localeCompare(b.startTime));

              // Filter events for this date
              const dayEvents = publishedEvents.filter(event => {
                if (event.isRecurring) {
                  // Check if this date falls on the recurring day
                  const date = new Date(dateStr);
                  const dayOfWeek = date.getDay();

                  // Check if day matches
                  if (dayOfWeek !== event.recurrenceDayOfWeek) return false;

                  // Check if within recurrence date range
                  if (event.recurrenceStartDate && dateStr < event.recurrenceStartDate) return false;
                  if (event.recurrenceEndDate && dateStr > event.recurrenceEndDate) return false;

                  return true;
                } else {
                  // One-time event
                  return event.date === dateStr;
                }
              });

              return (
                <div key={day} className="bg-white min-h-[200px] p-3 hover:bg-slate-50 transition-colors flex flex-col">
                  <div className="text-base font-bold text-slate-400 mb-2">{day}</div>
                  <div className="space-y-2 flex-1">
                    {daysShifts.map(s => {
                      // Determine location from shift properties
                      const location = s.location || 'BOTH';
                      const isDizengoff = location === 'DIZENGOFF';
                      const isHatachana = location === 'HATACHANA';
                      const isBoth = location === 'BOTH';

                      // Find all assignments for this shift from the AI result
                      const assignees = generatedAssignments
                        .filter(a => a.shiftId === s.id)
                        .map(a => volunteers.find(v => v.id === a.volunteerId))
                        .filter(Boolean) as Volunteer[];

                      const count = assignees.length;

                      // Status logic
                      let borderClass = 'border-red-400'; // Critical
                      if (count >= 2) borderClass = 'border-amber-400'; // Minimal
                      if (count >= 3) borderClass = 'border-emerald-500'; // Good

                      // Location colors - more distinct
                      let bgClass = 'bg-slate-50';
                      let textClass = 'text-slate-900';
                      let locationBadge = '';
                      let locationBadgeClass = '';

                      if (isDizengoff) {
                        bgClass = 'bg-orange-50';
                        textClass = 'text-orange-900';
                        locationBadge = 'D';
                        locationBadgeClass = 'bg-orange-500 text-white';
                      } else if (isHatachana) {
                        bgClass = 'bg-blue-50';
                        textClass = 'text-blue-900';
                        locationBadge = 'H';
                        locationBadgeClass = 'bg-blue-500 text-white';
                      } else if (isBoth) {
                        bgClass = 'bg-purple-50';
                        textClass = 'text-purple-900';
                        locationBadge = 'B';
                        locationBadgeClass = 'bg-purple-500 text-white';
                      }

                      return (
                        <div
                          key={s.id}
                          onClick={() => setSelectedShiftForDetails(s)}
                          className={`
                            cursor-pointer group relative pl-2 pr-1 py-1.5 rounded-r border-l-4 text-xs shadow-sm hover:shadow-md transition-all
                            ${bgClass}
                            ${borderClass}
                          `}
                        >
                          <div className="flex justify-between items-center mb-1 gap-1">
                             <div className="flex items-center gap-1">
                               <span className={`w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${locationBadgeClass}`}>
                                 {locationBadge}
                               </span>
                               <span className={`font-bold ${textClass}`}>
                                 {s.startTime.slice(0, 5)}
                               </span>
                             </div>
                             <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                               count < 2 ? 'bg-red-100 text-red-700' :
                               count >= 3 ? 'bg-emerald-100 text-emerald-700' :
                               'bg-amber-100 text-amber-700'
                             }`}>
                               {count}/5
                             </span>
                          </div>

                          <div className="space-y-1">
                            {assignees.slice(0, 6).map(v => (
                              <div key={v.id} className="truncate opacity-90 text-[15px] font-medium flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                {v.name}
                              </div>
                            ))}
                            {count > 6 && (
                              <div className="text-[10px] opacity-60 italic pl-2">+{count - 6} more</div>
                            )}
                             {count === 0 && (
                              <div className="text-[9px] text-red-500 italic">Unassigned</div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Render Events */}
                    {dayEvents.map(event => (
                      <div
                        key={event.id}
                        onClick={() => setSelectedEventForDetails(event)}
                        className="cursor-pointer p-2 rounded border border-green-300 bg-green-50 text-xs hover:shadow-md transition-shadow"
                        title={`${event.title}${event.description ? ': ' + event.description : ''}\n${event.startTime}-${event.endTime}${event.location ? '\n' + event.location : ''}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          {event.emoji && (
                            <span className="text-base flex-shrink-0">{event.emoji}</span>
                          )}
                          <span className="font-bold text-green-800 text-xs">
                            {event.startTime.slice(0,5)}
                          </span>
                        </div>
                        <div className="text-xs text-green-700 font-medium truncate">
                          {event.title}
                        </div>
                        {event.location && (
                          <div className="text-[10px] text-green-600 truncate mt-0.5">
                            {event.location}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const StatsView = () => {
    const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;

    const stats = volunteers.map(vol => {
      const capacity = getMonthlyCapacity(vol.frequency);

      const volunteerAssignments = generatedAssignments.filter(a => {
         const shift = shifts.find(s => s.id === a.shiftId);
         return shift && shift.date.startsWith(targetMonthStr) && a.volunteerId === vol.id;
      });

      const assignedShifts = volunteerAssignments.map(a => {
        return shifts.find(s => s.id === a.shiftId);
      }).filter(Boolean).sort((a, b) => a!.date.localeCompare(b!.date));

      const assignedCount = volunteerAssignments.length;
      const percentage = capacity > 0 ? (assignedCount / capacity) * 100 : 0;

      return {
        ...vol,
        capacity,
        assignedCount,
        percentage,
        assignedShifts
      };
    }).filter(vol =>
      vol.name.toLowerCase().includes(statsSearchTerm.toLowerCase()) ||
      vol.role.toLowerCase().includes(statsSearchTerm.toLowerCase())
    ).sort((a, b) => b.percentage - a.percentage);

    return (
      <div className="animate-fade-in">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-900">Volunteer Utilization ({targetMonthStr})</h2>
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or role..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={statsSearchTerm}
              onChange={(e) => setStatsSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Volunteer</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Role</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Assignments / Capacity</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.map(vol => (
                <React.Fragment key={vol.id}>
                  <tr
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setExpandedVolunteerId(expandedVolunteerId === vol.id ? null : vol.id)}
                  >
                    <td className="px-6 py-4 text-base font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <ChevronRight
                          size={16}
                          className={`transition-transform ${expandedVolunteerId === vol.id ? 'rotate-90' : ''}`}
                        />
                        {vol.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 text-sm">{vol.role} ({vol.skillLevel})</td>
                    <td className="px-6 py-4 font-medium text-slate-800">
                      <span className={vol.assignedCount > vol.capacity ? 'text-red-600 font-bold' : ''}>
                         {vol.assignedCount}
                      </span> / {vol.capacity}
                    </td>
                    <td className="px-6 py-4 w-1/3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              vol.assignedCount > vol.capacity ? 'bg-red-500' :
                              vol.percentage >= 100 ? 'bg-emerald-500' :
                              vol.percentage >= 50 ? 'bg-blue-500' : 'bg-amber-500'
                            }`}
                            style={{ width: `${Math.min(vol.percentage, 100)}%` }}
                          ></div>
                        </div>
                        <span className={`text-xs font-semibold w-12 text-right ${vol.assignedCount > vol.capacity ? 'text-red-600' : 'text-slate-500'}`}>
                          {Math.round(vol.percentage)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                  {expandedVolunteerId === vol.id && (
                    <tr>
                      <td colSpan={4} className="px-6 py-4 bg-slate-50">
                        <div className="space-y-2">
                          <h4 className="font-semibold text-slate-700 mb-3">Assigned Shifts for {vol.name}</h4>
                          {vol.assignedShifts && vol.assignedShifts.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {vol.assignedShifts.map(shift => {
                                const shiftDate = new Date(shift.date);
                                const formattedDate = shiftDate.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric'
                                });
                                const location = shift.location || 'BOTH';
                                let bgColor = 'bg-purple-100 border-purple-300';
                                let locationText = 'Both Locations';
                                if (location === 'DIZENGOFF') {
                                  bgColor = 'bg-orange-100 border-orange-300';
                                  locationText = 'Dizengoff';
                                } else if (location === 'HATACHANA') {
                                  bgColor = 'bg-blue-100 border-blue-300';
                                  locationText = 'Hatachana';
                                }

                                return (
                                  <div key={shift.id} className={`p-3 rounded-lg border ${bgColor}`}>
                                    <div className="font-medium text-slate-900">{formattedDate}</div>
                                    <div className="text-sm text-slate-600">{shift.startTime} - {shift.endTime}</div>
                                    <div className="text-xs text-slate-500 mt-1">{locationText}</div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-slate-500 italic">No shifts assigned</div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const getSkillButtonClass = (volSkill: number, btnLevel: number) => {
    if (volSkill !== btnLevel) {
      return 'bg-slate-100 text-slate-300 hover:bg-slate-200';
    }
    let colorClass = 'bg-slate-500';
    if (btnLevel === 3) colorClass = 'bg-amber-500';
    if (btnLevel === 2) colorClass = 'bg-indigo-500';
    
    return `${colorClass} text-white shadow-md scale-110`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-6 sticky top-0 z-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Admin Dashboard</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-1">Manage your team and organize upcoming events</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
             <button
              onClick={() => setActiveTab('volunteers')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap text-sm ${activeTab === 'volunteers' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Users size={16} /> <span className="hidden sm:inline">Volunteers</span><span className="sm:hidden">Vol.</span>
            </button>
            <button
              onClick={() => setActiveTab('shifts')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap text-sm ${activeTab === 'shifts' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Calendar size={16} /> Shifts
            </button>
            <button
              onClick={() => setActiveTab('auto')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap text-sm ${activeTab === 'auto' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Sparkles size={16} /> <span className="hidden sm:inline">Auto-Schedule</span><span className="sm:hidden">Auto</span>
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap text-sm ${activeTab === 'events' ? 'bg-pink-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Calendar size={16} /> Events
            </button>
            <button
              onClick={() => setActiveTab('switchRequests')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap text-sm ${activeTab === 'switchRequests' ? 'bg-amber-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <Repeat size={16} /> <span className="hidden sm:inline">Switch Requests</span><span className="sm:hidden">Switch</span> {switchRequests.length > 0 && <span className="bg-amber-100 text-amber-800 text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold">{switchRequests.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('pendingUsers')}
              className={`px-3 sm:px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all whitespace-nowrap text-sm ${activeTab === 'pendingUsers' ? 'bg-purple-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              <UserCheck size={16} /> <span className="hidden sm:inline">Pending Users</span><span className="sm:hidden">Pending</span> {pendingUsers.length > 0 && <span className="bg-purple-100 text-purple-800 text-xs px-1.5 sm:px-2 py-0.5 rounded-full font-bold">{pendingUsers.length}</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-8 overflow-y-auto">
        
        {/* Volunteers Tab */}
        {activeTab === 'volunteers' && (
          <div className="max-w-7xl mx-auto animate-fade-in">
            {/* Recently Updated Summary */}
            {recentlyUpdatedCount > 0 && (
              <div className="mb-6 bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 rounded-xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
                  <CheckCircle size={24} className="text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-emerald-900">
                    {recentlyUpdatedCount} {recentlyUpdatedCount === 1 ? 'volunteer has' : 'volunteers have'} updated preferences in the last 7 days
                  </h3>
                  <p className="text-sm text-emerald-700">Volunteers are active! This is a great time to run the auto-scheduler.</p>
                </div>
                <button
                  onClick={() => setActiveTab('auto')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                >
                  <Sparkles size={18} /> Go to Auto-Schedule
                </button>
              </div>
            )}

            <div className="flex justify-between items-center mb-6">
              <div className="relative w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input
                  type="text"
                  placeholder="Search by name or role..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSendReminders}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
                  title="Send reminder to all volunteers to update their preferences"
                >
                  <Mail size={18} /> Send Reminder
                </button>
                <button
                  onClick={() => setShowBulkUpload(true)}
                  className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors"
                >
                  <Upload size={18} /> Bulk Import
                </button>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-slate-700">Name / Contact</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">Role / Freq</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">Level</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">Location</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">Pref. Days</th>
                    <th className="px-6 py-4 font-semibold text-slate-700">Constraints</th>
                    <th className="px-6 py-4 font-semibold text-slate-700 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredVolunteers.map(vol => (
                    <tr key={vol.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="text-base font-semibold text-slate-900">{vol.name}</div>
                          {wasRecentlyUpdated(vol.updatedAt) && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200" title="Updated preferences in the last 7 days">
                              <CheckCircle size={12} className="mr-1" /> Updated
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-slate-500">{vol.email}</div>
                        <div className="text-xs text-slate-400">{vol.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                         <div className="text-sm font-medium text-slate-700">{vol.role}</div>
                         <div className="text-xs text-slate-500">{vol.frequency}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 items-center">
                          {[1, 2, 3].map((level) => (
                            <button
                              key={level}
                              onClick={() => handleSkillLevelChange(vol.id, level as 1|2|3)}
                              title={`Set Level ${level}`}
                              className={`w-6 h-6 rounded-full text-xs font-bold transition-all flex items-center justify-center ${getSkillButtonClass(vol.skillLevel, level)}`}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-1 pl-1">
                          {vol.skillLevel === 1 ? 'Entry' : vol.skillLevel === 2 ? 'Mid' : 'Expert'}
                        </div>
                      </td>
                       <td className="px-6 py-4">
                         <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">
                           {vol.preferredLocation}
                         </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-slate-500 flex flex-wrap gap-1">
                          {vol.preferredDays && vol.preferredDays.length > 0 
                            ? vol.preferredDays.map(d => (
                              <span key={d} className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs">{d}</span>
                            )) 
                            : 'Any'}
                        </div>
                      </td>
                       <td className="px-6 py-4">
                        {vol.blackoutDates && vol.blackoutDates.length > 0 && (
                          <div className="text-xs text-red-500 mb-1" title={vol.blackoutDates.join(', ')}>
                            {vol.blackoutDates.length} blackout dates
                          </div>
                        )}
                        {vol.onlyDates && vol.onlyDates.length > 0 && (
                          <div className="text-xs text-green-600" title={vol.onlyDates.join(', ')}>
                            Only: {vol.onlyDates.length} specific dates
                          </div>
                        )}
                        {(!vol.blackoutDates?.length && !vol.onlyDates?.length) && (
                          <span className="text-xs text-slate-400">None</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setInvitingVolunteer(vol)}
                            className="text-slate-400 hover:text-emerald-600 transition-colors p-1"
                            title="Send Invite"
                          >
                            <Mail size={18} />
                          </button>
                          <button
                            onClick={() => setEditingVolunteer(vol)}
                            className="text-slate-400 hover:text-indigo-600 transition-colors p-1"
                            title="Edit"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => requestDeleteVolunteer(vol.id, vol.name)}
                            className="text-slate-400 hover:text-red-600 transition-colors p-1"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredVolunteers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
                        No volunteers found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Shifts Tab */}
        {activeTab === 'shifts' && (
          <div className="max-w-6xl mx-auto animate-fade-in flex gap-6">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Upcoming Shifts (This Week)</h2>
                <div className="text-sm text-slate-500">
                  Showing {visibleShifts.length} shifts
                </div>
              </div>
              <div className="space-y-4">
                {visibleShifts.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300 text-slate-500">
                    No upcoming shifts found for this week.
                  </div>
                ) : (
                  visibleShifts.map(shift => {
                    // This tab still uses the singular assignedVolunteerId from the Shift type
                    // For improved behavior we should use the assignments state, but to avoid complexity in this tab vs calendar tab
                    // we will show just the single assignee if present, or "Unassigned"
                    const assignee = volunteers.find(v => v.id === shift.assignedVolunteerId);
                    return (
                      <div key={shift.id} className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex justify-between items-start group">
                        <div>
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-slate-900">{shift.title}</h3>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              shift.status === 'Open' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                            }`}>
                              {shift.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
                            <span className="flex items-center gap-1"><Calendar size={14} /> {shift.date}</span>
                            <span className="flex items-center gap-1"><Clock size={14} /> {shift.startTime} - {shift.endTime}</span>
                          </div>
                          {assignee && (
                            <div className="mt-3 flex items-center gap-2 text-sm text-indigo-600 font-medium">
                              <CheckCircle size={16} /> Assigned to {assignee.name}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteShiftOccurrence(shift)}
                          className="text-slate-300 hover:text-red-500 transition-colors p-2 rounded hover:bg-red-50"
                          title="Delete This Occurrence"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="w-80">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 sticky top-24">
                <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                  <Plus size={18} className="text-indigo-600" /> Create Recurring Shift
                </h3>
                <p className="text-xs text-slate-500 mb-4">Create a shift that repeats every week</p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Shift Title</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newRecurringShift.title}
                      onChange={e => setNewRecurringShift({...newRecurringShift, title: e.target.value})}
                      placeholder="e.g., Monday Morning Shift"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Day of Week</label>
                    <select
                      className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newRecurringShift.dayOfWeek}
                      onChange={e => setNewRecurringShift({...newRecurringShift, dayOfWeek: parseInt(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5 | 6})}
                    >
                      <option value={0}>Sunday</option>
                      <option value={1}>Monday</option>
                      <option value={2}>Tuesday</option>
                      <option value={3}>Wednesday</option>
                      <option value={4}>Thursday</option>
                      <option value={5}>Friday</option>
                      <option value={6}>Saturday</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                    <select
                      className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      value={newRecurringShift.location}
                      onChange={e => setNewRecurringShift({...newRecurringShift, location: e.target.value})}
                    >
                      <option value="BOTH">Both Locations</option>
                      <option value="HATACHANA">Hatachana</option>
                      <option value="DIZENGOFF">Dizengoff</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Start</label>
                      <input
                        type="time"
                        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={newRecurringShift.startTime}
                        onChange={e => setNewRecurringShift({...newRecurringShift, startTime: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">End</label>
                      <input
                        type="time"
                        className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={newRecurringShift.endTime}
                        onChange={e => setNewRecurringShift({...newRecurringShift, endTime: e.target.value})}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleAddRecurringShift}
                    className="w-full bg-indigo-600 text-white py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors mt-2"
                  >
                    Create Recurring Shift
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Schedule Tab */}
        {activeTab === 'auto' && (
          <div className="max-w-7xl mx-auto animate-fade-in text-center pt-2">
            
            {scheduleResultView === 'none' ? (
              <div className="pt-6">
                <div className="inline-block p-4 bg-emerald-100 rounded-full text-emerald-600 mb-6">
                  <Sparkles size={48} />
                </div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">AI Auto-Scheduler</h2>
                <p className="text-lg text-slate-600 mb-8 max-w-xl mx-auto">
                  Automatically generate a fair and balanced schedule for your team.
                </p>

                {/* Target Month Selector */}
                <div className="max-w-sm mx-auto mb-8 bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-left">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Select Target Month</label>
                  <div className="grid grid-cols-2 gap-3">
                     <select 
                        value={targetMonth} 
                        onChange={(e) => setTargetMonth(parseInt(e.target.value))}
                        className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                      >
                        {Array.from({length: 12}, (_, i) => i + 1).map(m => (
                          <option key={m} value={m}>{new Date(0, m-1).toLocaleString('default', { month: 'long' })}</option>
                        ))}
                      </select>
                      <input 
                        type="number" 
                        value={targetYear}
                        onChange={(e) => setTargetYear(parseInt(e.target.value))}
                        className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                        min="2024" max="2030"
                      />
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    Note: Shifts must exist in the system for this month.
                  </p>
                </div>
                
                <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto mb-10 text-left">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="text-3xl font-bold text-slate-900 mb-1">{volunteers.filter(v => v.availabilityStatus === 'Active').length}</div>
                    <div className="text-sm text-slate-500">Active Volunteers</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="text-3xl font-bold text-indigo-600 mb-1">
                      {shifts.filter(s => {
                         const d = new Date(s.date);
                         return s.status === 'Open' && d.getMonth() + 1 === targetMonth && d.getFullYear() === targetYear;
                      }).length}
                    </div>
                    <div className="text-sm text-slate-500">Open Shifts ({targetMonth}/{targetYear})</div>
                  </div>
                </div>

                {/* Saved Schedules for Selected Month */}
                {savedSchedules.filter(s => s.targetMonth === targetMonth && s.targetYear === targetYear).length > 0 && (
                  <div className="max-w-lg mx-auto mb-8 bg-indigo-50 border border-indigo-200 p-4 rounded-xl text-left">
                    <div className="flex items-center gap-2 mb-3">
                      <History size={18} className="text-indigo-600" />
                      <h3 className="font-bold text-slate-900">Saved Schedules for {targetMonth}/{targetYear}</h3>
                    </div>
                    <div className="space-y-2 mb-3">
                      {(() => {
                        const monthSchedules = savedSchedules
                          .filter(s => s.targetMonth === targetMonth && s.targetYear === targetYear);
                        // Find the latest published schedule (most recently created among published)
                        const latestPublished = monthSchedules
                          .filter(s => s.isPublished)
                          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
                        // Sort: latest published first, then the rest by creation date
                        const sorted = [...monthSchedules].sort((a, b) => {
                          if (a.id === latestPublished?.id) return -1;
                          if (b.id === latestPublished?.id) return 1;
                          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                        });
                        return sorted.slice(0, 3).map(schedule => {
                          const isLatestPublished = schedule.id === latestPublished?.id;
                          return (
                            <div key={schedule.id} className={`p-3 rounded-lg flex justify-between items-center ${isLatestPublished ? 'bg-green-50 border-2 border-green-400' : 'bg-white border border-slate-200'}`}>
                              <div>
                                <div className="font-medium text-slate-900 flex items-center gap-2">
                                  {schedule.name}
                                  {isLatestPublished && <span className="px-2 py-0.5 bg-green-600 text-white rounded text-xs font-medium">Latest Published</span>}
                                </div>
                                <div className="text-xs text-slate-500">
                                  {new Date(schedule.createdAt).toLocaleDateString()}
                                </div>
                              </div>
                              <button
                                onClick={() => handleLoadSchedule(schedule.id)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg font-medium transition-colors"
                              >
                                Load
                              </button>
                            </div>
                          );
                        });
                      })()}
                    </div>
                    {savedSchedules.filter(s => s.targetMonth === targetMonth && s.targetYear === targetYear).length > 3 && (
                      <button
                        onClick={() => setShowScheduleHistory(true)}
                        className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        View all {savedSchedules.filter(s => s.targetMonth === targetMonth && s.targetYear === targetYear).length} schedules →
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={handleGenerateSchedule}
                  disabled={isGenerating}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg font-semibold px-8 py-4 rounded-xl shadow-lg shadow-emerald-200 hover:shadow-xl transition-all flex items-center gap-3 mx-auto"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="animate-spin" /> Generating Plan...
                    </>
                  ) : (
                    <>
                      <Sparkles /> Generate Schedule for {targetMonth}/{targetYear}
                    </>
                  )}
                </button>
              </div>
            ) : (
              // Results View (Calendar or Stats)
              <div className="text-left">
                <div className="flex justify-between items-center mb-6">
                  <div className="flex gap-2 bg-white p-1 rounded-lg border border-slate-200">
                    <button 
                      onClick={() => setScheduleResultView('calendar')}
                      className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${scheduleResultView === 'calendar' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <Calendar size={16} /> Calendar View
                    </button>
                    <button 
                      onClick={() => setScheduleResultView('stats')}
                      className={`px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${scheduleResultView === 'stats' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                      <BarChart3 size={16} /> Assignment Stats
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowScheduleHistory(true)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-2 transition-colors"
                    >
                      <History size={16} /> View History
                    </button>
                    <button
                      onClick={handleApplyAssignments}
                      disabled={isApplyingAssignments || assignmentsApplied}
                      className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors ${
                        assignmentsApplied
                          ? 'bg-green-100 text-green-700 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      }`}
                      title={assignmentsApplied ? 'Assignments already applied to database' : 'Apply assignments so volunteers can see their shifts'}
                    >
                      <CheckCircle size={16} /> {assignmentsApplied ? 'Applied' : isApplyingAssignments ? 'Applying...' : 'Apply to Database'}
                    </button>
                    <button
                      onClick={() => setShowSaveScheduleModal(true)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center gap-2 transition-colors"
                    >
                      <Save size={16} /> Save to History
                    </button>
                    <button
                      onClick={handleClearAssignments}
                      className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium flex items-center gap-2 transition-colors"
                    >
                      <X size={16} /> Clear All
                    </button>
                  </div>
                </div>
                
                {scheduleResultView === 'calendar' ? CalendarView() : StatsView()}
              </div>
            )}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === 'events' && (
          <div className="max-w-7xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Events Management</h2>
                <p className="text-slate-500 mt-1">Create and manage events visible to all volunteers</p>
              </div>
              <button
                onClick={handleCreateEvent}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 flex items-center gap-2 transition-colors"
              >
                <Plus size={20} /> Create Event
              </button>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-xl">
                <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-medium text-slate-900 mb-2">No events yet</h3>
                <p className="text-slate-500 mb-6">Create your first event to get started</p>
                <button
                  onClick={handleCreateEvent}
                  className="px-6 py-3 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 inline-flex items-center gap-2"
                >
                  <Plus size={20} /> Create Event
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {events.map(event => (
                  <div
                    key={event.id}
                    className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {event.emoji && <span className="text-2xl">{event.emoji}</span>}
                          <h3 className="text-lg font-bold text-slate-900">{event.title}</h3>
                          {event.isPublished ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">Published</span>
                          ) : (
                            <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded">Draft</span>
                          )}
                        </div>

                        {event.description && (
                          <p className="text-slate-600 mb-3">{event.description}</p>
                        )}

                        <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                          <div className="flex items-center gap-1">
                            <Clock size={16} />
                            <span>{event.startTime} - {event.endTime}</span>
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPin size={16} />
                              <span>{event.location}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Calendar size={16} />
                            {event.isRecurring ? (
                              <span>Recurring: {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][event.recurrenceDayOfWeek || 0]}</span>
                            ) : (
                              <span>{event.date}</span>
                            )}
                          </div>
                          {(() => {
                            const totalAttendees = eventAttendances.filter(a => a.eventId === event.id).length;
                            return totalAttendees > 0 ? (
                              <div className="flex items-center gap-1 text-green-600">
                                <Users size={16} />
                                <span>{totalAttendees} attending</span>
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => handleToggleEventPublish(event)}
                          className={`px-3 py-1.5 rounded-lg font-medium text-sm transition-colors ${
                            event.isPublished
                              ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {event.isPublished ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          onClick={() => handleEditEvent(event)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(event.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Switch Requests Tab */}
        {activeTab === 'switchRequests' && (
          <div className="max-w-7xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Shift Switch Requests</h2>
                <p className="text-slate-500 text-sm mt-1">View all pending shift switch requests from volunteers</p>
              </div>
              <button
                onClick={loadSwitchRequests}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                <RefreshCw size={16} /> Refresh
              </button>
            </div>

            {switchRequests.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-slate-200">
                <Repeat size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Pending Switch Requests</h3>
                <p className="text-slate-500">When volunteers request to switch shifts, they'll appear here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {switchRequests.map(request => {
                  const shift = shifts.find(s => s.id === request.shiftId);
                  const requestingVolunteer = volunteers.find(v => v.id === request.requestingVolunteerId);
                  const targetVolunteer = request.targetVolunteerId ? volunteers.find(v => v.id === request.targetVolunteerId) : null;

                  if (!shift || !requestingVolunteer) return null;

                  return (
                    <div key={request.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-bold text-slate-900">{shift.title}</h4>
                          <p className="text-sm text-slate-500 mt-1">{shift.date} • {shift.startTime} - {shift.endTime}</p>
                          {shift.location && (
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              <MapPin size={12} />
                              {shift.location}
                            </p>
                          )}
                        </div>
                        <span className="bg-amber-50 text-amber-700 text-xs px-2.5 py-1 rounded-full font-semibold">
                          {request.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg mb-3">
                        <p className="text-xs text-slate-500 mb-1">Requested by:</p>
                        <p className="text-base font-semibold text-slate-900">{requestingVolunteer.name}</p>
                        <p className="text-xs text-slate-500">{requestingVolunteer.email}</p>
                      </div>

                      {request.message && (
                        <div className="bg-blue-50 p-3 rounded-lg mb-3 border border-blue-100">
                          <p className="text-xs text-blue-600 mb-1">Message:</p>
                          <p className="text-sm text-blue-900 italic">"{request.message}"</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
                        <Clock size={12} />
                        Requested {new Date(request.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pending Users Tab */}
        {activeTab === 'pendingUsers' && (
          <div className="max-w-7xl mx-auto animate-fade-in">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">Pending User Approvals</h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-1">Review and approve new users waiting for access</p>
              </div>
              <button
                onClick={loadPendingUsers}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors text-sm"
                disabled={loadingPendingUsers}
              >
                <RefreshCw size={16} className={loadingPendingUsers ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>

            {loadingPendingUsers ? (
              <div className="bg-white rounded-xl p-12 text-center">
                <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-500">Loading pending users...</p>
              </div>
            ) : pendingUsers.length === 0 ? (
              <div className="bg-white rounded-xl p-12 text-center border-2 border-dashed border-slate-200">
                <UserCheck size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Pending Users</h3>
                <p className="text-slate-500">When users sign up, they'll appear here for approval.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {pendingUsers.map(user => (
                  <div key={user.id} className="bg-white rounded-xl p-4 sm:p-6 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                          <User size={24} className="text-purple-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-slate-900 truncate">
                            {user.name || user.display_name || user.email}
                          </h3>
                          {(user.name || user.display_name) && (
                            <p className="text-xs text-slate-500 truncate">{user.email}</p>
                          )}
                          <p className="text-xs text-slate-500 capitalize">
                            {user.provider} account
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg mb-4">
                      <p className="text-xs text-slate-500 mb-1">Signed up:</p>
                      <p className="text-sm font-medium text-slate-900">
                        {new Date(user.created_at).toLocaleDateString()} at {new Date(user.created_at).toLocaleTimeString()}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <button
                        onClick={() => handleApproveAsAdmin(user.user_id, user.email)}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <ShieldCheck size={16} /> <span className="hidden sm:inline">Approve as Admin</span><span className="sm:hidden">Admin</span>
                      </button>
                      <button
                        onClick={() => handleApproveAsVolunteer(user.user_id, user.email, user.name || user.display_name)}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <UserCheck size={16} /> <span className="hidden sm:inline">Approve as Volunteer</span><span className="sm:hidden">Volunteer</span>
                      </button>
                      <button
                        onClick={() => handleRejectUser(user.user_id, user.email)}
                        className="w-full bg-red-100 hover:bg-red-200 text-red-700 py-2.5 px-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors text-sm"
                      >
                        <X size={16} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Enhanced Shift Details Modal with Editing (For Calendar Click) */}
      {selectedShiftForDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedShiftForDetails(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
               <h2 className="text-xl font-bold text-slate-900">{selectedShiftForDetails.title}</h2>
               <div className="flex items-center gap-4 text-slate-500 mt-2">
                 <span className="flex items-center gap-1"><Calendar size={16} /> {selectedShiftForDetails.date}</span>
                 <span className="flex items-center gap-1"><Clock size={16} /> {selectedShiftForDetails.startTime} - {selectedShiftForDetails.endTime}</span>
                 <span className="flex items-center gap-1"><MapPin size={16} /> {selectedShiftForDetails.location}</span>
               </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Assigned Volunteers */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <User size={16} /> Assigned Volunteers
                </h3>
                <div className="space-y-2">
                   {generatedAssignments.filter(a => a.shiftId === selectedShiftForDetails.id).length > 0 ? (
                      generatedAssignments
                        .filter(a => a.shiftId === selectedShiftForDetails.id)
                        .map((assignment, idx) => {
                          const vol = volunteers.find(v => v.id === assignment.volunteerId);
                          if (!vol) return null;
                          return (
                            <div key={idx} className="p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                              <div className="flex items-center justify-between">
                               <div className="flex items-center gap-2">
                                 <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">
                                   {vol.name.charAt(0)}
                                 </div>
                                 <div>
                                   <div className="font-medium text-slate-900 text-sm">{vol.name}</div>
                                   <div className="text-xs text-slate-500">
                                     {vol.skillLevel === 3 ? 'Expert' : vol.skillLevel === 2 ? 'Mid' : 'Entry'}
                                     {' · '}
                                     {(() => {
                                       const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
                                       const assignedCount = generatedAssignments.filter(a => {
                                         const s = shifts.find(sh => sh.id === a.shiftId);
                                         return s && s.date.startsWith(targetMonthStr) && a.volunteerId === vol.id;
                                       }).length;
                                       const capacity = getMonthlyCapacity(vol.frequency);
                                       return `${assignedCount}/${capacity}`;
                                     })()}
                                   </div>
                                 </div>
                               </div>
                               <button
                                 onClick={() => handleRemoveVolunteerFromShift(selectedShiftForDetails.id, vol.id)}
                                 className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"
                                 title="Remove from shift"
                               >
                                 <UserMinus size={16} />
                               </button>
                              </div>
                              <div className="mt-1.5 ml-9 flex flex-wrap items-center gap-1">
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                                  vol.preferredLocation === 'HATACHANA' ? 'bg-amber-100 text-amber-700' :
                                  vol.preferredLocation === 'DIZENGOFF' ? 'bg-sky-100 text-sky-700' :
                                  'bg-purple-100 text-purple-700'
                                }`}>
                                  {vol.preferredLocation === 'HATACHANA' ? 'Hatachana' : vol.preferredLocation === 'DIZENGOFF' ? 'Dizengoff' : 'Both'}
                                </span>
                                {vol.preferredDays.map(dayId => {
                                  const day = DAYS.find(d => d.id === dayId);
                                  return day ? (
                                    <span key={dayId} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">
                                      {day.label}
                                    </span>
                                  ) : null;
                                })}
                              </div>
                              {(() => {
                                const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
                                const otherDates = generatedAssignments
                                  .filter(a => {
                                    if (a.volunteerId !== vol.id || a.shiftId === selectedShiftForDetails.id) return false;
                                    const s = shifts.find(sh => sh.id === a.shiftId);
                                    return s && s.date.startsWith(targetMonthStr);
                                  })
                                  .map(a => {
                                    const s = shifts.find(sh => sh.id === a.shiftId);
                                    return s ? parseInt(s.date.split('-')[2], 10) : 0;
                                  })
                                  .filter(d => d > 0)
                                  .sort((a, b) => a - b);
                                return otherDates.length > 0 ? (
                                  <div className="ml-9 text-[10px] text-slate-400 mt-0.5">
                                    Also on: {otherDates.join(', ')}
                                  </div>
                                ) : null;
                              })()}
                            </div>
                          );
                        })
                   ) : (
                     <div className="text-center py-6 text-slate-400 italic bg-slate-50 rounded-lg text-sm">
                       No volunteers assigned yet.
                     </div>
                   )}
                </div>
              </div>

              {/* Available Volunteers */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <UserPlus size={16} /> Available Volunteers
                </h3>
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                   {(() => {
                     // Get volunteers who are not fully assigned yet
                     const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
                     const assignedVolunteerIds = new Set(
                       generatedAssignments
                         .filter(a => a.shiftId === selectedShiftForDetails.id)
                         .map(a => a.volunteerId)
                     );

                     // Get the week start date for the selected shift
                     const shiftDate = new Date(selectedShiftForDetails.date);
                     const dayOfWeek = shiftDate.getDay();
                     const weekStart = new Date(shiftDate);
                     weekStart.setDate(shiftDate.getDate() - dayOfWeek); // Sunday of the week
                     const weekEnd = new Date(weekStart);
                     weekEnd.setDate(weekStart.getDate() + 6); // Saturday of the week

                     // Get volunteers who already have shifts in this week
                     const volunteersWithShiftsThisWeek = new Set(
                       generatedAssignments
                         .filter(a => {
                           const shift = shifts.find(s => s.id === a.shiftId);
                           if (!shift) return false;
                           const assignmentDate = new Date(shift.date);
                           return assignmentDate >= weekStart && assignmentDate <= weekEnd;
                         })
                         .map(a => a.volunteerId)
                     );

                     const availableVolunteers = volunteers
                       .filter(v => v.availabilityStatus === 'Active')
                       .filter(v => canVolunteerWorkShift(v, selectedShiftForDetails)) // Only show volunteers who can work this shift
                       .filter(v => !volunteersWithShiftsThisWeek.has(v.id)) // Exclude volunteers with shifts in the same week
                       .map(vol => {
                         const capacity = getMonthlyCapacity(vol.frequency);
                         const assignedCount = generatedAssignments.filter(a => {
                           const shift = shifts.find(s => s.id === a.shiftId);
                           return shift && shift.date.startsWith(targetMonthStr) && a.volunteerId === vol.id;
                         }).length;
                         const utilization = capacity > 0 ? (assignedCount / capacity) * 100 : 0;

                         return {
                           ...vol,
                           capacity,
                           assignedCount,
                           utilization,
                           isAlreadyAssigned: assignedVolunteerIds.has(vol.id),
                         };
                       })
                       .sort((a, b) => {
                         // Sort: unassigned first, then by utilization
                         if (a.isAlreadyAssigned && !b.isAlreadyAssigned) return 1;
                         if (!a.isAlreadyAssigned && b.isAlreadyAssigned) return -1;
                         return a.utilization - b.utilization;
                       });

                     return availableVolunteers.length > 0 ? (
                       availableVolunteers.map(vol => (
                         <div key={vol.id} className={`p-2 rounded-lg border transition-colors ${
                           vol.isAlreadyAssigned
                             ? 'bg-indigo-50 border-indigo-200'
                             : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                         }`}>
                          <div className="flex items-center justify-between">
                           <div className="flex items-center gap-2 flex-1">
                             <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                               vol.isAlreadyAssigned
                                 ? 'bg-indigo-200 text-indigo-700'
                                 : 'bg-slate-200 text-slate-700'
                             }`}>
                               {vol.name.charAt(0)}
                             </div>
                             <div className="flex-1">
                               <div className="flex items-center gap-2">
                                 <span className="font-medium text-slate-900 text-sm">{vol.name}</span>
                                 {vol.isAlreadyAssigned && (
                                   <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">
                                     Already Assigned
                                   </span>
                                 )}
                               </div>
                               <div className="text-xs text-slate-500">
                                 {vol.assignedCount}/{vol.capacity} ({Math.round(vol.utilization)}%)
                               </div>
                             </div>
                           </div>
                           {!vol.isAlreadyAssigned && (
                             <button
                               onClick={() => handleAddVolunteerToShift(selectedShiftForDetails.id, vol.id)}
                               className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 p-1 rounded transition-colors"
                               title="Add to shift"
                             >
                               <UserPlus size={16} />
                             </button>
                           )}
                          </div>
                          <div className="mt-1.5 ml-9 flex flex-wrap items-center gap-1">
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                              vol.preferredLocation === 'HATACHANA' ? 'bg-amber-100 text-amber-700' :
                              vol.preferredLocation === 'DIZENGOFF' ? 'bg-sky-100 text-sky-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {vol.preferredLocation === 'HATACHANA' ? 'Hatachana' : vol.preferredLocation === 'DIZENGOFF' ? 'Dizengoff' : 'Both'}
                            </span>
                            {vol.preferredDays.map(dayId => {
                              const day = DAYS.find(d => d.id === dayId);
                              return day ? (
                                <span key={dayId} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 text-[10px] rounded">
                                  {day.label}
                                </span>
                              ) : null;
                            })}
                          </div>
                          {(() => {
                            const assignedDates = generatedAssignments
                              .filter(a => {
                                if (a.volunteerId !== vol.id) return false;
                                const s = shifts.find(sh => sh.id === a.shiftId);
                                return s && s.date.startsWith(targetMonthStr);
                              })
                              .map(a => {
                                const s = shifts.find(sh => sh.id === a.shiftId);
                                return s ? parseInt(s.date.split('-')[2], 10) : 0;
                              })
                              .filter(d => d > 0)
                              .sort((a, b) => a - b);
                            return assignedDates.length > 0 ? (
                              <div className="ml-9 text-[10px] text-slate-400 mt-0.5">
                                Assigned: {assignedDates.join(', ')}
                              </div>
                            ) : null;
                          })()}
                         </div>
                       ))
                     ) : (
                       <div className="text-center py-6 text-slate-400 italic bg-slate-50 rounded-lg text-sm">
                         No available volunteers for this shift.
                       </div>
                     );
                   })()}
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelectedShiftForDetails(null)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Volunteer Modal */}
      {editingVolunteer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative animate-fade-in max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => {
                setEditingVolunteer(null);
                setAdminNewBlackoutDate('');
                setAdminNewBlackoutEndDate('');
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            <h2 className="text-xl font-bold text-slate-900 mb-6">Edit Volunteer</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                <input 
                  type="text" 
                  value={editingVolunteer.name}
                  onChange={(e) => setEditingVolunteer({...editingVolunteer, name: e.target.value})}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                  <input 
                    type="email" 
                    value={editingVolunteer.email}
                    onChange={(e) => setEditingVolunteer({...editingVolunteer, email: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input 
                    type="text" 
                    value={editingVolunteer.phone}
                    onChange={(e) => setEditingVolunteer({...editingVolunteer, phone: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Frequency</label>
                <select
                  value={editingVolunteer.frequency}
                  onChange={(e) => setEditingVolunteer({...editingVolunteer, frequency: e.target.value})}
                  className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                >
                  <option value="ONCE_A_WEEK">Once a Week</option>
                  <option value="TWICE_A_MONTH">Twice a Month</option>
                  <option value="ONCE_A_MONTH">Once a Month</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Preferred Location</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={editingVolunteer.preferredLocation === 'HATACHANA'} onChange={() => setEditingVolunteer({...editingVolunteer, preferredLocation: 'HATACHANA'})} /> Hatachana
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={editingVolunteer.preferredLocation === 'DIZENGOFF'} onChange={() => setEditingVolunteer({...editingVolunteer, preferredLocation: 'DIZENGOFF'})} /> Dizengoff
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" checked={editingVolunteer.preferredLocation === 'BOTH'} onChange={() => setEditingVolunteer({...editingVolunteer, preferredLocation: 'BOTH'})} /> Both
                  </label>
                </div>
              </div>

              <div>
                 <label className="block text-sm font-medium text-slate-700 mb-2">Preferred Days</label>
                 <div className="grid grid-cols-3 gap-2">
                   {DAYS.map(day => {
                      const isSelected = editingVolunteer.preferredDays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          onClick={() => {
                            const newDays = isSelected
                              ? editingVolunteer.preferredDays.filter(d => d !== day.id)
                              : [...editingVolunteer.preferredDays, day.id];
                            setEditingVolunteer({...editingVolunteer, preferredDays: newDays});
                          }}
                          className={`text-xs p-2 rounded border ${isSelected ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'border-slate-200'}`}
                        >
                          {day.label}
                        </button>
                      );
                   })}
                 </div>
              </div>

              {/* Blackout Dates */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Unavailable Dates (Blackout)</label>
                <p className="text-xs text-slate-500 mb-2">Select a single date or a date range</p>
                <div className="space-y-2 mb-3">
                  <div className="flex gap-2 items-center">
                    <input
                      type="date"
                      className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      value={adminNewBlackoutDate}
                      onChange={(e) => setAdminNewBlackoutDate(e.target.value)}
                      min={getDefaultMinDate()}
                      placeholder="Start date"
                    />
                    <span className="text-slate-400 text-sm">to</span>
                    <input
                      type="date"
                      className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                      value={adminNewBlackoutEndDate}
                      onChange={(e) => setAdminNewBlackoutEndDate(e.target.value)}
                      min={adminNewBlackoutDate || getDefaultMinDate()}
                      placeholder="End date (optional)"
                    />
                    <button
                      onClick={addAdminBlackoutDate}
                      disabled={!adminNewBlackoutDate}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                    >
                      <Plus size={18} />
                      Add
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {editingVolunteer.blackoutDates
                    .filter(d => d >= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`)
                    .map(date => (
                    <span key={date} className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-md text-sm">
                      {date}
                      <button onClick={() => removeAdminBlackoutDate(date)} className="hover:bg-red-100 rounded p-0.5">
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                  {editingVolunteer.blackoutDates.filter(d => d >= `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`).length === 0 && (
                    <span className="text-slate-400 text-sm italic">No dates marked unavailable</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  value={editingVolunteer.notes || ''}
                  onChange={(e) => {
                    if (e.target.value.length <= 500) {
                      setEditingVolunteer({...editingVolunteer, notes: e.target.value});
                    }
                  }}
                  placeholder="Notes about this volunteer..."
                  className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-slate-400 text-right mt-1">{(editingVolunteer.notes || '').length}/500</p>
              </div>

            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingVolunteer(null);
                  setAdminNewBlackoutDate('');
                  setAdminNewBlackoutEndDate('');
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveVolunteerEdit}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 relative">
             <div className="flex items-center gap-3 text-red-600 mb-4">
               <div className="bg-red-100 p-2 rounded-full">
                 <AlertTriangle size={24} />
               </div>
               <h3 className="text-lg font-bold text-slate-900">Confirm Deletion</h3>
             </div>
             
             <p className="text-slate-600 mb-6">
               Are you sure you want to delete <span className="font-semibold text-slate-900">{deleteConfirmation.name || 'this item'}</span>?
               {deleteConfirmation.type === 'volunteer' && " This will remove them from all assigned shifts."}
               <br/>This action cannot be undone.
             </p>

             <div className="flex justify-end gap-3">
               <button 
                 onClick={() => setDeleteConfirmation(null)}
                 className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
               >
                 Cancel
               </button>
               <button 
                 onClick={confirmDelete}
                 className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors shadow-sm"
               >
                 Yes, Delete
               </button>
             </div>
          </div>
        </div>
      )}

      {/* Event Details Modal (Read-Only) */}
      {selectedEventForDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setSelectedEventForDetails(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-3 mb-4">
              {selectedEventForDetails.emoji && (
                <span className="text-4xl">{selectedEventForDetails.emoji}</span>
              )}
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedEventForDetails.title}</h2>
                {selectedEventForDetails.isPublished ? (
                  <span className="inline-block px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded mt-1">Published</span>
                ) : (
                  <span className="inline-block px-2 py-1 bg-slate-100 text-slate-600 text-xs font-medium rounded mt-1">Draft</span>
                )}
              </div>
            </div>

            {selectedEventForDetails.description && (
              <p className="text-slate-600 mb-4">{selectedEventForDetails.description}</p>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-slate-700">
                <Clock size={18} className="text-slate-400" />
                <span><strong>Time:</strong> {selectedEventForDetails.startTime} - {selectedEventForDetails.endTime}</span>
              </div>

              {selectedEventForDetails.location && (
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin size={18} className="text-slate-400" />
                  <span><strong>Location:</strong> {selectedEventForDetails.location}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-slate-700">
                <Calendar size={18} className="text-slate-400" />
                {selectedEventForDetails.isRecurring ? (
                  <span>
                    <strong>Schedule:</strong> Every {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][selectedEventForDetails.recurrenceDayOfWeek || 0]}
                    {selectedEventForDetails.recurrenceStartDate && selectedEventForDetails.recurrenceEndDate && (
                      <span className="text-sm text-slate-500 ml-1">
                        ({selectedEventForDetails.recurrenceStartDate} to {selectedEventForDetails.recurrenceEndDate})
                      </span>
                    )}
                  </span>
                ) : (
                  <span><strong>Date:</strong> {selectedEventForDetails.date}</span>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedEventForDetails(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkUpload && (
        <BulkUploadModal
          onClose={() => setShowBulkUpload(false)}
          onUpload={handleBulkUpload}
        />
      )}

      {invitingVolunteer && (
        <InviteVolunteerModal
          volunteer={invitingVolunteer}
          onClose={() => setInvitingVolunteer(null)}
          onInviteSent={() => {
            // Optionally reload volunteers data
            setInvitingVolunteer(null);
          }}
        />
      )}

      {/* Save Schedule Modal */}
      {showSaveScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative">
            <button
              onClick={() => setShowSaveScheduleModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Save size={24} className="text-emerald-600" /> Save Schedule
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                Save this schedule to view or restore later
              </p>
            </div>

            <div className="space-y-4">
              {/* Mode Selection */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Save Mode</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSaveMode('create')}
                    className={`flex-1 p-2 rounded-lg border-2 transition-colors ${
                      saveMode === 'create'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium">Create New</div>
                    <div className="text-xs opacity-70">Save as new schedule</div>
                  </button>
                  <button
                    onClick={() => setSaveMode('update')}
                    className={`flex-1 p-2 rounded-lg border-2 transition-colors ${
                      saveMode === 'update'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-700'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="font-medium">Update Existing</div>
                    <div className="text-xs opacity-70">Overwrite a schedule</div>
                  </button>
                </div>
              </div>

              {/* Show schedule selector when in update mode */}
              {saveMode === 'update' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Select Schedule to Update</label>
                  <select
                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={selectedScheduleToUpdate || ''}
                    onChange={(e) => {
                      setSelectedScheduleToUpdate(e.target.value);
                      const selected = savedSchedules.find(s => s.id === e.target.value);
                      if (selected) {
                        setScheduleNameInput(selected.name);
                        setScheduleNotesInput(selected.notes || '');
                      }
                    }}
                  >
                    <option value="">-- Select a schedule --</option>
                    {savedSchedules
                      .filter(s => s.targetMonth === targetMonth && s.targetYear === targetYear)
                      .map(schedule => (
                        <option key={schedule.id} value={schedule.id}>
                          {schedule.name} ({new Date(schedule.createdAt).toLocaleDateString()})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Schedule Name</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={scheduleNameInput}
                  onChange={(e) => setScheduleNameInput(e.target.value)}
                  placeholder={`Schedule for ${targetMonth}/${targetYear}`}
                  disabled={saveMode === 'update' && !selectedScheduleToUpdate}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  rows={3}
                  value={scheduleNotesInput}
                  onChange={(e) => setScheduleNotesInput(e.target.value)}
                  placeholder="Add any notes about this schedule..."
                />
              </div>

              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="text-sm text-slate-600">
                  <div className="flex justify-between mb-1">
                    <span>Target Month:</span>
                    <span className="font-medium">{targetMonth}/{targetYear}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Assignments:</span>
                    <span className="font-medium">{generatedAssignments.length} shifts assigned</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSaveScheduleModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSchedule}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700"
                disabled={saveMode === 'update' && !selectedScheduleToUpdate}
              >
                {saveMode === 'update' ? 'Update Schedule' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 relative my-8">
            <button
              onClick={() => {
                setShowEventModal(false);
                setEditingEvent(null);
              }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar size={24} className="text-pink-600" /> {editingEvent ? 'Edit Event' : 'Create New Event'}
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                Events will be visible to all volunteers once published
              </p>
            </div>

            <EventModalForm
              event={editingEvent}
              onSave={() => {
                setShowEventModal(false);
                setEditingEvent(null);
                loadEvents();
              }}
              onCancel={() => {
                setShowEventModal(false);
                setEditingEvent(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Schedule History Modal */}
      {showScheduleHistory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowScheduleHistory(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <History size={24} className="text-indigo-600" /> Schedule History
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                View and restore previously saved schedules
              </p>
            </div>

            <div className="space-y-3">
              {savedSchedules.length > 0 ? (
                savedSchedules.map(schedule => (
                  <div key={schedule.id} className="bg-slate-50 rounded-lg border border-slate-200 p-4 hover:bg-slate-100 transition-colors">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-bold text-slate-900">{schedule.name}</h3>
                          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
                            {schedule.targetMonth}/{schedule.targetYear}
                          </span>
                        </div>
                        {schedule.notes && (
                          <p className="text-sm text-slate-600 mb-2">{schedule.notes}</p>
                        )}
                        <div className="text-xs text-slate-500">
                          Saved on {new Date(schedule.createdAt).toLocaleDateString()} at {new Date(schedule.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleLoadSchedule(schedule.id)}
                          className="px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg font-medium hover:bg-indigo-700 transition-colors"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => handleDeleteSchedule(schedule.id)}
                          className="px-3 py-1.5 text-red-600 hover:bg-red-50 text-sm rounded-lg font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <History size={48} className="mx-auto mb-3 opacity-50" />
                  <p className="text-lg font-medium">No saved schedules yet</p>
                  <p className="text-sm mt-1">Generate and save a schedule to see it here</p>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowScheduleHistory(false)}
                className="px-4 py-2 bg-slate-600 text-white rounded-lg font-medium hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Options Selection Modal */}
      {showOptionsModal && scheduleOptions.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setShowOptionsModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Sparkles size={28} className="text-emerald-600" /> Choose Your Schedule
              </h2>
              <p className="text-sm text-slate-500 mt-2">
                We've generated {scheduleOptions.length} different schedule options. Each one is randomized within skill levels to ensure variety.
              </p>
            </div>

            <div className="space-y-4">
              {scheduleOptions.map((option) => (
                <div
                  key={option.id}
                  className={`border-2 rounded-lg p-5 transition-all cursor-pointer hover:shadow-lg ${
                    selectedOptionId === option.id
                      ? 'border-emerald-500 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-300'
                  }`}
                  onClick={() => setSelectedOptionId(option.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        Option {option.id}
                        {selectedOptionId === option.id && (
                          <CheckCircle size={20} className="text-emerald-600" />
                        )}
                      </h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <div className="text-2xl font-bold text-slate-900">
                        {option.statistics.totalAssignments}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Total Assignments</div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <div className="text-2xl font-bold text-emerald-600">
                        {option.statistics.utilizationPercentage}%
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Volunteer Utilization</div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <div className="text-2xl font-bold text-indigo-600">
                        {option.statistics.wellStaffedShifts}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Well-Staffed Shifts (3+)</div>
                    </div>

                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <div className="text-2xl font-bold text-slate-600">
                        {option.statistics.totalShifts}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Total Shifts</div>
                    </div>

                    <div className={`bg-white rounded-lg p-3 border ${option.statistics.unassignedVolunteers > 0 ? 'border-red-300' : 'border-slate-200'}`}>
                      <div className={`text-2xl font-bold ${option.statistics.unassignedVolunteers > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {option.statistics.unassignedVolunteers}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Unassigned Volunteers</div>
                    </div>

                    <div className={`bg-white rounded-lg p-3 border ${option.statistics.underutilizedVolunteers > 0 ? 'border-amber-300' : 'border-slate-200'}`}>
                      <div className={`text-2xl font-bold ${option.statistics.underutilizedVolunteers > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                        {option.statistics.underutilizedVolunteers}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">Underutilized</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => setShowOptionsModal(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedOptionId) {
                    handleSelectScheduleOption(selectedOptionId);
                  } else {
                    alert('Please select a schedule option');
                  }
                }}
                disabled={!selectedOptionId}
                className={`px-6 py-2 rounded-lg font-medium transition-colors shadow-sm ${
                  selectedOptionId
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                }`}
              >
                Use This Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;