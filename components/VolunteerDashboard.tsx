import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Check, Plus, Trash2, X, RefreshCw, Repeat, Users, User, Phone } from 'lucide-react';
import { Volunteer, Shift, ShiftAssignment, ShiftSwitchRequest, SavedSchedule, SavedScheduleAssignment } from '../types';
import { getVolunteerAssignments, getVolunteerSwitchRequests, createSwitchRequest, acceptSwitchRequest, cancelSwitchRequest, removeVolunteerFromShift, addVolunteerToShift, getShiftAssignments } from '../services/shiftAssignmentService';
import { loadSavedSchedules, loadScheduleAssignments } from '../services/scheduleHistoryService';
import { supabase } from '../lib/supabase';
import { mapVolunteerFromDB, mapShiftFromDB } from '../lib/mappers';

interface VolunteerDashboardProps {
  currentUser: Volunteer;
  shifts: Shift[];
  updateVolunteer: (v: Volunteer) => void;
}

const DAYS = [
  { id: '0', label: 'Sunday' },
  { id: '1', label: 'Monday' },
  { id: '2_morning', label: 'Tuesday Morning' },
  { id: '2_evening', label: 'Tuesday Evening' },
  { id: '3', label: 'Wednesday' },
  { id: '4', label: 'Thursday' },
  { id: '5', label: 'Friday' },
  { id: '6', label: 'Saturday' },
];

