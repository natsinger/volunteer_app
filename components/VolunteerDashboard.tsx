import React, { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, Check, Plus, Trash2, X, RefreshCw } from 'lucide-react';
import { Volunteer, Shift, ShiftAssignment } from '../types';
import { getVolunteerAssignments } from '../services/shiftAssignmentService';

interface VolunteerDashboardProps {
  currentUser: Volunteer;
  shifts: Shift[];
  updateVolunteer: (v: Volunteer) => void;
}

const DAYS = [
  { id: '0', label: 'Sunday' },
  { id: '1', label: 'Monday' },
  { id: '2', label: 'Tuesday' },
  { id: '3', label: 'Wednesday' },
  { id: '4', label: 'Thursday' },
  { id: '5', label: 'Friday' },
  { id: '6', label: 'Saturday' },
];

const VolunteerDashboard: React.FC<VolunteerDashboardProps> = ({ currentUser, shifts, updateVolunteer }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Volunteer>(currentUser);
  const [newBlackoutDate, setNewBlackoutDate] = useState('');
  const [myAssignments, setMyAssignments] = useState<ShiftAssignment[]>([]);
  const [isLoadingAssignments, setIsLoadingAssignments] = useState(false);

  // Load volunteer's assignments from database
  useEffect(() => {
    loadMyAssignments();
  }, [currentUser.id]);

  const loadMyAssignments = async () => {
    setIsLoadingAssignments(true);
    try {
      const assignments = await getVolunteerAssignments(currentUser.id);
      setMyAssignments(assignments);
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setIsLoadingAssignments(false);
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

  // Get my shifts by matching assignments with shift data
  const myShiftIds = new Set(myAssignments.map(a => a.shiftId));
  const myShifts = shifts
    .filter(s => myShiftIds.has(s.id) && isShiftUpcoming(s.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Show open shifts that the volunteer could potentially work
  const openShifts = shifts
    .filter(s => s.status === 'Open' && isShiftUpcoming(s.date) && !myShiftIds.has(s.id))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5); // Limit to 5 open shifts

  const handleSave = () => {
    updateVolunteer(editForm);
    setIsEditing(false);
  };

  const toggleDay = (dayId: string) => {
    const current = editForm.preferredDays || [];
    // Simple logic: If any version of the day (e.g., "2" or "2_evening") exists, remove it.
    // If not, add just the simple dayId.
    const exists = current.some(d => d.startsWith(dayId));
    
    let updated;
    if (exists) {
      updated = current.filter(d => !d.startsWith(dayId));
    } else {
      updated = [...current, dayId];
    }
    setEditForm({ ...editForm, preferredDays: updated });
  };

  const addBlackoutDate = () => {
    if (!newBlackoutDate) return;
    if (!editForm.blackoutDates.includes(newBlackoutDate)) {
      setEditForm({ 
        ...editForm, 
        blackoutDates: [...editForm.blackoutDates, newBlackoutDate] 
      });
    }
    setNewBlackoutDate('');
  };

  const removeBlackoutDate = (date: string) => {
    setEditForm({
      ...editForm,
      blackoutDates: editForm.blackoutDates.filter(d => d !== date)
    });
  };

  const isDaySelected = (dayId: string) => {
    return editForm.preferredDays?.some(d => d.startsWith(dayId));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-12 relative">
      <div className="max-w-5xl mx-auto">
        
        {/* Profile Header */}
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xl font-bold">
              {currentUser.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Welcome, {currentUser.name}!</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-slate-500">{currentUser.email}</span>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span className="text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
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
            className="text-indigo-600 font-medium hover:bg-indigo-50 px-4 py-2 rounded-lg transition-colors border border-indigo-200"
          >
            Edit Profile & Availability
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* My Upcoming Shifts */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="text-indigo-600" /> My Upcoming Shifts (Next 30 Days)
              </h2>
              <button
                onClick={loadMyAssignments}
                disabled={isLoadingAssignments}
                className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors"
                title="Refresh shifts"
              >
                <RefreshCw size={18} className={isLoadingAssignments ? 'animate-spin' : ''} />
              </button>
            </div>

            {isLoadingAssignments ? (
              <div className="bg-white p-10 rounded-xl border border-slate-200 text-center text-slate-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                Loading your shifts...
              </div>
            ) : myShifts.length === 0 ? (
              <div className="bg-white p-10 rounded-xl border border-dashed border-slate-300 text-center text-slate-500">
                You have no shifts assigned for the next 30 days. Contact the coordinator if you think this is an error.
              </div>
            ) : (
              <div className="space-y-4">
                {myShifts.map(shift => (
                  <div key={shift.id} className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-indigo-500 flex justify-between items-center hover:shadow-md transition-shadow">
                    <div>
                      <h3 className="font-bold text-lg text-slate-900">{shift.title}</h3>
                      <div className="flex items-center gap-4 mt-2 text-slate-600">
                        <span className="flex items-center gap-1.5 text-sm"><Calendar size={16}/> {shift.date}</span>
                        <span className="flex items-center gap-1.5 text-sm"><Clock size={16}/> {shift.startTime} - {shift.endTime}</span>
                        {shift.location && <span className="flex items-center gap-1.5 text-sm"><MapPin size={16}/> {shift.location}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                       <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full">
                         CONFIRMED
                       </span>
                    </div>
                  </div>
                ))}
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
                <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                  <span className="text-slate-500">Hours This Month</span>
                  <span className="font-bold text-slate-900">24</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Reliability Score</span>
                  <span className="font-bold text-emerald-600">98%</span>
                </div>
              </div>
            </div>

            <div className="bg-indigo-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold text-lg mb-2">Refer a Friend</h3>
                <p className="text-indigo-200 text-sm mb-4">Know someone who loves to help? Invite them to join our team!</p>
                <button className="bg-white text-indigo-900 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors">
                  Invite Now
                </button>
              </div>
              <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-indigo-700 rounded-full opacity-50 blur-xl"></div>
              <div className="absolute bottom-0 left-0 -mb-4 -ml-4 w-20 h-20 bg-pink-600 rounded-full opacity-20 blur-xl"></div>
            </div>
          </div>

        </div>
      </div>

      {/* Edit Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 relative animate-fade-in max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setIsEditing(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X size={20} />
            </button>
            
            <h2 className="text-xl font-bold text-slate-900 mb-6">Edit Availability & Preferences</h2>

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
              <div className="flex gap-2 mb-3">
                <input
                  type="date"
                  className="flex-1 p-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={newBlackoutDate}
                  onChange={(e) => setNewBlackoutDate(e.target.value)}
                />
                <button 
                  onClick={addBlackoutDate}
                  disabled={!newBlackoutDate}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 rounded-lg disabled:opacity-50"
                >
                  <Plus size={20} />
                </button>
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
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
              >
                Save Changes
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default VolunteerDashboard;