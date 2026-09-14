import 'dotenv/config';
import { HfInference } from '@huggingface/inference';
import { Pinecone } from '@pinecone-database/pinecone';

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

export async function embedAndStoreRecipe(recipe) {
  try {
    const textToEmbed = `Title: ${recipe.title}. Description: ${recipe.description || ''}`;

    // 1. Get embedding from Hugging Face
    const result = await hf.featureExtraction({
      model: 'sentence-transformers/all-mpnet-base-v2',
      inputs: textToEmbed,
    });
    
    // 2. Extract and flatten to a clean array of numbers
    let embedding = Array.isArray(result) ? result.flat(Infinity) : Object.values(result).flat(Infinity);
    embedding = embedding.map(Number).filter(n => !isNaN(n));

    // 3. Validation: Verify embedding has data
    if (embedding.length === 0) {
      console.error(`❌ Skipping "${recipe.title}": Failed to generate embedding vector.`);
      return;
    }

    // 4. Force ID to be a string
    const safeId = String(recipe.recipe_id || recipe.id || Date.now());

    // 5. Construct the record exactly as Pinecone v4+ expects
    const record = {
      id: safeId,
      values: embedding,
      metadata: {
        title: String(recipe.title || 'Unknown'),
        prep_time: Number(recipe.prep_time) || 0,
        price: Number(recipe.price) || 0,
        image_url: String(recipe.image_url || '')
      }
    };

    // 6. Perform the upsert
    const index = pc.index('recipechain-index');
    await index.upsert([record]);

    console.log(`✅ Synced recipe to Pinecone: ${recipe.title}`);
  } catch (error) {
    console.error(`❌ Critical error for "${recipe.title}":`, error.message);
  }
}