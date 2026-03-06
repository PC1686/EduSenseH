// [HACKATHON TIMELINE] STEP 2 (Hour 3) - Backend Connection (Supabase Lib)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a mock supabase client for development when env vars are missing
const createMockSupabase = () => ({
  auth: {
    getSession: () => Promise.resolve({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
    signInWithPassword: () => Promise.reject(new Error('Supabase not configured')),
    signUp: () => Promise.reject(new Error('Supabase not configured')),
    signOut: () => Promise.resolve(),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null })
      })
    })
  }),
  channel: () => ({
    on: () => ({ send: () => { }, subscribe: () => ({ data: { subscription: { unsubscribe: () => { } } } }) }),
    subscribe: () => ({ data: { subscription: { unsubscribe: () => { } } } })
  })
});

let supabase;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Running in demo mode. Add them to your .env file for full functionality.',
  );
  supabase = createMockSupabase();
} else {
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    realtime: {
      params: {
         eventsPerSecond: 10,
      },
    },
  });

  console.log('[Supabase] Real-time client initialized with URL:', supabaseUrl);
}

export { supabase };