const VolunteerDashboard: React.FC<VolunteerDashboardProps> = ({ currentUser, shifts, updateVolunteer }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Volunteer>(currentUser);
  const [newBlackoutDate, setNewBlackoutDate] = useState('');
  const [newBlackoutEndDate, setNewBlackoutEndDate] = useState('');
  const [myAssignments, setMyAssignments] = useState<ShiftAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
      console.log('[VolunteerDashboard] Received assignments:', assignments);
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
      // Load all saved schedules
      const result = await loadSavedSchedules();
      if (result.success && result.schedules) {
        // Sort by date (most recent first)
        const sorted = result.schedules.sort((a, b) => {
          if (a.targetYear !== b.targetYear) return b.targetYear - a.targetYear;
          return b.targetMonth - a.targetMonth;
        });
        setMonthlySchedules(sorted);

        // Auto-select the most recent schedule
        if (sorted.length > 0 && !selectedSchedule) {
          await loadScheduleDetails(sorted[0]);
        }
      }
    } catch (error) {
      console.error('Error loading monthly schedules:', error);
    } finally {
      setIsLoadingSchedule(false);
    }
  };

  const loadScheduleDetails = async (schedule: SavedSchedule) => {
    setIsLoadingSchedule(true);
    setSelectedSchedule(schedule);
    try {
      // Load assignments for this schedule
      const assignmentsResult = await loadScheduleAssignments(schedule.id);
      if (assignmentsResult.success && assignmentsResult.assignments) {
        setScheduleAssignments(assignmentsResult.assignments);

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

  // Load monthly schedules when tab switches to monthly-schedule
  useEffect(() => {
    if (activeTab === 'monthly-schedule' && monthlySchedules.length === 0) {
      loadMonthlySchedules();
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

  const handleOpenSwitchModal = (shift: Shift) => {
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
          alert(`Failed to assign to ${failedAdds.length} shift(s). Switch cancelled.`);
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

  const handleSave = async () => {
    console.log('[VolunteerDashboard] Saving changes...', editForm);
    setIsSaving(true);
    try {
      await updateVolunteer(editForm);
      console.log('[VolunteerDashboard] Save completed successfully');
      setIsEditing(false);
    } catch (error) {
      console.error('[VolunteerDashboard] Error saving volunteer data:', error);
      alert('Failed to save changes. Please try again.');
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

  const isDaySelected = (dayId: string) => {
    return editForm.preferredDays?.includes(dayId);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-6 md:p-12 relative">
      <div className="max-w-5xl mx-auto">

        {/* Profile Header */}
        <div className="bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-sm border border-slate-200 mb-6 sm:mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-lg sm:text-xl font-bold flex-shrink-0">
              {currentUser.name.charAt(0)}
            </div>
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
              <button
                onClick={loadMyAssignments}
                disabled={isLoadingAssignments}
                className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors flex-shrink-0"
                title="Refresh shifts"
              >
                <RefreshCw size={18} className={isLoadingAssignments ? 'animate-spin' : ''} />
              </button>
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
                            <span className="flex items-center gap-1.5 text-xs sm:text-sm"><Calendar size={14}/> {shift.date}</span>
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
                              onClick={() => loadCoworkers(shift)}
                              className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap bg-blue-50 text-blue-700 hover:bg-blue-100"
                              title="View team members on this shift"
                            >
                              <Users size={14} />
                              View Team
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
                              {existingRequest ? 'Pending' : 'Switch Shift'}
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
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-900 mb-4">My Stats</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                  <span className="text-slate-500">Shifts Completed</span>
                  <span className="font-bold text-slate-900">12</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Hours This Month</span>
                  <span className="font-bold text-slate-900">24</span>
                </div>
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
                        <p className="text-sm text-slate-500 mt-1">{shift.date} • {shift.startTime} - {shift.endTime}</p>
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
                      {new Date(schedule.targetYear, schedule.targetMonth - 1).toLocaleDateString('en-US', {
                        month: 'long',
                        year: 'numeric'
                      })} - {schedule.name}
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
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h2 className="text-xl font-bold text-slate-900 mb-2">{selectedSchedule.name}</h2>
                  <p className="text-slate-600 mb-1">
                    {new Date(selectedSchedule.targetYear, selectedSchedule.targetMonth - 1).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                  {selectedSchedule.notes && (
                    <p className="text-sm text-slate-500 mt-3 p-3 bg-slate-50 rounded-lg">{selectedSchedule.notes}</p>
                  )}
                  <p className="text-xs text-slate-400 mt-3">
                    Published {new Date(selectedSchedule.createdAt).toLocaleDateString()}
                  </p>
                </div>

                {/* All Shifts in Schedule */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <Calendar className="text-indigo-600" size={20} />
                    All Shifts ({scheduleShifts.length})
                  </h3>

                  {scheduleShifts.length === 0 ? (
                    <p className="text-slate-500 text-center py-4">No shifts in this schedule</p>
                  ) : (
                    <div className="space-y-3">
                      {scheduleShifts.map(shift => {
                        // Check if this shift is assigned to current user
                        const isMyShift = scheduleAssignments.some(
                          a => a.shiftId === shift.id && a.volunteerId === currentUser.id
                        );
                        const shiftTeam = shiftCoworkers[shift.id] || [];

                        return (
                          <div
                            key={shift.id}
                            className={`p-4 rounded-xl border-l-4 transition-all ${
                              isMyShift
                                ? 'bg-indigo-50 border-indigo-500 shadow-sm'
                                : 'bg-slate-50 border-slate-300'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="font-bold text-slate-900">{shift.title}</h4>
                                  {isMyShift && (
                                    <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full font-semibold">
                                      YOUR SHIFT
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-slate-600 text-sm mb-2">
                                  <span className="flex items-center gap-1.5">
                                    <Calendar size={14}/> {shift.date}
                                  </span>
                                  <span className="flex items-center gap-1.5">
                                    <Clock size={14}/> {shift.startTime} - {shift.endTime}
                                  </span>
                                  {shift.location && (
                                    <span className="flex items-center gap-1.5">
                                      <MapPin size={14}/> {shift.location}
                                    </span>
                                  )}
                                </div>
                                {/* Team Members */}
                                {shiftTeam.length > 0 && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <Users size={14} className="text-slate-500" />
                                    <div className="flex items-center gap-1">
                                      {shiftTeam.slice(0, 5).map((volunteer, idx) => (
                                        <div
                                          key={volunteer.id}
                                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold border-2 border-white ${
                                            volunteer.id === currentUser.id
                                              ? 'bg-indigo-600 text-white'
                                              : 'bg-slate-200 text-slate-700'
                                          }`}
                                          style={{ marginLeft: idx > 0 ? '-6px' : '0' }}
                                          title={volunteer.name}
                                        >
                                          {volunteer.name.charAt(0).toUpperCase()}
                                        </div>
                                      ))}
                                      {shiftTeam.length > 5 && (
                                        <div
                                          className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 border-2 border-white"
                                          style={{ marginLeft: '-6px' }}
                                        >
                                          +{shiftTeam.length - 5}
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-xs text-slate-500 ml-1">
                                      {shiftTeam.length} volunteer{shiftTeam.length !== 1 ? 's' : ''}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
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

            {/* Blackout Dates */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-700 mb-2">Unavailable Dates (Blackout)</label>
              <p className="text-xs text-slate-500 mb-2">Select a single date or a date range</p>
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
                <span className="flex items-center gap-1.5 text-xs sm:text-sm"><Calendar size={14}/> {switchRequestShift.date}</span>
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
                              <Calendar size={12}/> {shift.date}
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
                  <Calendar size={14}/> {coworkersShift.date}
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
                        <p className="text-xs text-slate-500">{volunteer.role}</p>
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

              <div className="bg-slate-50 p-4 rounded-lg">
                <div className="flex items-center gap-2 text-slate-600 mb-1">
                  <User size={16} />
                  <span className="text-sm font-medium">Role</span>
                </div>
                <p className="text-lg font-semibold text-slate-900">{selectedVolunteerProfile.role}</p>
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
    </div>
  );
};

export default VolunteerDashboard;
