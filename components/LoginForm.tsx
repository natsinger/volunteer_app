import React, { useState } from 'react';
import { ShieldCheck, User, LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type LoginType = 'admin' | 'volunteer' | null;

const LoginForm: React.FC = () => {
  const [loginType, setLoginType] = useState<LoginType>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn(email, password);

    if (result.error) {
      setError(result.error);
      setLoading(false);
    }
    // If successful, the auth state will update automatically
  };

  const handleBack = () => {
    setLoginType(null);
    setEmail('');
    setPassword('');
    setError('');
  };

  if (!loginType) {
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
              onClick={() => setLoginType('admin')}
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
              onClick={() => setLoginType('volunteer')}
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
              Version 2.0
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className={`${loginType === 'admin' ? 'bg-indigo-600' : 'bg-emerald-600'} p-8 text-center`}>
          <div className="flex items-center justify-center mb-4">
            {loginType === 'admin' ? (
              <ShieldCheck size={48} className="text-white" />
            ) : (
              <User size={48} className="text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {loginType === 'admin' ? 'Admin Portal' : 'Volunteer Portal'}
          </h1>
          <p className={`${loginType === 'admin' ? 'text-indigo-100' : 'text-emerald-100'}`}>
            Sign in to continue
          </p>
        </div>

        <div className="p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder={loginType === 'admin' ? 'admin@example.com' : 'volunteer@example.com'}
                required
                disabled={loading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                placeholder="Enter your password"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full ${
                loginType === 'admin'
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
              } text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={20} />
                  Sign In
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              className="w-full text-slate-600 hover:text-slate-800 py-2 font-medium transition-colors disabled:opacity-50"
            >
              Back to Portal Selection
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
