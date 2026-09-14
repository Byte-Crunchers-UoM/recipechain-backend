import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

console.log('Testing connection with:');
console.log('URL:', url);
console.log('Key length:', key?.length);
console.log('Key starts with:', key?.substring(0, 20));

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('sellers').select('full_name').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Data:', data);
  }
}

run();
