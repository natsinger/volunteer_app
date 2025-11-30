import React, { useState } from 'react';
import { UserRole, Volunteer, Shift } from './types';
import { MOCK_VOLUNTEERS, MOCK_SHIFTS } from './constants';
import AdminDashboard from './components/AdminDashboard';
import VolunteerDashboard from './components/VolunteerDashboard';
import { ShieldCheck, User, LogOut } from 'lucide-react';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole | null>(null);
  
  // Global State (Mock Database)
  const [volunteers, setVolunteers] = useState<Volunteer[]>(MOCK_VOLUNTEERS);
  const [shifts, setShifts] = useState<Shift[]>(MOCK_SHIFTS);
  
  // Mock current user login for volunteer view
  const [currentVolunteer, setCurrentVolunteer] = useState<Volunteer | null>(null);

  const handleLogin = (selectedRole: UserRole) => {
    setRole(selectedRole);
    if (selectedRole === UserRole.VOLUNTEER) {
      setCurrentVolunteer(volunteers[0]); // Auto-login as Alice for demo
    }
  };

  const handleLogout = () => {
    setRole(null);
    setCurrentVolunteer(null);
  };

  if (!role) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-indigo-600 p-8 text-center">
            <h1 className="text-3xl font-bold text-white mb-2">VolunteerFlow</h1>
            <p className="text-indigo-100">Intelligent Management System</p>
          </div>
          <div className="p-8 space-y-4">
            <p className="text-center text-slate-500 mb-6">Select your portal to continue</p>
            
            <button 
              onClick={() => handleLogin(UserRole.ADMIN)}
              className="w-full flex items-center p-4 border border-slate-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
            >
              <div className="bg-indigo-100 p-3 rounded-full text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <ShieldCheck size={24} />
              </div>
              <div className="ml-4 text-left">
                <h3 className="font-bold text-slate-900">Admin Portal</h3>
                <p className="text-sm text-slate-500">Manage volunteers & schedules</p>
              </div>
            </button>

            <button 
              onClick={() => handleLogin(UserRole.VOLUNTEER)}
              className="w-full flex items-center p-4 border border-slate-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
            >
              <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <User size={24} />
              </div>
              <div className="ml-4 text-left">
                <h3 className="font-bold text-slate-900">Volunteer Portal</h3>
                <p className="text-sm text-slate-500">View shifts & update profile</p>
              </div>
            </button>
            
            <div className="pt-6 text-center text-xs text-slate-400">
              Demo Version 1.0
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Navigation Bar */}
      <nav className="bg-slate-900 text-white px-6 py-3 flex justify-between items-center shadow-lg z-50">
        <div className="flex items-center gap-2 font-bold text-lg">
           <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center">V</div>
           VolunteerFlow
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400 hidden sm:block">
            Logged in as {role === UserRole.ADMIN ? 'Administrator' : currentVolunteer?.name}
          </span>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      {/* Main Role Content */}
      <div className="flex-1 overflow-hidden relative">
        {role === UserRole.ADMIN && (
          <AdminDashboard 
            volunteers={volunteers}
            shifts={shifts}
            setVolunteers={setVolunteers}
            setShifts={setShifts}
          />
        )}
        {role === UserRole.VOLUNTEER && currentVolunteer && (
          <VolunteerDashboard 
            currentUser={currentVolunteer}
            shifts={shifts}
            updateVolunteer={(v) => {
              setVolunteers(volunteers.map(old => old.id === v.id ? v : old));
              setCurrentVolunteer(v);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default App;