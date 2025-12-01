import React, { useState, useEffect } from 'react';
import { Volunteer, Shift } from './types';
import AdminDashboard from './components/AdminDashboard';
import VolunteerDashboard from './components/VolunteerDashboard';
import LoginForm from './components/LoginForm';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import { mapVolunteerFromDB, mapShiftFromDB, mapVolunteerToDB, mapShiftToDB } from './lib/mappers';
import { LogOut } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, userRole, volunteerData, loading, signOut } = useAuth();
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Load data from Supabase when user is authenticated
  useEffect(() => {
    if (user && userRole) {
      loadData();
    } else {
      setDataLoading(false);
    }
  }, [user, userRole]);

  const loadData = async () => {
    try {
      // Load volunteers (only admins can see all volunteers)
      if (userRole === 'admin') {
        const { data: volunteersData, error: volunteersError } = await supabase
          .from('volunteers')
          .select('*')
          .order('serial_number', { ascending: true });

        if (volunteersError) throw volunteersError;
        setVolunteers((volunteersData || []).map(mapVolunteerFromDB));
      }

      // Load shifts
      const { data: shiftsData, error: shiftsError } = await supabase
        .from('shifts')
        .select('*')
        .order('date', { ascending: true });

      if (shiftsError) throw shiftsError;
      setShifts((shiftsData || []).map(mapShiftFromDB));

      setDataLoading(false);
    } catch (error) {
      console.error('Error loading data:', error);
      setDataLoading(false);
    }
  };

  if (loading || (user && dataLoading)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || !userRole) {
    return <LoginForm />;
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
            Logged in as {userRole === 'admin' ? 'Administrator' : volunteerData?.name}
          </span>
          <button
            onClick={signOut}
            className="flex items-center gap-2 text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <LogOut size={16} /> Logout
          </button>
        </div>
      </nav>

      {/* Main Role Content */}
      <div className="flex-1 overflow-hidden relative">
        {userRole === 'admin' && (
          <AdminDashboard
            volunteers={volunteers}
            shifts={shifts}
            setVolunteers={setVolunteers}
            setShifts={setShifts}
          />
        )}
        {userRole === 'volunteer' && volunteerData && (
          <VolunteerDashboard
            currentUser={volunteerData}
            shifts={shifts}
            updateVolunteer={async (updatedVolunteer) => {
              // Update in Supabase
              const dbVolunteer = mapVolunteerToDB(updatedVolunteer);
              const { error } = await supabase
                .from('volunteers')
                .update(dbVolunteer)
                .eq('id', updatedVolunteer.id);

              if (!error) {
                // Reload data to get fresh state
                loadData();
              }
            }}
          />
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;