import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://jswjmlladshtwydmyqpv.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'sb_publishable_sAbJ4DJwHPK2mD36AArG5A_bcGWCkFW.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzd2ptbGxhZHNodHd5ZG15cXB2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzcxODcsImV4cCI6MjA4MzExMzE4N30.aHAqrArVB8SuywXF9515EQ2OK_LYBsNcGC9it8H5Pxg';

let supabaseInstance;

const anonKey = process.env.SUPABASE_ANON_KEY;

// For this project, the short 'sb_publishable' key is the one that works!
supabaseInstance = createClient(supabaseUrl, anonKey);

export const supabase = supabaseInstance;

export const testConnection = async () => {
  try {
    const { error } = await supabase.auth.getSession();

    if (error) {
      throw error;
    }
    console.log('Supabase connected successfully');
    return true;
  } catch (error) {
    console.error('Supabase connection error:', error.message);
    console.log('Tip: Check your SUPABASE_URL and SUPABASE_ANON_KEY in .env file');
    return false;
  }
};
