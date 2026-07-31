// Month-grid calendar for the admin auto-schedule tab: shows each day's shifts with
// assignee lists and staffing status, plus published events.
// Hoisted out of AdminDashboard so it has a stable component identity across renders —
// do NOT move it back inside another component's render body (inputs lose focus on re-render).
import React from 'react';
import { Volunteer, Shift, Event } from '../../types';

interface CalendarViewProps {
  targetYear: number;
  targetMonth: number; // 1-12
  shifts: Shift[];
  events: Event[];
  volunteers: Volunteer[];
  generatedAssignments: { shiftId: string; volunteerId: string }[];
  onSelectShift: (shift: Shift) => void;
  onSelectEvent: (event: Event) => void;
}

const CalendarView: React.FC<CalendarViewProps> = ({
  targetYear, targetMonth, shifts, events, volunteers, generatedAssignments, onSelectShift, onSelectEvent
}) => {
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
                        onClick={() => onSelectShift(s)}
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
                      onClick={() => onSelectEvent(event)}
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

export default CalendarView;
