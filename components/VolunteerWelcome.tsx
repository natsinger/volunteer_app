import React, { useState, useEffect } from 'react';
import { CheckCircle, User, Mail, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { mapVolunteerFromDB } from '../lib/mappers';
import { Volunteer } from '../types';

interface VolunteerWelcomeProps {
  onComplete: (volunteer: Volunteer) => void;
}

const VolunteerWelcome: React.FC<VolunteerWelcomeProps> = ({ onComplete }) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [existingVolunteer, setExistingVolunteer] = useState<Volunteer | null>(null);
  const [profileComplete, setProfileComplete] = useState(false);

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    checkExistingProfile();
  }, [user]);

  const checkExistingProfile = async () => {
    if (!user) return;

    try {
      // Check if volunteer record already exists for this user
      const { data: volunteerData, error: volunteerError } = await supabase
        .from('volunteers')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (volunteerData && !volunteerError) {
        const volunteer = mapVolunteerFromDB(volunteerData);
        setExistingVolunteer(volunteer);

        // Pre-fill form with existing data
        setName(volunteer.name || '');
        setEmail(volunteer.email || '');
        setPhone(volunteer.phone || '');

        // Check if profile is complete
        if (volunteer.name && volunteer.email && volunteer.phone) {
          setProfileComplete(true);
        }
      } else {
        // Check if volunteer record exists without user_id (needs linking)
        const { data: unmatchedVolunteer, error: unmatchedError } = await supabase
          .from('volunteers')
          .select('*')
          .eq('email', user.email!)
          .is('user_id', null)
          .single();

        if (unmatchedVolunteer && !unmatchedError) {
          // Found volunteer record with matching email - link it
          const { error: updateError } = await supabase
            .from('volunteers')
            .update({ user_id: user.id })
            .eq('id', unmatchedVolunteer.id);

          if (!updateError) {
            const volunteer = mapVolunteerFromDB({ ...unmatchedVolunteer, user_id: user.id });
            setExistingVolunteer(volunteer);
            setName(volunteer.name || '');
            setEmail(volunteer.email || '');
            setPhone(volunteer.phone || '');

            if (volunteer.name && volunteer.email && volunteer.phone) {
              setProfileComplete(true);
            }
          }
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Error checking profile:', error);
      setError('Failed to load your profile. Please try again.');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!user) {
        throw new Error('No user found');
      }

      if (existingVolunteer) {
        // Update existing volunteer record
        const { data, error: updateError } = await supabase
          .from('volunteers')
          .update({
            name,
            email,
            phone,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingVolunteer.id)
          .select()
          .single();

        if (updateError) throw updateError;

        const updatedVolunteer = mapVolunteerFromDB(data);
        onComplete(updatedVolunteer);
      } else {
        // This shouldn't happen as admin should create the volunteer first
        setError('No volunteer record found. Please contact the administrator.');
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setError(error.message || 'Failed to update profile. Please try again.');
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (existingVolunteer) {
      onComplete(existingVolunteer);
    }
  };

  if (loading && !existingVolunteer) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (profileComplete && !error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-emerald-600 p-8 text-center">
            <CheckCircle size={64} className="text-white mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-white mb-2">Welcome Back!</h1>
            <p className="text-emerald-100">Your profile is complete</p>
          </div>
          <div className="p-8 text-center">
            <p className="text-slate-600 mb-6">
              Great! Your profile is all set up. Click below to access your volunteer dashboard.
            </p>
            <button
              onClick={handleSkip}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-emerald-600 p-8 text-center">
          <User size={48} className="text-white mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Welcome to VolunteerFlow!</h1>
          <p className="text-emerald-100">Let's complete your profile</p>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-700 mb-2">
                <div className="flex items-center gap-2">
                  <User size={16} />
                  Full Name
                </div>
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="Enter your full name"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                <div className="flex items-center gap-2">
                  <Mail size={16} />
                  Email Address
                </div>
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="your@email.com"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700 mb-2">
                <div className="flex items-center gap-2">
                  <Phone size={16} />
                  Phone Number
                </div>
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                placeholder="(555) 123-4567"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle size={20} />
                  Complete Profile
                </>
              )}
            </button>

            {existingVolunteer && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={loading}
                className="w-full text-slate-600 hover:text-slate-800 py-2 font-medium transition-colors disabled:opacity-50"
              >
                Skip for now
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};

export default VolunteerWelcome;
