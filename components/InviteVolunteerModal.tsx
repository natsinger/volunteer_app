import React, { useState } from 'react';
import { Mail, X, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { Volunteer } from '../types';
import { supabase } from '../lib/supabase';

interface InviteVolunteerModalProps {
  volunteer: Volunteer;
  onClose: () => void;
  onInviteSent: () => void;
}

const InviteVolunteerModal: React.FC<InviteVolunteerModalProps> = ({
  volunteer,
  onClose,
  onInviteSent,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [inviteMethod, setInviteMethod] = useState<'supabase-dashboard' | 'edge-function'>('supabase-dashboard');

  const handleInviteViaEdgeFunction = async () => {
    setLoading(true);
    setError('');

    try {
      // Call Supabase Edge Function to send invite
      const { data, error: functionError } = await supabase.functions.invoke('invite-volunteer', {
        body: {
          email: volunteer.email,
          volunteerId: volunteer.id,
          volunteerName: volunteer.name,
        },
      });

      if (functionError) {
        throw functionError;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setSuccess(true);
      setTimeout(() => {
        onInviteSent();
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error sending invite:', err);
      setError(err.message || 'Failed to send invite. Please try the manual method below.');
    } finally {
      setLoading(false);
    }
  };

  const handleManualInvite = () => {
    // Copy instructions to clipboard
    const instructions = `
Manual Invite Instructions for ${volunteer.name}:

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Navigate to: Authentication → Users
3. Click "Invite User" button
4. Enter email: ${volunteer.email}
5. After invite is sent, run this SQL to link the account:

UPDATE volunteers
SET user_id = (
  SELECT id FROM auth.users WHERE email = '${volunteer.email}'
)
WHERE id = '${volunteer.id}';

This will link the auth account to the volunteer record.
`;

    navigator.clipboard.writeText(instructions);
    setSuccess(true);
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  if (success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
          <div className="bg-emerald-600 p-6 text-center">
            <CheckCircle size={48} className="text-white mx-auto mb-3" />
            <h2 className="text-xl font-bold text-white">
              {inviteMethod === 'edge-function' ? 'Invite Sent!' : 'Instructions Copied!'}
            </h2>
          </div>
          <div className="p-6 text-center">
            <p className="text-slate-600">
              {inviteMethod === 'edge-function'
                ? `An invitation email has been sent to ${volunteer.email}`
                : 'Manual invite instructions have been copied to your clipboard'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="bg-indigo-600 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-white bg-opacity-20 p-3 rounded-full">
                <Mail size={24} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Send Volunteer Invite</h2>
                <p className="text-indigo-100 text-sm">
                  Invite {volunteer.name} to the volunteer portal
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600 font-medium">Volunteer:</span>
                <span className="text-slate-900">{volunteer.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-medium">Email:</span>
                <span className="text-slate-900">{volunteer.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600 font-medium">Serial #:</span>
                <span className="text-slate-900">{volunteer.serialNumber || 'N/A'}</span>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold text-slate-900 mb-3">Choose Invite Method:</h3>

            {/* Edge Function Method */}
            <div className="space-y-3">
              <button
                onClick={() => setInviteMethod('edge-function')}
                className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                  inviteMethod === 'edge-function'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={inviteMethod === 'edge-function'}
                    onChange={() => setInviteMethod('edge-function')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">
                      Automated Invite (Recommended)
                    </h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Automatically creates auth account and sends invite email
                    </p>
                    <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-flex items-center gap-1">
                      <Info size={12} />
                      Requires Edge Function setup
                    </div>
                  </div>
                </div>
              </button>

              {/* Manual Method */}
              <button
                onClick={() => setInviteMethod('supabase-dashboard')}
                className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
                  inviteMethod === 'supabase-dashboard'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    checked={inviteMethod === 'supabase-dashboard'}
                    onChange={() => setInviteMethod('supabase-dashboard')}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold text-slate-900">Manual Invite via Dashboard</h4>
                    <p className="text-sm text-slate-600 mt-1">
                      Copy instructions to manually invite via Supabase Dashboard
                    </p>
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-blue-900">
                <p className="font-medium mb-1">What happens after invite?</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-800">
                  <li>Volunteer receives email with password setup link</li>
                  <li>They set their password</li>
                  <li>Volunteer is redirected to complete their profile</li>
                  <li>Once complete, they can access the volunteer portal</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={
                inviteMethod === 'edge-function'
                  ? handleInviteViaEdgeFunction
                  : handleManualInvite
              }
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail size={20} />
                  {inviteMethod === 'edge-function' ? 'Send Invite' : 'Copy Instructions'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InviteVolunteerModal;
