import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('Testing with Service Role Key:');
console.log('URL:', url);
console.log('Key starts with:', key?.substring(0, 20));

const supabase = createClient(url, key);

async function run() {
  const { data, error } = await supabase.from('recipes').select('recipe_id, title').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Success! Connection works with Service Role Key.');
    console.log('Data sample:', data);
  }
}

run();
