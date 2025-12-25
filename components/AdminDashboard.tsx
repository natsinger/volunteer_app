import React, { useState, useEffect } from 'react';
import {
  Users, Calendar, Sparkles, Plus, Trash2, Edit2,
  Search, CheckCircle, Clock, Upload, RefreshCw, BarChart3, ChevronLeft, ChevronRight, X, AlertTriangle, MapPin, User, Save, History, UserPlus, UserMinus, Mail, Repeat, UserCheck, ShieldCheck
} from 'lucide-react';
import { Volunteer, Shift, RecurringShift, DeletedShiftOccurrence, SavedSchedule, SavedScheduleAssignment, ShiftSwitchRequest } from '../types';
import { generateScheduleAI, getMonthlyCapacity, canVolunteerWorkShift, generateMultipleScheduleOptions } from '../services/geminiService';
import BulkUploadModal from './BulkUploadModal';
import InviteVolunteerModal from './InviteVolunteerModal';
import { supabase } from '../lib/supabase';
import { mapVolunteerToDB, mapVolunteerFromDB, mapShiftToDB, mapShiftFromDB, mapRecurringShiftFromDB, mapRecurringShiftToDB, mapDeletedOccurrenceFromDB } from '../lib/mappers';
import { generateShiftInstances, mergeShifts, getMonthRange, getDayName } from '../lib/recurringShiftUtils';
import { generateShiftsForNextMonths } from '../lib/shiftGenerator';
import { saveSchedule, loadSavedSchedules, loadScheduleAssignments, deleteSchedule, getLatestScheduleForMonth, sendScheduleNotifications } from '../services/scheduleHistoryService';
import { applyScheduleAssignments, getShiftAssignments, addVolunteerToShift as dbAddVolunteerToShift, removeVolunteerFromShift as dbRemoveVolunteerFromShift, clearMonthAssignments, getPendingSwitchRequests, getAllSwitchRequests } from '../services/shiftAssignmentService';
import { getPendingUsers, approveUserAsAdmin, approveUserAsVolunteer, rejectPendingUser, PendingUser } from '../services/userApprovalService';
import { sendPreferenceReminders } from '../services/reminderService';

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
  { id: '5', label: 'Fri' },
];

