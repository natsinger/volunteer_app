import React from 'react';
import { Clock, Mail, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const ApprovalPending: React.FC = () => {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-amber-500 p-8 text-center">
          <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={40} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Approval Pending</h1>
          <p className="text-amber-50">Your account is awaiting administrator approval</p>
        </div>

        <div className="p-8">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-6">
            <div className="flex items-start gap-3">
              <Mail size={24} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold mb-2">What happens next?</p>
                <ul className="space-y-2 ml-4 list-disc">
                  <li>Your account has been created successfully</li>
                  <li>An administrator will review and approve your account</li>
                  <li>You'll receive an email once your account is activated</li>
                  <li>After approval, you can log in and access your dashboard</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-5 mb-6">
            <p className="text-sm text-slate-600 mb-2">
              <strong>Signed in as:</strong>
            </p>
            <p className="text-slate-900 font-medium">{user?.email}</p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-900">
              <strong>Need help?</strong> Contact the administrator at{' '}
              <a href="mailto:info@pnimet.org.il" className="text-blue-600 hover:underline">
                info@pnimet.org.il
              </a>
            </p>
          </div>

          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 text-white py-3 rounded-lg font-semibold transition-colors"
          >
            <LogOut size={20} />
            Sign Out
          </button>

          <div className="mt-6 text-center text-xs text-slate-400">
            This usually takes 24-48 hours
          </div>
        </div>
      </div>
    </div>
  );
};

export default ApprovalPending;
