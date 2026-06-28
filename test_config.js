import { supabase } from './src/config/supabase.js';

async function test() {
  console.log('Testing connection via src/config/supabase.js...');
  const { data, error } = await supabase.from('recipes').select('recipe_id, title').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('✅ Connection Successful via Config!');
    console.log('Data:', data);
  }
}

test();
