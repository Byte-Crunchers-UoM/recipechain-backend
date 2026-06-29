import 'dotenv/config';
import OpenAI from "openai";
import { HfInference } from '@huggingface/inference';
import { Pinecone } from '@pinecone-database/pinecone';
// Make sure this path points to your actual database connection file
// import { supabase } from "../config/supabase.js"; 

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, 
  baseURL: "https://api.groq.com/openai/v1", // Remove this line if using standard OpenAI instead of Groq
});
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

class AiService {
  async processChatMessage(userMessage) {
    const embeddingResult = await hf.featureExtraction({
      model: 'sentence-transformers/all-mpnet-base-v2',
      inputs: userMessage,
    });
    const queryEmbedding = Array.from(embeddingResult);

    const index = pc.index('recipechain-index');
    const searchResults = await index.query({
      vector: queryEmbedding,
      topK: 3,
      includeMetadata: true
    });

    const contextText = searchResults.matches.map(match => 
      `- ${match.metadata.title} (Price: ${match.metadata.price} XRP, Prep: ${match.metadata.prep_time} mins)`
    ).join('\n');

    const completion = await client.chat.completions.create({
      model: "llama-3.1-8b-instant", 
      messages: [
        {
          role: "system",
          content: `You are the RecipeChain AI. Here are database matches:\n${contextText}\nRecommend these specific recipes enthusiastically in under 3 sentences.`
        },
        { role: "user", content: userMessage }
      ]
    });

    // Formatting the recipes to send back to the frontend UI
    const fullRecipes = searchResults.matches.map(match => ({
       recipe_id: match.id,
       title: match.metadata.title,
       price: match.metadata.price,
       prep_time: match.metadata.prep_time,
       image_url: match.metadata.image_url
    }));

    return {
      reply: completion.choices[0].message.content,
      recipes: fullRecipes
    };
  }
}

export default new AiService();