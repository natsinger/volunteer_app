import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session to localStorage (default, but explicitly set for clarity)
    storage: window.localStorage,
    // Automatically refresh the session when it expires
    autoRefreshToken: true,
    // Persist the session across browser sessions
    persistSession: true,
    // Detect session changes in other browser tabs
    detectSessionInUrl: true,
  },
});