const AdminDashboard: React.FC<AdminDashboardProps> = ({
  volunteers, shifts, setVolunteers, setShifts
}) => {
  const [activeTab, setActiveTab] = useState<'volunteers' | 'shifts' | 'auto' | 'switchRequests' | 'pendingUsers'>('volunteers');
  const [switchRequests, setSwitchRequests] = useState<ShiftSwitchRequest[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loadingPendingUsers, setLoadingPendingUsers] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [scheduleResultView, setScheduleResultView] = useState<'none' | 'calendar' | 'stats'>('none');

  // Volunteer Management State
  const [searchTerm, setSearchTerm] = useState('');
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);
  const [invitingVolunteer, setInvitingVolunteer] = useState<Volunteer | null>(null);

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

  // Delete Confirmation State
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ type: 'volunteer' | 'shift', id: string, name?: string } | null>(null);

  // Schedule History State
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [showScheduleHistory, setShowScheduleHistory] = useState(false);
  const [showSaveScheduleModal, setShowSaveScheduleModal] = useState(false);
  const [scheduleNameInput, setScheduleNameInput] = useState('');
  const [scheduleNotesInput, setScheduleNotesInput] = useState('');

  // Auto-Scheduler State: Default to Next Month
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const [targetMonth, setTargetMonth] = useState<number>(nextMonth.getMonth() + 1); // 1-12
  const [targetYear, setTargetYear] = useState<number>(nextMonth.getFullYear());

  // Load recurring shifts and deleted occurrences on mount
  useEffect(() => {
    loadRecurringShifts();
    loadDeletedOccurrences();
    loadScheduleHistory();
    loadSwitchRequests();
    loadPendingUsers();
  }, []);

  // Load last saved schedule for the selected month when it changes
  useEffect(() => {
    loadLastScheduleForMonth();
  }, [targetMonth, targetYear]);

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

  const handleApproveAsVolunteer = async (userId: string, email: string) => {
    const result = await approveUserAsVolunteer(userId, email);
    if (result.success) {
      alert(`${email} has been approved as a volunteer!`);
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
      setSelectedOptionId(optionId);
      setShowOptionsModal(false);
      setScheduleResultView('calendar');
    }
  };

  // We need a place to store the assignments since the Shift type is 1-to-1
  const [generatedAssignments, setGeneratedAssignments] = useState<{shiftId: string, volunteerId: string}[]>([]);
  const [isApplyingAssignments, setIsApplyingAssignments] = useState(false);
  const [assignmentsApplied, setAssignmentsApplied] = useState(false);

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

  const handleSkillLevelChange = (id: string, level: 1 | 2 | 3) => {
    setVolunteers(prev => prev.map(v => v.id === id ? { ...v, skillLevel: level } : v));
  };

  const handleSaveVolunteerEdit = async () => {
    if (!editingVolunteer) return;

    try {
      // Convert volunteer to database format
      const dbVolunteer = mapVolunteerToDB(editingVolunteer);

      // Update in Supabase
      const { error } = await supabase
        .from('volunteers')
        .update(dbVolunteer)
        .eq('id', editingVolunteer.id);

      if (error) {
        console.error('Error updating volunteer:', error);
        alert(`Failed to update volunteer: ${error.message}`);
        return;
      }

      // Update local state
      setVolunteers(prev => prev.map(v => v.id === editingVolunteer.id ? editingVolunteer : v));
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

    if (!confirm('Apply these assignments to the database? Volunteers will be able to see their shifts.')) {
      return;
    }

    setIsApplyingAssignments(true);
    try {
      const result = await applyScheduleAssignments(generatedAssignments);

      if (result.success) {
        alert('Assignments applied successfully! Volunteers can now see their shifts.');
        setAssignmentsApplied(true);
      } else {
        alert(`Failed to apply assignments: ${result.error}`);
      }
    } catch (err) {
      console.error('Exception applying assignments:', err);
      alert('An error occurred while applying assignments');
    } finally {
      setIsApplyingAssignments(false);
    }
  };

  // Clear all assignments for the current month
  const handleClearAssignments = async () => {
    if (!confirm('Clear all assignments for this month? This will remove all volunteer assignments from the database.')) {
      return;
    }

    const shiftIds = displayedShifts.map(s => s.id);
    const result = await clearMonthAssignments(shiftIds);

    if (result.success) {
      alert('Assignments cleared successfully');
      setGeneratedAssignments([]);
      setAssignmentsApplied(false);
      setScheduleResultView('none');
    } else {
      alert(`Failed to clear assignments: ${result.error}`);
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

    const result = await saveSchedule(
      scheduleNameInput,
      targetMonth,
      targetYear,
      generatedAssignments,
      scheduleNotesInput
    );

    if (result.success && result.scheduleId) {
      // Send email notifications to all volunteers in the schedule
      const notificationResult = await sendScheduleNotifications(
        result.scheduleId,
        scheduleNameInput,
        targetMonth,
        targetYear
      );

      if (notificationResult.success) {
        alert(`Schedule saved successfully! Notifications sent to ${notificationResult.emailsSent} volunteer${notificationResult.emailsSent !== 1 ? 's' : ''}.`);
      } else {
        alert(`Schedule saved successfully, but failed to send notifications: ${notificationResult.error}`);
      }

      setShowSaveScheduleModal(false);
      setScheduleNameInput('');
      setScheduleNotesInput('');
      loadScheduleHistory();
    } else {
      alert(`Failed to save schedule: ${result.error}`);
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
    if (!confirm('Are you sure you want to delete this saved schedule?')) {
      return;
    }

    const result = await deleteSchedule(scheduleId);
    if (result.success) {
      alert('Schedule deleted successfully');
      loadScheduleHistory();
    } else {
      alert(`Failed to delete schedule: ${result.error}`);
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

    // Check if shift is at capacity (max 5)
    const currentCount = generatedAssignments.filter(a => a.shiftId === shiftId).length;
    if (currentCount >= 5) {
      alert('This shift is already at maximum capacity (5 volunteers)');
      return;
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
    // Update local state
    setGeneratedAssignments(prev =>
      prev.filter(a => !(a.shiftId === shiftId && a.volunteerId === volunteerId))
    );

    // Update database
    const result = await dbRemoveVolunteerFromShift(shiftId, volunteerId);
    if (!result.success) {
      console.error('Failed to remove volunteer from shift in database:', result.error);
      // Rollback local state
      setGeneratedAssignments(prev => [...prev, { shiftId, volunteerId }]);
      alert('Failed to remove volunteer. Please try again.');
    }
  };

  const filteredVolunteers = volunteers.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
              if (!day) return <div key={`empty-${idx}`} className="bg-white min-h-[140px]" />;
              
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const daysShifts = shifts.filter(s => s.date === dateStr);

              return (
                <div key={day} className="bg-white min-h-[140px] p-2 hover:bg-slate-50 transition-colors flex flex-col">
                  <div className="text-sm font-bold text-slate-400 mb-2">{day}</div>
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

                          <div className="space-y-0.5">
                            {assignees.slice(0, 2).map(v => (
                              <div key={v.id} className="truncate opacity-80 text-[10px] flex items-center gap-1">
                                <span className="w-1 h-1 rounded-full bg-slate-400"></span>
                                {v.name.split(' ')[0]}
                              </div>
                            ))}
                            {count > 2 && (
                              <div className="text-[9px] opacity-60 italic pl-2">+{count - 2} more</div>
                            )}
                             {count === 0 && (
                              <div className="text-[9px] text-red-500 italic">Unassigned</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
      
      const assignedCount = generatedAssignments.filter(a => {
         const shift = shifts.find(s => s.id === a.shiftId);
         return shift && shift.date.startsWith(targetMonthStr) && a.volunteerId === vol.id;
      }).length;

      const percentage = capacity > 0 ? (assignedCount / capacity) * 100 : 0;
      
      return {
        ...vol,
        capacity,
        assignedCount,
        percentage
      };
    }).sort((a, b) => b.percentage - a.percentage);

    return (
      <div className="animate-fade-in">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Volunteer Utilization ({targetMonthStr})</h2>
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
                <tr key={vol.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{vol.name}</td>
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
                          <div className="font-medium text-slate-900">{vol.name}</div>
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
                
                {scheduleResultView === 'calendar' ? <CalendarView /> : <StatsView />}
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
                        <p className="text-sm font-medium text-slate-900">{requestingVolunteer.name}</p>
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
                        <div>
                          <h3 className="font-semibold text-slate-900">{user.email}</h3>
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
                        onClick={() => handleApproveAsVolunteer(user.user_id, user.email)}
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
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 relative max-h-[90vh] overflow-y-auto">
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
                            <div key={idx} className="flex items-center justify-between p-2 bg-indigo-50 rounded-lg border border-indigo-200">
                               <div className="flex items-center gap-2">
                                 <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-xs">
                                   {vol.name.charAt(0)}
                                 </div>
                                 <div>
                                   <div className="font-medium text-slate-900 text-sm">{vol.name}</div>
                                   <div className="text-xs text-slate-500">
                                     {vol.skillLevel === 3 ? 'Expert' : vol.skillLevel === 2 ? 'Mid' : 'Entry'}
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

                     const availableVolunteers = volunteers
                       .filter(v => v.availabilityStatus === 'Active')
                       .filter(v => canVolunteerWorkShift(v, selectedShiftForDetails)) // Only show volunteers who can work this shift
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
                         <div key={vol.id} className={`flex items-center justify-between p-2 rounded-lg border transition-colors ${
                           vol.isAlreadyAssigned
                             ? 'bg-indigo-50 border-indigo-200'
                             : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                         }`}>
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
              onClick={() => setEditingVolunteer(null)}
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                  <select 
                    value={editingVolunteer.role}
                    onChange={(e) => setEditingVolunteer({...editingVolunteer, role: e.target.value})}
                    className="w-full p-2 border border-slate-200 rounded-lg outline-none"
                  >
                    <option value="EXPERIENCED">Experienced</option>
                    <option value="NOVICE">Novice</option>
                  </select>
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

            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setEditingVolunteer(null)}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Schedule Name</label>
                <input
                  type="text"
                  className="w-full p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={scheduleNameInput}
                  onChange={(e) => setScheduleNameInput(e.target.value)}
                  placeholder={`Schedule for ${targetMonth}/${targetYear}`}
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
              >
                Save Schedule
              </button>
            </div>
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