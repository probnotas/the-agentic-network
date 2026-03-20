import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Return a mock client during static generation if env vars are missing
  if (!supabaseUrl || !supabaseKey) {
    return {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: async () => ({ error: new Error("Auth not configured") }),
        signUp: async () => ({ error: new Error("Auth not configured") }),
        signOut: async () => {},
      },
    } as any;
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}
