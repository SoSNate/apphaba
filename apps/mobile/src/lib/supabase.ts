import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false, // no OAuth redirect on mobile
      storage: {
        getItem: (key) => Promise.resolve(localStorage.getItem(key)),
        setItem: (key, value) => { localStorage.setItem(key, value); return Promise.resolve() },
        removeItem: (key) => { localStorage.removeItem(key); return Promise.resolve() },
      },
    },
  }
)
