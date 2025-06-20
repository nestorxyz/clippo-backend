// Ensure environment variables are loaded
import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { Database } from '../types/supabase';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing environment variables:');
  console.error('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
  console.error(
    'SUPABASE_SERVICE_ROLE_KEY:',
    process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING'
  );
  console.error(
    'SUPABASE_ANON_KEY:',
    process.env.SUPABASE_ANON_KEY ? 'SET' : 'MISSING'
  );
  throw new Error('Missing Supabase environment variables');
}

// Admin client with service role key for server-side operations
export const supabaseAdmin = createClient<Database>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Regular client for public operations
export const supabase = createClient<Database>(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY!
);
