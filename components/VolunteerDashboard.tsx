import React, { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, MapPin, Check, Plus, Trash2, X, RefreshCw, Repeat, Users, User, Phone, Camera, Upload } from 'lucide-react';
import { Volunteer, Shift, ShiftAssignment, ShiftSwitchRequest, SavedSchedule, SavedScheduleAssignment, Event } from '../types';
import { getVolunteerAssignments, getVolunteerSwitchRequests, createSwitchRequest, acceptSwitchRequest, cancelSwitchRequest, removeVolunteerFromShift, addVolunteerToShift, getShiftAssignments } from '../services/shiftAssignmentService';
import { loadPublishedSchedules, loadScheduleAssignments } from '../services/scheduleHistoryService';
import { loadPublishedEvents } from '../services/eventService';
import { supabase } from '../lib/supabase';
import { mapVolunteerFromDB, mapShiftFromDB } from '../lib/mappers';
import { uploadAvatar, compressImage } from '../lib/avatarUtils';
import { generateGoogleCalendarUrl, openGoogleCalendarForShift } from '../lib/googleCalendar';
import { formatDateDDMMYYYY, formatMonthYear } from '../lib/dateUtils';

interface VolunteerDashboardProps {
  currentUser: Volunteer;
  shifts: Shift[];
  updateVolunteer: (v: Volunteer) => Promise<void>;
}

const DAYS = [
  { id: '0', label: 'Sunday' },
  { id: '1', label: 'Monday' },
  { id: '2_morning', label: 'Tuesday Morning' },
  { id: '2_evening', label: 'Tuesday Evening' },
  { id: '3', label: 'Wednesday' },
  { id: '4', label: 'Thursday' },
  { id: '5_opening', label: 'Friday (Opening)' },
  { id: '5_closing', label: 'Friday (Closing)' },
  { id: '6', label: 'Saturday' },
];

