import React, { useState } from 'react';
import { LogIn, AlertCircle, UserPlus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

const LoginForm: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState('');
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [signUpSuccess, setSignUpSuccess] = useState(false);
  const { signIn, resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isSignUpMode) {
      // Handle sign-up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
        }
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      } else if (data.user) {
        // Add to pending_users table
        const { error: pendingError } = await supabase.from('pending_users').insert({
          user_id: data.user.id,
          email: data.user.email,
          provider: 'email',
        });

        if (pendingError) {
          console.error('Error adding to pending_users:', pendingError);
          // Still show success - the AuthContext will handle adding to pending_users on login
        }

        setSignUpSuccess(true);
        setLoading(false);
      }
    } else {
      // Handle sign-in
      const result = await signIn(email, password);

      if (result.error) {
        setError(result.error);
        setLoading(false);
      }
      // If successful, the auth state will update automatically
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        }
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      }
      // User will be redirected to Google, then back to the app
    } catch (err) {
      setError('Failed to sign in with Google');
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess(false);
    setLoading(true);

    const result = await resetPassword(resetEmail);

    if (result.error) {
      setResetError(result.error);
      setLoading(false);
    } else {
      setResetSuccess(true);
      setLoading(false);
    }
  };

  const handleCloseForgotPassword = () => {
    setShowForgotPassword(false);
    setResetEmail('');
    setResetSuccess(false);
    setResetError('');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-indigo-600 p-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-indigo-600 text-2xl font-bold">
              V
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">VolunteerFlow</h1>
          <p className="text-indigo-100">{isSignUpMode ? 'Create an account' : 'Sign in to continue'}</p>
        </div>

        <div className="p-8">
          {signUpSuccess ? (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="text-sm text-emerald-800">
                    <p className="font-medium mb-1">Account created successfully!</p>
                    <p>Please check your email to verify your account. After verification, an administrator will approve your access.</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setSignUpSuccess(false);
                  setIsSignUpMode(false);
                  setEmail('');
                  setPassword('');
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold transition-colors"
              >
                Go to Sign In
              </button>
            </div>
          ) : (
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
                placeholder="your@email.com"
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
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {isSignUpMode ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                <>
                  {isSignUpMode ? <UserPlus size={20} /> : <LogIn size={20} />}
                  {isSignUpMode ? 'Create Account' : 'Sign In'}
                </>
              )}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">OR</span>
              </div>
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 py-3 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              {isSignUpMode ? 'Sign up with Google' : 'Sign in with Google'}
            </button>

            {!isSignUpMode && (
              <button
                type="button"
                onClick={() => {
                  setShowForgotPassword(true);
                  setResetEmail(email);
                }}
                disabled={loading}
                className="w-full text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:opacity-50"
              >
                Forgot Password?
              </button>
            )}

            <div className="mt-4 pt-4 border-t border-slate-200 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUpMode(!isSignUpMode);
                  setError('');
                }}
                disabled={loading}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors disabled:opacity-50"
              >
                {isSignUpMode ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </form>
          )}

          <div className="mt-6 pt-6 border-t border-slate-200 text-center text-xs text-slate-400">
            Version 2.0 • Your role will be determined automatically
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
            <div className="bg-indigo-600 p-6 text-center">
              <h2 className="text-xl font-bold text-white">Reset Password</h2>
              <p className="text-indigo-100 text-sm mt-1">
                We'll send you a password reset link
              </p>
            </div>

            <div className="p-6">
              {resetSuccess ? (
                <div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-emerald-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <div className="text-sm text-emerald-800">
                        <p className="font-medium mb-1">Check your email!</p>
                        <p>We've sent a password reset link to {resetEmail}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={handleCloseForgotPassword}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-semibold transition-colors"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {resetError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                      <AlertCircle size={20} className="text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm text-red-800">{resetError}</div>
                    </div>
                  )}

                  <div>
                    <label htmlFor="reset-email" className="block text-sm font-medium text-slate-700 mb-2">
                      Email Address
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Enter your email"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleCloseForgotPassword}
                      disabled={loading}
                      className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {loading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          Sending...
                        </>
                      ) : (
                        'Send Reset Link'
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginForm;
