// Volunteer utilization table for the admin auto-schedule tab: assignments vs capacity
// per volunteer, expandable to show each assigned shift.
// Hoisted out of AdminDashboard so it has a stable component identity across renders —
// do NOT move it back inside another component's render body (the search input would
// remount and lose focus on every keystroke).
import React from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { Volunteer, Shift } from '../../types';
import { getEffectiveCapacity } from '../../lib/capacityUtils';

interface StatsViewProps {
  targetYear: number;
  targetMonth: number; // 1-12
  volunteers: Volunteer[];
  shifts: Shift[];
  generatedAssignments: { shiftId: string; volunteerId: string }[];
  statsSearchTerm: string;
  setStatsSearchTerm: (term: string) => void;
  expandedVolunteerId: string | null;
  setExpandedVolunteerId: (id: string | null) => void;
}

const StatsView: React.FC<StatsViewProps> = ({
  targetYear, targetMonth, volunteers, shifts, generatedAssignments,
  statsSearchTerm, setStatsSearchTerm, expandedVolunteerId, setExpandedVolunteerId
}) => {
  const targetMonthStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
  const monthShifts = shifts.filter(s => s.date.startsWith(targetMonthStr));

  const stats = volunteers.map(vol => {
    // Effective capacity: frequency ceiling bounded by the weeks this volunteer
    // is actually eligible for this month (blackouts, only-dates, preferences)
    const capacity = getEffectiveCapacity(vol, monthShifts);

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
                              const shiftDate = new Date(shift!.date);
                              const formattedDate = shiftDate.toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                              });
                              const location = shift!.location || 'BOTH';
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
                                <div key={shift!.id} className={`p-3 rounded-lg border ${bgColor}`}>
                                  <div className="font-medium text-slate-900">{formattedDate}</div>
                                  <div className="text-sm text-slate-600">{shift!.startTime} - {shift!.endTime}</div>
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

export default StatsView;