const VolunteerDashboard: React.FC<VolunteerDashboardProps> = ({ currentUser, shifts, updateVolunteer }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Volunteer>(currentUser);
  const [newBlackoutDate, setNewBlackoutDate] = useState('');
  const [newBlackoutEndDate, setNewBlackoutEndDate] = useState('');
  const [newOnlyDate, setNewOnlyDate] = useState('');
  const [newOnlyEndDate, setNewOnlyEndDate] = useState('');
  const [myAssignments, setMyAssignments] = useState<ShiftAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Auto-dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Avatar upload state
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Calendar sync state

  // Keep editForm synchronized with currentUser changes
  useEffect(() => {
    console.log('[VolunteerDashboard] currentUser changed, updating editForm');
    setEditForm(currentUser);
  }, [currentUser]);

  // Get first day of next month as default for date picker
  const getDefaultMinDate = () => {
    const today = new Date();
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return nextMonth.toISOString().split('T')[0];
  };

  // Switch request state
  const [switchRequests, setSwitchRequests] = useState<ShiftSwitchRequest[]>([]);
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [switchRequestShift, setSwitchRequestShift] = useState<Shift | null>(null);
  const [selectedShiftIds, setSelectedShiftIds] = useState<string[]>([]);
  const [switchMessage, setSwitchMessage] = useState('');
  const [isSubmittingSwitchRequest, setIsSubmittingSwitchRequest] = useState(false);

  // Coworkers viewing state
  const [showCoworkersModal, setShowCoworkersModal] = useState(false);
  const [coworkersShift, setCoworkersShift] = useState<Shift | null>(null);
  const [coworkers, setCoworkers] = useState<Volunteer[]>([]);
  const [isLoadingCoworkers, setIsLoadingCoworkers] = useState(false);
  const [selectedVolunteerProfile, setSelectedVolunteerProfile] = useState<Volunteer | null>(null);
  // Store coworkers for each shift (shift ID -> volunteer list)
  const [shiftCoworkers, setShiftCoworkers] = useState<Record<string, Volunteer[]>>({});

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'my-shifts' | 'monthly-schedule'>('my-shifts');

  // Monthly schedule state
  const [monthlySchedules, setMonthlySchedules] = useState<SavedSchedule[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<SavedSchedule | null>(null);
  const [scheduleShifts, setScheduleShifts] = useState<Shift[]>([]);
  const [scheduleAssignments, setScheduleAssignments] = useState<SavedScheduleAssignment[]>([]);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

  // Events state
  const [publishedEvents, setPublishedEvents] = useState<Event[]>([]);
  const [selectedEventForDetails, setSelectedEventForDetails] = useState<Event | null>(null);

  // Load volunteer's assignments and switch requests from database
  useEffect(() => {
    loadMyAssignments();
    loadSwitchRequests();
  }, [currentUser.id]);

  const loadMyAssignments = async () => {
    setIsLoadingAssignments(true);
    try {
      console.log('[VolunteerDashboard] Loading assignments for volunteer:', currentUser.id);
      const assignments = await getVolunteerAssignments(currentUser.id);
      console.log('[VolunteerDashboard] Received', assignments.length, 'assignments from shift_assignments table');
      console.log('[VolunteerDashboard] My shift IDs from shift_assignments:', assignments.map(a => a.shiftId));
      setMyAssignments(assignments);

      // Load coworkers for all shifts
      if (assignments.length > 0) {
        await loadAllCoworkers(assignments.map(a => a.shiftId));
      }
    } catch (error) {
      console.error('[VolunteerDashboard] Error loading assignments:', error);
    } finally {
      setIsLoadingAssignments(false);
    }
  };

  const loadAllCoworkers = async (shiftIds: string[]) => {
    try {
      // Get all assignments for these shifts
      const assignments = await getShiftAssignments(shiftIds);

      // Group assignments by shift ID
      const assignmentsByShift: Record<string, string[]> = {};
      assignments.forEach(assignment => {
        if (!assignmentsByShift[assignment.shiftId]) {
          assignmentsByShift[assignment.shiftId] = [];
        }
        assignmentsByShift[assignment.shiftId].push(assignment.volunteerId);
      });

      // Get all unique volunteer IDs
      const allVolunteerIds = [...new Set(assignments.map(a => a.volunteerId))];

      if (allVolunteerIds.length === 0) {
        setShiftCoworkers({});
        return;
      }

      // Fetch all volunteer details at once
      const { data, error } = await supabase
        .from('volunteers')
        .select('*')
        .in('id', allVolunteerIds);

      if (error) {
        console.error('Error loading all coworkers:', error);
        return;
      }

      const volunteers = (data || []).map(mapVolunteerFromDB);

      // Create a map of volunteer ID to volunteer object
      const volunteerMap: Record<string, Volunteer> = {};
      volunteers.forEach(v => {
        volunteerMap[v.id] = v;
      });

      // Build the shift -> coworkers mapping
      const coworkersByShift: Record<string, Volunteer[]> = {};
      Object.entries(assignmentsByShift).forEach(([shiftId, volunteerIds]) => {
        coworkersByShift[shiftId] = volunteerIds
          .map(id => volunteerMap[id])
          .filter(v => v !== undefined);
      });

      setShiftCoworkers(coworkersByShift);
    } catch (error) {
      console.error('Error loading all coworkers:', error);
    }
  };

  const loadSwitchRequests = async () => {
    try {
      const requests = await getVolunteerSwitchRequests(currentUser.id);
      setSwitchRequests(requests);
    } catch (error) {
      console.error('Error loading switch requests:', error);
    }
  };

  const loadMonthlySchedules = async () => {
    setIsLoadingSchedule(true);
    try {
      // Load only published schedules (visible after Apply to Database)
      const result = await loadPublishedSchedules();
      if (result.success && result.schedules) {
        // Sort by date (most recent first), with creation date as tiebreaker for same month/year
        const sorted = result.schedules.sort((a, b) => {
          // Primary sort: year (most recent first)
          if (a.targetYear !== b.targetYear) return b.targetYear - a.targetYear;
          // Secondary sort: month (most recent first)
          if (a.targetMonth !== b.targetMonth) return b.targetMonth - a.targetMonth;
          // Tertiary sort: creation date (most recent first) for same month/year
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setMonthlySchedules(sorted);

        // Smart auto-selection: prioritize current month's schedule
        if (sorted.length > 0 && !selectedSchedule) {
          const now = new Date();
          const currentMonth = now.getMonth() + 1; // 1-12
          const currentYear = now.getFullYear();

          // Try to find a schedule for the current month
          const currentMonthSchedule = sorted.find(
            s => s.targetMonth === currentMonth && s.targetYear === currentYear
          );

          // If found, use current month's schedule, otherwise use the most recent
          const scheduleToLoad = currentMonthSchedule || sorted[0];
          await loadScheduleDetails(scheduleToLoad);

          console.log(`[VolunteerDashboard] Auto-selected schedule for ${currentMonthSchedule ? 'current month' : 'most recent'}: ${scheduleToLoad.name}`);
        }
      }
    } catch (error) {
      console.error('Error loading monthly schedules:', error);
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const loadEvents = async () => {
    try {
      const result = await loadPublishedEvents();
      if (result.success && result.events) {
        setPublishedEvents(result.events);
        console.log('[VolunteerDashboard] Loaded', result.events.length, 'published events');
      }
    } catch (error) {
      console.error('Error loading published events:', error);
    }
  };

  const loadScheduleDetails = async (schedule: SavedSchedule) => {
    setIsLoadingSchedule(true);
    setSelectedSchedule(schedule);
    try {
      console.log('[VolunteerDashboard] Loading schedule details for:', schedule.name, '(ID:', schedule.id, ')');

      // Load assignments for this schedule
      const assignmentsResult = await loadScheduleAssignments(schedule.id);
      console.log('[VolunteerDashboard] Loaded', assignmentsResult.assignments?.length || 0, 'total assignments from saved_schedule_assignments');

      if (assignmentsResult.success && assignmentsResult.assignments) {
        setScheduleAssignments(assignmentsResult.assignments);

        // Debug: Show this volunteer's assignments from this schedule
        const myAssignmentsFromSchedule = assignmentsResult.assignments.filter(a => a.volunteerId === currentUser.id);
        console.log('[VolunteerDashboard] My assignments from this schedule:', myAssignmentsFromSchedule.length);
        console.log('[VolunteerDashboard] My shift IDs from saved_schedule_assignments:', myAssignmentsFromSchedule.map(a => a.shiftId));

        // Get unique shift IDs
        const shiftIds = [...new Set(assignmentsResult.assignments.map(a => a.shiftId))];

        // Fetch shift details
        if (shiftIds.length > 0) {
          const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .in('id', shiftIds);

          if (!error && data) {
            const shifts = data.map(mapShiftFromDB).sort((a, b) => {
              // Sort by date and time
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              return a.startTime.localeCompare(b.startTime);
            });
            setScheduleShifts(shifts);

            // Debug: Show which shifts are assigned to this volunteer in the monthly schedule
            const myShiftIdsFromSchedule = new Set(myAssignmentsFromSchedule.map(a => a.shiftId));
            const myScheduleShifts = shifts.filter(s => myShiftIdsFromSchedule.has(s.id));
            console.log('[VolunteerDashboard] My shifts in monthly schedule view:');
            myScheduleShifts.forEach(s => console.log(`  - ${s.date}: ${s.title} (${s.startTime} - ${s.endTime})`));

            // Load coworkers for all shifts
            await loadAllCoworkers(shiftIds);
          }
        }
      }
    } catch (error) {
      console.error('Error loading schedule details:', error);
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  // Load data when tab switches
  useEffect(() => {
    if (activeTab === 'monthly-schedule') {
      if (monthlySchedules.length === 0) {
        loadMonthlySchedules();
      }
      if (publishedEvents.length === 0) {
        loadEvents();
      }
    }
  }, [activeTab]);

  const loadCoworkers = async (shift: Shift) => {
    setIsLoadingCoworkers(true);
    setCoworkersShift(shift);
    setShowCoworkersModal(true);
    try {
      // Get all assignments for this shift
      const assignments = await getShiftAssignments([shift.id]);

      // Extract volunteer IDs
      const volunteerIds = assignments.map(a => a.volunteerId);

      if (volunteerIds.length === 0) {
        setCoworkers([]);
        return;
      }

      // Fetch volunteer details from database
      const { data, error } = await supabase
        .from('volunteers')
        .select('*')
        .in('id', volunteerIds);

      if (error) {
        console.error('Error loading coworkers:', error);
        setCoworkers([]);
        return;
      }

      const volunteers = (data || []).map(mapVolunteerFromDB);
      setCoworkers(volunteers);
    } catch (error) {
      console.error('Error loading coworkers:', error);
      setCoworkers([]);
    } finally {
      setIsLoadingCoworkers(false);
    }
  };

  const handleOpenSwitchModal = async (shift: Shift) => {
    // Refresh assignments to ensure we have latest data before showing available shifts
    await loadMyAssignments();
    setSwitchRequestShift(shift);
    setSelectedShiftIds([]);
    setSwitchMessage('');
    setShowSwitchModal(true);
  };

  const toggleShiftSelection = (shiftId: string) => {
    setSelectedShiftIds(prev => {
      if (prev.includes(shiftId)) {
        return prev.filter(id => id !== shiftId);
      } else {
        return [...prev, shiftId];
      }
    });
  };

  const handleSubmitSwitchRequest = async () => {
    if (!switchRequestShift) return;

    setIsSubmittingSwitchRequest(true);
    try {
      // Pre-check: refresh assignments and verify selected shifts aren't already assigned
      if (selectedShiftIds.length > 0) {
        const freshAssignments = await getVolunteerAssignments(currentUser.id);
        const assignedShiftIds = new Set(freshAssignments.map(a => a.shiftId));
        const alreadyAssigned = selectedShiftIds.filter(id => assignedShiftIds.has(id));
        if (alreadyAssigned.length > 0) {
          alert(`You are already assigned to ${alreadyAssigned.length} of the selected shift(s). Please refresh and try again.`);
          await loadMyAssignments(); // Refresh UI state
          setIsSubmittingSwitchRequest(false);
          return;
        }
      }

      // Remove from current shift
      const removeResult = await removeVolunteerFromShift(switchRequestShift.id, currentUser.id);
      if (!removeResult.success) {
        alert(`Failed to remove from current shift: ${removeResult.error}`);
        setIsSubmittingSwitchRequest(false);
        return;
      }

      // Add to selected shifts (if any)
      if (selectedShiftIds.length > 0) {
        const addResults = await Promise.all(
          selectedShiftIds.map(shiftId => addVolunteerToShift(shiftId, currentUser.id))
        );

        // Check if any additions failed
        const failedAdds = addResults.filter(result => !result.success);
        if (failedAdds.length > 0) {
          // Rollback: add back to original shift
          await addVolunteerToShift(switchRequestShift.id, currentUser.id);
          const errorDetails = failedAdds.map(r => r.error).filter(Boolean).join('; ');
          alert(`Failed to assign to ${failedAdds.length} shift(s). Switch cancelled.\n\nError: ${errorDetails || 'Unknown error'}`);
          setIsSubmittingSwitchRequest(false);
          return;
        }
      }

      // Log the switch in shift_switch_requests for admin tracking
      const logMessage = selectedShiftIds.length > 0
        ? `Switched from shift and took ${selectedShiftIds.length} replacement shift(s). Replacement shift IDs: ${selectedShiftIds.join(', ')}`
        : 'Dropped this shift';

      await createSwitchRequest(
        switchRequestShift.id,
        currentUser.id,
        null,
        `${logMessage}${switchMessage ? '. Note: ' + switchMessage : ''}`
      );

      const successMsg = selectedShiftIds.length > 0
        ? `Successfully switched to ${selectedShiftIds.length} ${selectedShiftIds.length === 1 ? 'shift' : 'shifts'}!`
        : 'Successfully dropped the shift!';

      alert(successMsg);
      setShowSwitchModal(false);
      loadMyAssignments();
      loadSwitchRequests();

    } catch (error) {
      console.error('Error switching shift:', error);
      alert('An error occurred while switching your shift');
    } finally {
      setIsSubmittingSwitchRequest(false);
    }
  };

  const handleAcceptSwitchRequest = async (requestId: string) => {
    if (!confirm('Accept this shift switch? You will be assigned to this shift.')) {
      return;
    }

    try {
      const result = await acceptSwitchRequest(requestId, currentUser.id);

      if (result.success) {
        alert('Switch accepted! You have been assigned to the shift.');
        loadMyAssignments();
        loadSwitchRequests();
      } else {
        alert(`Failed to accept switch: ${result.error}`);
      }
    } catch (error) {
      console.error('Error accepting switch request:', error);
      alert('An error occurred while accepting the switch');
    }
  };

  const handleCancelSwitchRequest = async (requestId: string) => {
    if (!confirm('Cancel this switch request?')) {
      return;
    }

    try {
      const result = await cancelSwitchRequest(requestId);

      if (result.success) {
        alert('Switch request cancelled');
        loadSwitchRequests();
      } else {
        alert(`Failed to cancel request: ${result.error}`);
      }
    } catch (error) {
      console.error('Error cancelling switch request:', error);
      alert('An error occurred while cancelling the request');
    }
  };

  // Filter shifts for the upcoming month (Today -> +30 days)
  const isShiftUpcoming = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 30);

    const shiftDate = new Date(dateStr);

    return shiftDate >= today && shiftDate <= endDate;
  };

  // Check if a shift is in the future (not past)
  const isShiftFuture = (dateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const shiftDate = new Date(dateStr);
    return shiftDate >= today;
  };

  // Get my shifts by matching assignments with shift data
  const myShiftIds = new Set(myAssignments.map(a => a.shiftId));
  console.log('[VolunteerDashboard] My shift IDs from assignments:', Array.from(myShiftIds));
  console.log('[VolunteerDashboard] Total shifts available:', shifts.length);

  // Show ALL assigned shifts that are in the future (not just next 30 days)
  const myShifts = shifts
    .filter(s => {
      const hasAssignment = myShiftIds.has(s.id);
      const isFuture = isShiftFuture(s.date);
      if (hasAssignment) {
        console.log('[VolunteerDashboard] Shift', s.id, s.title, 'hasAssignment:', hasAssignment, 'isFuture:', isFuture, 'date:', s.date);
      }
      return hasAssignment && isFuture;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  console.log('[VolunteerDashboard] Filtered my shifts:', myShifts.length, 'shifts');
  console.log('[VolunteerDashboard] My shifts from shift_assignments (My Shifts tab):');
  myShifts.forEach(s => console.log(`  - ${s.date}: ${s.title} (${s.startTime} - ${s.endTime})`));

  // Helper function to check if volunteer can work a shift
  const canWorkShift = (shift: Shift): boolean => {
    // Check location compatibility
    if (currentUser.preferredLocation !== 'BOTH' && shift.location !== 'BOTH') {
      if (currentUser.preferredLocation !== shift.location) return false;
    }

    // Check day preference
    const date = new Date(shift.date);
    const dayOfWeek = date.getDay(); // 0 = Sunday
    const hour = parseInt(shift.startTime.split(':')[0], 10);

    // Check for Tuesday morning/evening split
    let dayCode: string;
    if (dayOfWeek === 2) {
      dayCode = hour < 16 ? '2_morning' : '2_evening';
    } else {
      dayCode = dayOfWeek.toString();
    }

    if (!currentUser.preferredDays.includes(dayCode)) return false;

    // Check blackout dates
    if (currentUser.blackoutDates.includes(shift.date)) return false;

    // Check only dates - if specified, volunteer can ONLY work these specific dates
    if (currentUser.onlyDates.length > 0 && !currentUser.onlyDates.includes(shift.date)) {
      return false;
    }

    return true;
  };

  // Show open shifts that the volunteer could potentially work
  const openShifts = shifts
    .filter(s => s.status === 'Open' && isShiftUpcoming(s.date) && !myShiftIds.has(s.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5); // Limit to 5 open shifts

  // Get available shifts for switching (open shifts the volunteer can work)
  const availableShiftsForSwitch = shifts
    .filter(s =>
      s.status === 'Open' &&
      isShiftUpcoming(s.date) &&
      !myShiftIds.has(s.id) &&
      canWorkShift(s)
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const handleAvatarUpload = async (file: File) => {
    setIsUploadingAvatar(true);
    try {
      // Compress the image before uploading
      const compressedFile = await compressImage(file);

      // Get user ID from Supabase auth
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        alert('You must be logged in to upload an avatar');
        return;
      }

      // Upload to storage
      const { url, error } = await uploadAvatar(user.id, compressedFile);

      if (error || !url) {
        alert(error || 'Failed to upload avatar');
        return;
      }

      // Update form with new avatar URL
      setEditForm({ ...editForm, avatarUrl: url });
      setAvatarPreview(url);
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAvatarUpload(file);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Open a single shift in Google Calendar (URL-based, no OAuth needed)
  const handleAddShiftToCalendar = (shift: Shift) => {
    openGoogleCalendarForShift(shift);
  };

  const handleSave = async () => {
    console.log('[VolunteerDashboard] Saving changes...', editForm);
    setIsSaving(true);
    try {
      await updateVolunteer(editForm);
      console.log('[VolunteerDashboard] Save completed successfully');
      setIsEditing(false);
      setToast({ message: 'Changes saved successfully', type: 'success' });
    } catch (error) {
      console.error('[VolunteerDashboard] Error saving volunteer data:', error);
      setToast({ message: 'Failed to save changes. Please try again.', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleDay = (dayId: string) => {
    const current = editForm.preferredDays || [];
    // Toggle the specific day ID (e.g., "2_morning" or "2_evening" independently)
    const exists = current.includes(dayId);

    let updated;
    if (exists) {
      updated = current.filter(d => d !== dayId);
    } else {
      updated = [...current, dayId];
    }
    setEditForm({ ...editForm, preferredDays: updated });
  };

  const addBlackoutDate = () => {
    if (!newBlackoutDate) return;

    const datesToAdd: string[] = [];

    // If end date is specified, add all dates in range
    if (newBlackoutEndDate && newBlackoutEndDate >= newBlackoutDate) {
      const startDate = new Date(newBlackoutDate);
      const endDate = new Date(newBlackoutEndDate);

      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (!editForm.blackoutDates.includes(dateStr)) {
          datesToAdd.push(dateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else {
      // Single date
      if (!editForm.blackoutDates.includes(newBlackoutDate)) {
        datesToAdd.push(newBlackoutDate);
      }
    }

    if (datesToAdd.length > 0) {
      setEditForm({
        ...editForm,
        blackoutDates: [...editForm.blackoutDates, ...datesToAdd].sort()
      });
    }

    setNewBlackoutDate('');
    setNewBlackoutEndDate('');
  };

  const removeBlackoutDate = (date: string) => {
    setEditForm({
      ...editForm,
      blackoutDates: editForm.blackoutDates.filter(d => d !== date)
    });
  };

  // Functions for "Only Dates" - days the volunteer CAN come
  const addOnlyDate = () => {
    if (!newOnlyDate) return;

    const datesToAdd: string[] = [];

    // If end date is specified, add all dates in range
    if (newOnlyEndDate && newOnlyEndDate >= newOnlyDate) {
      const startDate = new Date(newOnlyDate);
      const endDate = new Date(newOnlyEndDate);

      const currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0];
        if (!editForm.onlyDates.includes(dateStr)) {
          datesToAdd.push(dateStr);
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else {
      // Single date
      if (!editForm.onlyDates.includes(newOnlyDate)) {
        datesToAdd.push(newOnlyDate);
      }
    }

    if (datesToAdd.length > 0) {
      setEditForm({
        ...editForm,
        onlyDates: [...editForm.onlyDates, ...datesToAdd].sort()
      });
    }

    setNewOnlyDate('');
    setNewOnlyEndDate('');
  };

  const removeOnlyDate = (date: string) => {
    setEditForm({
      ...editForm,
      onlyDates: editForm.onlyDates.filter(d => d !== date)
    });
  };

  const clearAllOnlyDates = () => {
    setEditForm({
      ...editForm,
      onlyDates: []
    });
  };

  const isDaySelected = (dayId: string) => {
    return editForm.preferredDays?.includes(dayId);
  };

  return (
    <div className="h-full bg-slate-50 overflow-y-auto">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-[60] px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium transition-all animate-fade-in flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
        }`}>
          {toast.type === 'success' ? <Check size={16} /> : <X size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="max-w-5xl mx-auto p-3 sm:p-6 md:p-12 pb-24">

        {/* Profile Header */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm border border-slate-200 mb-6 sm:mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 sm:gap-4">
            {currentUser.avatarUrl ? (
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.name}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover flex-shrink-0 border-2 border-indigo-200"
              />
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-lg sm:text-xl font-bold flex-shrink-0">
                {currentUser.name.charAt(0)}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-slate-900 truncate">Welcome, {currentUser.name}!</h1>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs sm:text-sm text-slate-500 truncate">{currentUser.email}</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full hidden sm:block"></span>
                <span className="text-xs sm:text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                  {currentUser.availabilityStatus}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              setEditForm(currentUser);
              setIsEditing(true);
            }}
            className="w-full md:w-auto text-indigo-600 font-medium hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors border border-indigo-200 text-sm sm:text-base text-center"
          >
            Edit Profile & Availability
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 p-1 flex gap-1">
          <button
            onClick={() => setActiveTab('my-shifts')}
            className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm sm:text-base transition-all ${
              activeTab === 'my-shifts'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <Calendar size={18} />
              <span>My Shifts</span>
            </span>
          </button>
          <button
            onClick={() => setActiveTab('monthly-schedule')}
            className={`flex-1 px-4 py-3 rounded-lg font-medium text-sm sm:text-base transition-all ${
              activeTab === 'monthly-schedule'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <Users size={18} />
              <span>Monthly Schedule</span>
            </span>
          </button>
        </div>

        {/* My Shifts Tab Content */}
        {activeTab === 'my-shifts' && (
          <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* My Upcoming Shifts */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="text-indigo-600 flex-shrink-0" size={20} />
                <span className="line-clamp-1">My Upcoming Shifts </span>
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 hidden sm:inline">
                  Use calendar buttons to add shifts
                </span>
                <button
                  onClick={loadMyAssignments}
                  disabled={isLoadingAssignments}
                  className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors flex-shrink-0"
                  title="Refresh shifts"
                >
                  <RefreshCw size={18} className={isLoadingAssignments ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {isLoadingAssignments ? (
              <div className="bg-white p-6 sm:p-10 rounded-xl border border-slate-200 text-center text-slate-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                <p className="text-sm">Loading your shifts...</p>
              </div>
            ) : myShifts.length === 0 ? (
              <div className="bg-white p-6 sm:p-10 rounded-xl border border-dashed border-slate-300 text-center text-slate-500">
                <p className="text-sm">You have no shifts assigned for the next month. Contact the workshop manager if you think this is an error.</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {myShifts.map(shift => {
                  // Check if there's already a pending switch request for this shift
                  const existingRequest = switchRequests.find(
                    r => r.shiftId === shift.id && r.requestingVolunteerId === currentUser.id && r.status === 'pending'
                  );

                  const shiftTeam = shiftCoworkers[shift.id] || [];
                  const otherVolunteers = shiftTeam.filter(v => v.id !== currentUser.id);

                  return (
                    <div key={shift.id} className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border-l-4 border-indigo-500 hover:shadow-md transition-shadow">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base sm:text-lg text-slate-900 mb-2">{shift.title}</h3>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-slate-600 mb-3">
                            <span className="flex items-center gap-1.5 text-xs sm:text-sm"><Calendar size={14}/> {formatDateDDMMYYYY(shift.date)}</span>
                            <span className="flex items-center gap-1.5 text-xs sm:text-sm"><Clock size={14}/> {shift.startTime} - {shift.endTime}</span>
                            {shift.location && <span className="flex items-center gap-1.5 text-xs sm:text-sm"><MapPin size={14}/> {shift.location}</span>}
                          </div>
                          {/* Team Members Display */}
                          {shiftTeam.length > 0 && (
                            <div className="flex items-center gap-2 mt-2">
                              <Users size={14} className="text-slate-500" />
                              <div className="flex items-center gap-1">
                                {shiftTeam.slice(0, 4).map((volunteer, idx) => (
                                  <div
                                    key={volunteer.id}
                                    className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-semibold text-indigo-700 border-2 border-white"
                                    style={{ marginLeft: idx > 0 ? '-8px' : '0' }}
                                    title={volunteer.name}
                                  >
                                    {volunteer.name.charAt(0).toUpperCase()}
                                  </div>
                                ))}
                                {shiftTeam.length > 4 && (
                                  <div
                                    className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 border-2 border-white"
                                    style={{ marginLeft: '-8px' }}
                                  >
                                    +{shiftTeam.length - 4}
                                  </div>
                                )}
                              </div>
                              <span className="text-xs text-slate-500 ml-1">
                                {shiftTeam.length} volunteer{shiftTeam.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-row sm:flex-col gap-2 items-start sm:items-end">
                          {existingRequest ? (
                            <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-xs font-semibold rounded-full whitespace-nowrap">
                              SWITCH PENDING
                            </span>
                          ) : (
                            <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full whitespace-nowrap">
                              CONFIRMED
                            </span>
                          )}
                          <div className="flex flex-row gap-2">
                            <button
                              onClick={() => handleAddShiftToCalendar(shift)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap bg-amber-50 text-amber-700 hover:bg-amber-100"
                              title="Add to Google Calendar"
                            >
                              <Calendar size={14} />
                              <span className="hidden sm:inline">Add to Calendar</span>
                            </button>
                            <button
                              onClick={() => loadCoworkers(shift)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap bg-blue-50 text-blue-700 hover:bg-blue-100"
                              title="View team members on this shift"
                            >
                              <Users size={14} />
                              <span className="hidden sm:inline">View Team</span>
                            </button>
                            <button
                              onClick={() => handleOpenSwitchModal(shift)}
                              disabled={!!existingRequest}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap ${
                                existingRequest
                                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                              title={existingRequest ? 'Switch request already pending' : 'Switch to a different shift'}
                            >
                              <Repeat size={14} />
                              <span className="hidden sm:inline">{existingRequest ? 'Pending' : 'Switch'}</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sidebar Stats & Info */}
          <div className="space-y-6 lg:sticky lg:top-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">Upcoming Shifts</h3>
              <div className="space-y-3">
                {(() => {
                  // Group shifts by month
                  const shiftsByMonth = myShifts.reduce((acc, shift) => {
                    const date = new Date(shift.date);
                    const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
                    const monthName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                    if (!acc[monthKey]) {
                      acc[monthKey] = { name: monthName, count: 0, date };
                    }
                    acc[monthKey].count++;
                    return acc;
                  }, {} as Record<string, { name: string; count: number; date: Date }>);

                  const sortedMonths = Object.values(shiftsByMonth).sort((a, b) => a.date.getTime() - b.date.getTime());

                  // Get next 3 months to show (including current)
                  const now = new Date();
                  const monthsToShow = [];
                  for (let i = 0; i < 3; i++) {
                    const targetDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
                    const monthKey = `${targetDate.getFullYear()}-${targetDate.getMonth()}`;
                    const monthName = targetDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                    const existing = shiftsByMonth[monthKey];
                    monthsToShow.push({
                      name: monthName,
                      count: existing?.count || 0,
                      isAssigned: !!existing
                    });
                  }

                  return monthsToShow.map((month, idx) => (
                    <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-b-0">
                      <span className="text-slate-600 text-sm">{month.name}</span>
                      {month.count > 0 ? (
                        <span className="font-bold text-indigo-600">{month.count} shift{month.count !== 1 ? 's' : ''}</span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Not assigned yet</span>
                      )}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

        </div>

        {/* Pending Switch Requests Section */}
        {switchRequests.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Repeat className="text-emerald-600" /> Shift Switch Requests
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {switchRequests.map(request => {
                const shift = shifts.find(s => s.id === request.shiftId);
                if (!shift) return null;

                const isMyRequest = request.requestingVolunteerId === currentUser.id;
                const isTargetingMe = request.targetVolunteerId === currentUser.id;

                return (
                  <div key={request.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h4 className="font-semibold text-slate-900">{shift.title}</h4>
                        <p className="text-sm text-slate-500 mt-1">{formatDateDDMMYYYY(shift.date)} • {shift.startTime} - {shift.endTime}</p>
                        {shift.location && <p className="text-xs text-slate-400 mt-1">{shift.location}</p>}
                      </div>
                      <span className="bg-amber-50 text-amber-700 text-xs px-2 py-1 rounded-full font-medium">
                        {request.status.toUpperCase()}
                      </span>
                    </div>

                    {request.message && (
                      <div className="bg-slate-50 p-3 rounded-lg mb-3">
                        <p className="text-sm text-slate-600 italic">"{request.message}"</p>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      {isMyRequest ? (
                        <>
                          <span className="text-xs text-slate-500 flex-1">You requested this switch</span>
                          <button
                            onClick={() => handleCancelSwitchRequest(request.id)}
                            className="text-xs text-red-600 hover:bg-red-50 px-3 py-1 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="text-xs text-slate-500 flex-1">Available to take</span>
                          <button
                            onClick={() => handleAcceptSwitchRequest(request.id)}
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1"
                          >
                            <Check size={12} />
                            Accept Switch
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
          </>
        )}

        {/* Monthly Schedule Tab Content */}
        {activeTab === 'monthly-schedule' && (
          <div className="space-y-6">
            {/* Schedule Selector */}
            {monthlySchedules.length > 0 && (
              <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                <label className="block text-sm font-medium text-slate-700 mb-2">Select Month</label>
                <select
                  value={selectedSchedule?.id || ''}
                  onChange={(e) => {
                    const schedule = monthlySchedules.find(s => s.id === e.target.value);
                    if (schedule) loadScheduleDetails(schedule);
                  }}
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {monthlySchedules.map(schedule => (
                    <option key={schedule.id} value={schedule.id}>
                      {formatMonthYear(schedule.targetMonth, schedule.targetYear)} - {schedule.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Schedule Content */}
            {isLoadingSchedule ? (
              <div className="bg-white p-10 rounded-xl border border-slate-200 text-center">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-indigo-600" />
                <p className="text-slate-500">Loading schedule...</p>
              </div>
            ) : !selectedSchedule ? (
              <div className="bg-white p-10 rounded-xl border-2 border-dashed border-slate-200 text-center">
                <Calendar size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No Schedules Available</h3>
                <p className="text-slate-500">The admin hasn't published any monthly schedules yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Schedule Header */}
                <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 mb-1">{selectedSchedule.name}</h2>
                      <p className="text-slate-600">
                        {formatMonthYear(selectedSchedule.targetMonth, selectedSchedule.targetYear)}
                      </p>
                      {selectedSchedule.notes && (
                        <p className="text-sm text-slate-500 mt-2 p-2 bg-slate-50 rounded-lg">{selectedSchedule.notes}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-blue-500"></span>
                        <span>Hatachana</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-orange-500"></span>
                        <span>Dizengoff</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-purple-500"></span>
                        <span>Both</span>
                      </div>
                      <div className="w-px h-4 bg-slate-300"></div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded bg-indigo-600"></span>
                        <span>Your Shift</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Calendar View */}
                {(() => {
                  const year = selectedSchedule.targetYear;
                  const month = selectedSchedule.targetMonth - 1;
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const daysInMonth = lastDay.getDate();
                  const startDayOffset = firstDay.getDay();

                  const days: (number | null)[] = [];
                  for (let i = 0; i < startDayOffset; i++) days.push(null);
                  for (let i = 1; i <= daysInMonth; i++) days.push(i);

                  return (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                      {/* Day Headers */}
                      <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                          <div key={d} className="py-2 sm:py-3 text-center text-xs sm:text-sm font-semibold text-slate-600">{d}</div>
                        ))}
                      </div>
                      {/* Calendar Grid */}
                      <div className="grid grid-cols-7 auto-rows-fr bg-slate-100 gap-px">
                        {days.map((day, idx) => {
                          if (!day) return <div key={`empty-${idx}`} className="bg-white min-h-[80px] sm:min-h-[120px]" />;

                          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                          const dayShifts = scheduleShifts.filter(s => s.date === dateStr);

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
                            <div key={day} className="bg-white min-h-[80px] sm:min-h-[120px] p-1 sm:p-2 flex flex-col">
                              <div className="text-xs sm:text-sm font-bold text-slate-400 mb-1">{day}</div>
                              <div className="space-y-1 flex-1 overflow-y-auto">
                                {dayShifts.map(shift => {
                                  const isMyShift = scheduleAssignments.some(
                                    a => a.shiftId === shift.id && a.volunteerId === currentUser.id
                                  );
                                  const shiftTeam = shiftCoworkers[shift.id] || [];
                                  const location = shift.location || 'BOTH';
                                  const isDizengoff = location === 'DIZENGOFF';
                                  const isHatachana = location === 'HATACHANA';

                                  let bgClass = 'bg-purple-50 border-purple-300';
                                  let locationBadge = 'B';
                                  let badgeClass = 'bg-purple-500';

                                  if (isDizengoff) {
                                    bgClass = 'bg-orange-50 border-orange-300';
                                    locationBadge = 'D';
                                    badgeClass = 'bg-orange-500';
                                  } else if (isHatachana) {
                                    bgClass = 'bg-blue-50 border-blue-300';
                                    locationBadge = 'H';
                                    badgeClass = 'bg-blue-500';
                                  }

                                  if (isMyShift) {
                                    bgClass = 'bg-indigo-100 border-indigo-500 ring-2 ring-indigo-300';
                                  }

                                  return (
                                    <div
                                      key={shift.id}
                                      className={`p-1 sm:p-1.5 rounded border text-xs cursor-pointer hover:shadow-sm transition-shadow ${bgClass}`}
                                      onClick={() => loadCoworkers(shift)}
                                      title={`${shift.title} - ${shift.startTime}-${shift.endTime}${isMyShift ? ' (Your Shift)' : ''}`}
                                    >
                                      <div className="flex items-center gap-1 mb-0.5">
                                        <span className={`w-3 h-3 sm:w-4 sm:h-4 rounded text-white text-[8px] sm:text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${badgeClass}`}>
                                          {locationBadge}
                                        </span>
                                        <span className="font-semibold truncate text-[10px] sm:text-xs text-slate-800">
                                          {shift.startTime.slice(0,5)}
                                        </span>
                                        {new Date(dateStr).getDay() === 5 && (
                                          <span className={`px-1 py-0 rounded text-[8px] sm:text-[9px] font-bold flex-shrink-0 ${
                                            parseInt(shift.startTime.split(':')[0], 10) < 14
                                              ? 'bg-amber-200 text-amber-800'
                                              : 'bg-violet-200 text-violet-800'
                                          }`}>
                                            {parseInt(shift.startTime.split(':')[0], 10) < 14 ? 'Opening' : 'Closing'}
                                          </span>
                                        )}
                                        {isMyShift && (
                                          <span className="w-2 h-2 rounded-full bg-indigo-600 flex-shrink-0" title="Your Shift"></span>
                                        )}
                                      </div>
                                      <div className="hidden sm:block text-[10px] text-slate-600 truncate">{shift.title}</div>
                                      {shiftTeam.length > 0 && (
                                        <div className="flex items-center gap-0.5 mt-0.5">
                                          {shiftTeam.slice(0, 3).map((vol, i) => (
                                            <div
                                              key={vol.id}
                                              className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full text-[8px] sm:text-[10px] font-bold flex items-center justify-center ${
                                                vol.id === currentUser.id
                                                  ? 'bg-indigo-600 text-white'
                                                  : 'bg-slate-200 text-slate-700'
                                              }`}
                                              style={{ marginLeft: i > 0 ? '-4px' : '0' }}
                                              title={vol.name}
                                            >
                                              {vol.name.charAt(0)}
                                            </div>
                                          ))}
                                          {shiftTeam.length > 3 && (
                                            <span className="text-[8px] sm:text-[10px] text-slate-500 ml-0.5">+{shiftTeam.length - 3}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}

                                {/* Render Events */}
                                {dayEvents.map(event => (
                                  <div
                                    key={event.id}
                                    onClick={() => setSelectedEventForDetails(event)}
                                    className="p-1 sm:p-1.5 rounded border border-green-300 bg-green-50 text-xs cursor-pointer hover:shadow-sm transition-shadow"
                                    title={`${event.title}${event.description ? ': ' + event.description : ''}\n${event.startTime}-${event.endTime}${event.location ? '\n' + event.location : ''}`}
                                  >
                                    <div className="flex items-center gap-1 mb-0.5">
                                      {event.emoji && (
                                        <span className="text-sm flex-shrink-0">{event.emoji}</span>
                                      )}
                                      <span className="font-semibold truncate text-[10px] sm:text-xs text-green-800">
                                        {event.startTime.slice(0,5)}
                                      </span>
                                    </div>
                                    <div className="text-[10px] sm:text-xs text-green-700 font-medium truncate">
                                      {event.title}
                                    </div>
                                    {event.location && (
                                      <div className="text-[8px] sm:text-[10px] text-green-600 truncate mt-0.5">
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
                  );
                })()}

                {/* Legend */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                  <p className="text-xs text-slate-500 text-center">
                    Click on any shift to see who's working. Your shifts are highlighted with a purple ring.
                    <span className="block mt-1">Events are shown in green with emoji icons.</span>
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Bottom spacer to ensure full scrollability */}
        <div className="h-16 mt-8 flex items-center justify-center">
          <div className="w-32 h-1 bg-slate-200 rounded-full"></div>
        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative animate-fade-in max-h-[calc(100vh-2rem)] overflow-y-auto">
            <button 
              onClick={() => setIsEditing(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-slate-900 mb-6">Edit Profile & Availability</h2>

            {/* Avatar Upload */}
            <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Profile Picture</h3>
              <div className="flex flex-col items-center gap-4">
                {/* Avatar Preview */}
                <div className="relative">
                  {avatarPreview || editForm.avatarUrl ? (
                    <img
                      src={avatarPreview || editForm.avatarUrl}
                      alt="Avatar preview"
                      className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-3xl font-bold border-4 border-white shadow-lg">
                      {editForm.name.charAt(0)}
                    </div>
                  )}
                  {isUploadingAvatar && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                      <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                </div>

                {/* Upload Buttons */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={triggerFileInput}
                    disabled={isUploadingAvatar}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    <Upload size={16} />
                    Upload Photo
                  </button>
                  <button
                    type="button"
                    onClick={triggerFileInput}
                    disabled={isUploadingAvatar}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    <Camera size={16} />
                    Take Photo
                  </button>
                </div>
                <p className="text-xs text-slate-500 text-center">
                  Upload a photo or take one with your camera<br/>
                  (Max 2MB, JPG/PNG/WebP/GIF)
                </p>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  capture="user"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            {/* Profile Information */}
            <div className="mb-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Personal Information</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({...editForm, name: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                      className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({...editForm, phone: e.target.value})}
                      className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                      required
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Volunteer Frequency */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">How often would you like to volunteer?</label>
              <select
                value={editForm.frequency}
                onChange={(e) => setEditForm({...editForm, frequency: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="ONCE_A_WEEK">Once a Week</option>
                <option value="TWICE_A_MONTH">Twice a Month</option>
                <option value="ONCE_A_MONTH">Once a Month</option>
              </select>
            </div>

            {/* Preferred Location */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Preferred Workshop Location</label>
              <select
                value={editForm.preferredLocation}
                onChange={(e) => setEditForm({...editForm, preferredLocation: e.target.value})}
                className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="HATACHANA">Hatachana</option>
                <option value="DIZENGOFF">Dizengoff</option>
                <option value="BOTH">Both</option>
              </select>
            </div>

            {/* Preferred Days */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Preferred Days</label>
              <div className="grid grid-cols-2 gap-2">
                {DAYS.map(day => (
                  <button
                    key={day.id}
                    onClick={() => toggleDay(day.id)}
                    className={`flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-colors ${
                      isDaySelected(day.id)
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {day.label}
                    {isDaySelected(day.id) && <Check size={14} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Blackout Dates - Days I can't volunteer */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Days I can't volunteer</label>
              <p className="text-xs text-slate-500 mb-2">Select specific dates when you are unavailable</p>
              <div className="space-y-2 mb-3">
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={newBlackoutDate}
                    onChange={(e) => setNewBlackoutDate(e.target.value)}
                    min={getDefaultMinDate()}
                    placeholder="Start date"
                  />
                  <span className="text-slate-400 text-sm">to</span>
                  <input
                    type="date"
                    className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                    value={newBlackoutEndDate}
                    onChange={(e) => setNewBlackoutEndDate(e.target.value)}
                    min={newBlackoutDate || getDefaultMinDate()}
                    placeholder="End date (optional)"
                  />
                  <button
                    onClick={addBlackoutDate}
                    disabled={!newBlackoutDate}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus size={18} />
                    Add
                  </button>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                {editForm.blackoutDates.map(date => (
                  <span key={date} className="inline-flex items-center gap-1 px-2 py-1 bg-red-50 text-red-700 rounded-md text-sm">
                    {date}
                    <button onClick={() => removeBlackoutDate(date)} className="hover:bg-red-100 rounded p-0.5">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {editForm.blackoutDates.length === 0 && (
                  <span className="text-slate-400 text-sm italic">No dates marked unavailable</span>
                )}
              </div>
            </div>

            {/* Only Dates - Days I CAN come */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">Days I CAN come</label>
                {editForm.onlyDates.length > 0 && (
                  <button
                    onClick={clearAllOnlyDates}
                    className="text-xs text-slate-500 hover:text-red-600 transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-2">
                If you set specific dates here, you will <strong>only</strong> be scheduled on these dates.
                Leave empty to be available on all your preferred days.
              </p>
              <div className="space-y-2 mb-3">
                <div className="flex gap-2 items-center">
                  <input
                    type="date"
                    className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    value={newOnlyDate}
                    onChange={(e) => setNewOnlyDate(e.target.value)}
                    min={getDefaultMinDate()}
                    placeholder="Start date"
                  />
                  <span className="text-slate-400 text-sm">to</span>
                  <input
                    type="date"
                    className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                    value={newOnlyEndDate}
                    onChange={(e) => setNewOnlyEndDate(e.target.value)}
                    min={newOnlyDate || getDefaultMinDate()}
                    placeholder="End date (optional)"
                  />
                  <button
                    onClick={addOnlyDate}
                    disabled={!newOnlyDate}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                  >
                    <Plus size={18} />
                    Add
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {editForm.onlyDates.map(date => (
                  <span key={date} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-md text-sm">
                    {date}
                    <button onClick={() => removeOnlyDate(date)} className="hover:bg-emerald-100 rounded p-0.5">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {editForm.onlyDates.length === 0 && (
                  <span className="text-slate-400 text-sm italic">Available on all preferred days (no restrictions)</span>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
              <textarea
                value={editForm.notes || ''}
                onChange={(e) => {
                  if (e.target.value.length <= 500) {
                    setEditForm({ ...editForm, notes: e.target.value });
                  }
                }}
                placeholder="Add any notes about your availability, preferences, or other info..."
                className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm resize-none"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-slate-400 text-right mt-1">{(editForm.notes || '').length}/500</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Switch Request Modal */}
      {showSwitchModal && switchRequestShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-4 sm:p-6 relative animate-fade-in max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] overflow-y-auto">
            <button
              onClick={() => setShowSwitchModal(false)}
              className="absolute top-3 right-3 sm:top-4 sm:right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-4 sm:mb-6 flex items-center gap-2 pr-8">
              <Repeat className="text-emerald-600 flex-shrink-0" />
              <span className="line-clamp-2">Switch to Different Shifts</span>
            </h2>

            {/* Shift Details */}
            <div className="bg-indigo-50 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6">
              <p className="text-xs sm:text-sm text-slate-600 mb-2">You want to switch from:</p>
              <h3 className="font-bold text-base sm:text-lg text-slate-900">{switchRequestShift.title}</h3>
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 text-slate-600">
                <span className="flex items-center gap-1.5 text-xs sm:text-sm"><Calendar size={14}/> {formatDateDDMMYYYY(switchRequestShift.date)}</span>
                <span className="flex items-center gap-1.5 text-xs sm:text-sm"><Clock size={14}/> {switchRequestShift.startTime} - {switchRequestShift.endTime}</span>
                {switchRequestShift.location && <span className="flex items-center gap-1.5 text-xs sm:text-sm"><MapPin size={14}/> {switchRequestShift.location}</span>}
              </div>
            </div>

            {/* Select Shifts to Switch To */}
            <div className="mb-4 sm:mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-slate-700">
                  Select replacement shifts (optional)
                </label>
                {selectedShiftIds.length > 0 && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-medium">
                    {selectedShiftIds.length} selected
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mb-3">
                You can select one or more replacement shifts, or submit without selecting any to simply drop this shift.
              </p>

              {availableShiftsForSwitch.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-amber-900">
                  <p className="font-medium mb-1">No replacement shifts available</p>
                  <p>There are currently no open shifts that match your location, day, and date preferences. You can still submit to drop this shift without selecting a replacement.</p>
                </div>
              ) : (
                <div className="max-h-[35vh] sm:max-h-[45vh] md:max-h-[50vh] overflow-y-auto border border-slate-200 rounded-lg">
                  {availableShiftsForSwitch.map((shift) => {
                    const isSelected = selectedShiftIds.includes(shift.id);
                    return (
                      <label
                        key={shift.id}
                        className={`flex items-start gap-3 p-3 sm:p-4 border-b border-slate-100 last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-50 border-l-4 border-l-emerald-500'
                            : 'border-l-4 border-l-transparent'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleShiftSelection(shift.id)}
                          className="mt-1 w-4 h-4 text-emerald-600 border-slate-300 rounded focus:ring-emerald-500 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm sm:text-base text-slate-900">{shift.title}</h4>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1 text-xs sm:text-sm text-slate-600">
                            <span className="flex items-center gap-1">
                              <Calendar size={12}/> {formatDateDDMMYYYY(shift.date)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock size={12}/> {shift.startTime} - {shift.endTime}
                            </span>
                            {shift.location && (
                              <span className="flex items-center gap-1">
                                <MapPin size={12}/> {shift.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Info Note */}
            <div className="bg-blue-50 p-3 sm:p-4 rounded-lg mb-4 sm:mb-6 border border-blue-100">
              <p className="text-xs sm:text-sm text-blue-900">
                <strong>How it works:</strong> You will be immediately removed from your current shift and assigned to all selected shifts. This change takes effect right away.
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <button
                onClick={() => setShowSwitchModal(false)}
                className="w-full sm:flex-1 px-4 py-2.5 sm:py-2 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitSwitchRequest}
                disabled={isSubmittingSwitchRequest}
                className="w-full sm:flex-1 px-4 py-2.5 sm:py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
              >
                <Repeat size={16} />
                {isSubmittingSwitchRequest ? 'Switching...' : selectedShiftIds.length > 0 ? `Switch to ${selectedShiftIds.length} Shift${selectedShiftIds.length !== 1 ? 's' : ''}` : 'Drop Shift'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Coworkers Modal */}
      {showCoworkersModal && coworkersShift && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative animate-fade-in max-h-[calc(100vh-2rem)] overflow-y-auto">
            <button
              onClick={() => setShowCoworkersModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
              <Users className="text-blue-600" />
              Team Members
            </h2>

            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-slate-600 mb-1">Shift:</p>
              <p className="font-bold text-slate-900">{coworkersShift.title}</p>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-slate-600">
                <span className="flex items-center gap-1.5 text-sm">
                  <Calendar size={14}/> {formatDateDDMMYYYY(coworkersShift.date)}
                </span>
                <span className="flex items-center gap-1.5 text-sm">
                  <Clock size={14}/> {coworkersShift.startTime} - {coworkersShift.endTime}
                </span>
              </div>
            </div>

            {isLoadingCoworkers ? (
              <div className="py-8 text-center text-slate-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                <p className="text-sm">Loading team members...</p>
              </div>
            ) : coworkers.length === 0 ? (
              <div className="py-8 text-center text-slate-500">
                <Users size={32} className="mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No other team members on this shift yet.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 mb-3">
                  {coworkers.length} team member{coworkers.length !== 1 ? 's' : ''} on this shift:
                </p>
                {coworkers.map(volunteer => (
                  <div
                    key={volunteer.id}
                    className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                        {volunteer.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{volunteer.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedVolunteerProfile(volunteer)}
                      className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-2 rounded-lg transition-colors"
                      title="View profile"
                    >
                      <User size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowCoworkersModal(false)}
                className="bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Volunteer Profile Modal */}
      {selectedVolunteerProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative animate-fade-in">
            <button
              onClick={() => setSelectedVolunteerProfile(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>

            <div className="text-center mb-6">
              <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-2xl mx-auto mb-4">
                {selectedVolunteerProfile.name.charAt(0)}
              </div>
              <h2 className="text-2xl font-bold text-slate-900">{selectedVolunteerProfile.name}</h2>
            </div>

            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-slate-600 mb-1">
                  <Phone size={16} />
                  <span className="text-sm font-medium">Phone</span>
                </div>
                <a
                  href={`tel:${selectedVolunteerProfile.phone}`}
                  className="text-lg font-semibold text-blue-600 hover:text-blue-700"
                >
                  {selectedVolunteerProfile.phone}
                </a>
              </div>

              {selectedVolunteerProfile.email && (
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="flex items-center gap-2 text-slate-600 mb-1">
                    <User size={16} />
                    <span className="text-sm font-medium">Email</span>
                  </div>
                  <a
                    href={`mailto:${selectedVolunteerProfile.email}`}
                    className="text-sm font-medium text-blue-600 hover:text-blue-700 break-all"
                  >
                    {selectedVolunteerProfile.email}
                  </a>
                </div>
              )}

              {selectedVolunteerProfile.skills && selectedVolunteerProfile.skills.length > 0 && (
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-sm font-medium text-slate-600 mb-2">Skills</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedVolunteerProfile.skills.map((skill, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full font-medium"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <a
                href={`tel:${selectedVolunteerProfile.phone}`}
                className="flex-1 bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Phone size={18} />
                Call
              </a>
              <button
                onClick={() => setSelectedVolunteerProfile(null)}
                className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
              >
                Close
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
    </div>
  );
};

export default VolunteerDashboard;
