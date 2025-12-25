import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Volunteer } from '../types';
import { mapVolunteerFromDB } from '../lib/mappers';

interface AuthContextType {
  user: User | null;
  userRole: 'admin' | 'volunteer' | null;
  volunteerData: Volunteer | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string; success?: boolean }>;
  needsProfileCompletion: boolean;
  setNeedsProfileCompletion: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'volunteer' | null>(null);
  const [volunteerData, setVolunteerData] = useState<Volunteer | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        checkUserRole(session.user.id);
      } else {
        setUserRole(null);
        setVolunteerData(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId: string) => {
    try {
      // Check if user is an admin
      const { data: adminData, error: adminError } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (adminData && !adminError) {
        setUserRole('admin');
        setLoading(false);
        return;
      }

      // Check if user is a volunteer
      const { data: volunteerData, error: volunteerError } = await supabase
        .from('volunteers')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (volunteerData && !volunteerError) {
        setUserRole('volunteer');
        const volunteer = mapVolunteerFromDB(volunteerData);
        setVolunteerData(volunteer);

        // Check if profile needs completion
        const profileIncomplete = !volunteer.name || !volunteer.phone;
        setNeedsProfileCompletion(profileIncomplete);

        setLoading(false);
        return;
      }

      // User exists in auth but not in admin or volunteer tables
      console.error('User found in auth but not in admin or volunteer tables');

      // Add to pending_users table if not already there
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser?.user) {
        const provider = authUser.user.app_metadata?.provider || 'email';
        const { error: pendingError } = await supabase.from('pending_users').upsert({
          user_id: userId,
          email: authUser.user.email || '',
          provider: provider,
        }, {
          onConflict: 'user_id',
          ignoreDuplicates: false
        });

        if (pendingError) {
          console.error('Error adding user to pending_users:', pendingError);
        } else {
          console.log('User added to pending_users successfully');
        }
      }

      setUserRole(null);
      setLoading(false);
    } catch (error) {
      console.error('Error checking user role:', error);
      setUserRole(null);
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { error: error.message };
      }

      return {};
    } catch (error) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserRole(null);
    setVolunteerData(null);
    setNeedsProfileCompletion(false);
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}`,
      });

      if (error) {
        return { error: error.message };
      }

      return { success: true };
    } catch (error) {
      return { error: 'An unexpected error occurred' };
    }
  };

  const value = {
    user,
    userRole,
    volunteerData,
    loading,
    signIn,
    signOut,
    resetPassword,
    needsProfileCompletion,
    setNeedsProfileCompletion,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
