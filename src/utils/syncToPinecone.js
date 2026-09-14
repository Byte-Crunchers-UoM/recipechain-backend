import 'dotenv/config';
import { HfInference } from '@huggingface/inference';
import { Pinecone } from '@pinecone-database/pinecone';

const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const pc = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pc.index('recipechain-index');

export async function embedAndStoreRecipe(recipe) {
  try {
    const textToEmbed = `Title: ${recipe.title}. Description: ${recipe.description || ''}`;

    console.log(`🧠 Generating embedding for: ${recipe.title}`);

    // Generate embedding
    const result = await hf.featureExtraction({
      model: 'sentence-transformers/all-mpnet-base-v2',
      inputs: textToEmbed,
    });

    // Flatten the embedding
    let embedding = Array.isArray(result)
      ? result.flat(Infinity)
      : Object.values(result).flat(Infinity);

    embedding = embedding.map(Number).filter((n) => !isNaN(n));

    console.log('Embedding length:', embedding.length);
    console.log('First 5 values:', embedding.slice(0, 5));

    // Validate embedding
    if (!embedding.length) {
      console.error(`❌ No embedding generated for "${recipe.title}"`);
      return;
    }

    // Ensure ID is a string
    const recipeId = String(recipe.recipe_id ?? recipe.id);

    // Create vector
    const vector = {
      id: recipeId,
      values: embedding,
      metadata: {
        title: String(recipe.title ?? ''),
        description: String(recipe.description ?? ''),
        prep_time: Number(recipe.prep_time ?? 0),
        price: Number(recipe.price ?? 0),
        image_url: String(recipe.image_url ?? ''),
      },
    };

    console.log('\n========== VECTOR ==========');
    console.dir(vector, { depth: null });
    console.log('============================\n');

    // Upsert into Pinecone
    await index.upsert({
      vectors: [vector],
    });

    console.log(`✅ Successfully synced: ${recipe.title}\n`);
  } catch (error) {
    console.error(`❌ Failed to sync "${recipe.title}"`);
    console.error(error);
    console.error(error.stack);
  }
}