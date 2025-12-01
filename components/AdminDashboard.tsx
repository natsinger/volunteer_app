import React, { useState, useEffect } from 'react';
import {
  Users, Calendar, Sparkles, Plus, Trash2, Edit2,
  Search, CheckCircle, Clock, Upload, RefreshCw, BarChart3, ChevronLeft, ChevronRight, X, AlertTriangle, MapPin, User
} from 'lucide-react';
import { Volunteer, Shift, RecurringShift, DeletedShiftOccurrence } from '../types';
import { generateScheduleAI, getMonthlyCapacity } from '../services/geminiService';
import BulkUploadModal from './BulkUploadModal';
import { supabase } from '../lib/supabase';
import { mapVolunteerToDB, mapVolunteerFromDB, mapShiftToDB, mapShiftFromDB, mapRecurringShiftFromDB, mapRecurringShiftToDB, mapDeletedOccurrenceFromDB } from '../lib/mappers';
import { generateShiftInstances, mergeShifts, getMonthRange, getDayName } from '../lib/recurringShiftUtils';
import { generateShiftsForNextMonths } from '../lib/shiftGenerator';

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
  const [activeTab, setActiveTab] = useState<'volunteers' | 'shifts' | 'auto'>('volunteers');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [scheduleResultView, setScheduleResultView] = useState<'none' | 'calendar' | 'stats'>('none');

  // Volunteer Management State
  const [searchTerm, setSearchTerm] = useState('');
  const [editingVolunteer, setEditingVolunteer] = useState<Volunteer | null>(null);

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

  // Auto-Scheduler State: Default to Next Month
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const [targetMonth, setTargetMonth] = useState<number>(nextMonth.getMonth() + 1); // 1-12
  const [targetYear, setTargetYear] = useState<number>(nextMonth.getFullYear());

  // Load recurring shifts and deleted occurrences on mount
  useEffect(() => {
    loadRecurringShifts();
    loadDeletedOccurrences();
  }, []);

  // Generate displayed shifts whenever data changes
  useEffect(() => {
    const { start, end } = getMonthRange(targetYear, targetMonth - 1);
    const generatedShifts = generateShiftInstances(recurringShifts, deletedOccurrences, start, end);
    const merged = mergeShifts(generatedShifts, shifts);
    setDisplayedShifts(merged);
  }, [recurringShifts, deletedOccurrences, shifts, targetMonth, targetYear]);

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

  const handleGenerateSchedule = async () => {
    setIsGenerating(true);
    try {
      const result = await generateScheduleAI(volunteers, shifts, targetMonth, targetYear);
      
      if (result && result.length > 0) {
        setGeneratedAssignments(result);
        setScheduleResultView('calendar');
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

  // We need a place to store the assignments since the Shift type is 1-to-1
  const [generatedAssignments, setGeneratedAssignments] = useState<{shiftId: string, volunteerId: string}[]>([]);

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

  const filteredVolunteers = volunteers.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-slate-900">{monthName} Schedule</h2>
          <div className="flex gap-4 text-sm bg-white px-4 py-2 rounded-lg border border-slate-200">
             <div className="flex items-center gap-2">
               <span className="w-3 h-3 rounded-full bg-orange-100 border border-orange-500"></span> Dizengoff
             </div>
             <div className="flex items-center gap-2">
               <span className="w-3 h-3 rounded-full bg-blue-100 border border-blue-500"></span> Hatachana
             </div>
             <div className="w-px h-4 bg-slate-300 mx-2"></div>
             <div className="flex items-center gap-2">
               <span className="w-3 h-3 rounded-full border-2 border-red-500"></span> Understaffed (&lt;2)
             </div>
             <div className="flex items-center gap-2">
               <span className="w-3 h-3 rounded-full border-2 border-emerald-500"></span> Healthy (3+)
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
                      const isDizengoff = s.title.toUpperCase().includes('DIZENGOFF') || s.id.toLowerCase().includes('dizengoff');
                      
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

                      return (
                        <div 
                          key={s.id} 
                          onClick={() => setSelectedShiftForDetails(s)}
                          className={`
                            cursor-pointer group relative pl-2 pr-1 py-1.5 rounded-r border-l-4 text-xs shadow-sm hover:shadow-md transition-all
                            ${isDizengoff ? 'bg-orange-50' : 'bg-blue-50'}
                            ${borderClass}
                          `}
                        >
                          <div className="flex justify-between items-center mb-1">
                             <span className={`font-bold ${isDizengoff ? 'text-orange-900' : 'text-blue-900'}`}>
                               {s.startTime.slice(0, 5)}
                             </span>
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
      <header className="bg-white border-b border-slate-200 px-8 py-6 flex justify-between items-center sticky top-0 z-10">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your team and organize upcoming events</p>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={() => setActiveTab('volunteers')}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'volunteers' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Users size={18} /> Volunteers
          </button>
          <button 
            onClick={() => setActiveTab('shifts')}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'shifts' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Calendar size={18} /> Shifts
          </button>
          <button 
            onClick={() => setActiveTab('auto')}
            className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${activeTab === 'auto' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Sparkles size={18} /> Auto-Schedule
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        
        {/* Volunteers Tab */}
        {activeTab === 'volunteers' && (
          <div className="max-w-7xl mx-auto animate-fade-in">
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
              <button 
                onClick={() => setShowBulkUpload(true)}
                className="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors"
              >
                <Upload size={18} /> Bulk Import
              </button>
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
                        <div className="font-medium text-slate-900">{vol.name}</div>
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
                  <button 
                    onClick={() => {
                       setScheduleResultView('none');
                       setGeneratedAssignments([]); // Clear assignments on reset?
                    }}
                    className="text-sm text-slate-500 hover:text-red-500 flex items-center gap-1"
                  >
                    Reset View
                  </button>
                </div>
                
                {scheduleResultView === 'calendar' ? <CalendarView /> : <StatsView />}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Shift Details Modal (For Calendar Click) */}
      {selectedShiftForDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 relative">
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
               </div>
            </div>

            <div className="mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Assigned Volunteers</h3>
              <div className="space-y-2">
                 {generatedAssignments.filter(a => a.shiftId === selectedShiftForDetails.id).length > 0 ? (
                    generatedAssignments
                      .filter(a => a.shiftId === selectedShiftForDetails.id)
                      .map((assignment, idx) => {
                        const vol = volunteers.find(v => v.id === assignment.volunteerId);
                        if (!vol) return null;
                        return (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                             <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm">
                                 {vol.name.charAt(0)}
                               </div>
                               <div>
                                 <div className="font-medium text-slate-900">{vol.name}</div>
                                 <div className="text-xs text-slate-500">{vol.role} • {vol.phone}</div>
                               </div>
                             </div>
                             <div className="text-xs text-slate-400 bg-white px-2 py-1 rounded border border-slate-200">
                               {vol.skillLevel === 3 ? 'Expert' : vol.skillLevel === 2 ? 'Mid' : 'Entry'}
                             </div>
                          </div>
                        );
                      })
                 ) : (
                   <div className="text-center py-6 text-slate-400 italic bg-slate-50 rounded-lg">
                     No volunteers assigned to this shift yet.
                   </div>
                 )}
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
    </div>
  );
};

export default AdminDashboard;