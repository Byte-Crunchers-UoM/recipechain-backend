// remove duplicate recipes from the database.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function removeDuplicateRecipes() {
  console.log('🔍 Fetching all recipes...');
  
  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('recipe_id, title, created_at')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching recipes:', error.message);
    return;
  }

  console.log(`📦 Total recipes in database: ${recipes.length}`);

  // Group recipes by lowercase title
  const groups = {};
  for (const recipe of recipes) {
    const key = recipe.title?.toLowerCase().trim();
    if (!key) continue;
    if (!groups[key]) groups[key] = [];
    groups[key].push(recipe);
  }

  // Find duplicates (groups with more than 1 recipe)
  const idsToDelete = [];
  for (const [title, group] of Object.entries(groups)) {
    if (group.length > 1) {
      const [keep, ...duplicates] = group;
      console.log(`\n🔄 Duplicate title: "${title}" (${group.length} copies)`);
      console.log(`   ✅ Keeping: ${keep.recipe_id} (created: ${keep.created_at})`);
      for (const dup of duplicates) {
        console.log(`   🗑️  Deleting: ${dup.recipe_id} (created: ${dup.created_at})`);
        idsToDelete.push(dup.recipe_id);
      }
    }
  }

  if (idsToDelete.length === 0) {
    console.log('\n✅ No duplicate recipes found! Database is clean.');
    return;
  }

  console.log(`\n🗑️  Total recipes to delete: ${idsToDelete.length}`);

  // Clean related tables that have foreign keys to recipes
  const relatedTables = ['trending_recipes', 'feedbacks', 'recipe_purchases'];
  
  for (const table of relatedTables) {
    console.log(`🧹 Cleaning ${table} table...`);
    try {
      const { error: cleanError } = await supabase
        .from(table)
        .delete()
        .in('recipe_id', idsToDelete);

      if (cleanError) {
        console.log(`   ⚠️  Warning (${table}): ${cleanError.message}`);
      } else {
        console.log(`   ✅ ${table} cleaned.`);
      }
    } catch (e) {
      console.log(`   ⚠️  Skipped ${table}: ${e.message}`);
    }
  }

  // delete the duplicate recipes
  console.log('\n🗑️  Deleting duplicate recipes...');
  const { error: deleteError } = await supabase
    .from('recipes')
    .delete()
    .in('recipe_id', idsToDelete);

  if (deleteError) {
    console.error('❌ Error deleting recipes:', deleteError.message);
    return;
  }

  console.log(`\n✅ Successfully removed ${idsToDelete.length} duplicate recipes!`);
  
  // Verify final count
  const { count } = await supabase
    .from('recipes')
    .select('*', { count: 'exact', head: true });
  
  console.log(`📦 Remaining recipes: ${count}`);
}

removeDuplicateRecipes().catch(console.error);
