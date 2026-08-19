import { describe, it, expect, vi, beforeEach } from "vitest";

process.env.HUGGINGFACE_API_KEY = "test-hf-key";
process.env.PINECONE_API_KEY = "test-pinecone-key";

const mockFeatureExtraction = vi.fn();
const mockUpsert = vi.fn();
const mockIndex = vi.fn(() => ({ upsert: mockUpsert }));

vi.mock("@huggingface/inference", () => ({
  HfInference: vi.fn().mockImplementation(function () {
    return { featureExtraction: mockFeatureExtraction };
  }),
}));

vi.mock("@pinecone-database/pinecone", () => ({
  Pinecone: vi.fn().mockImplementation(function () {
    return { index: mockIndex };
  }),
}));

vi.mock("dotenv/config", () => ({}));

import { embedAndStoreRecipe } from "../../../services/vectorService.js";

const baseRecipe = {
  recipe_id: "recipe-1",
  title: "Chicken Curry",
  description: "Spicy curry",
  prep_time: 30,
  price: 20,
  image_url: "https://cdn.test/img.png",
};

describe("vectorService.embedAndStoreRecipe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("embeds the recipe and upserts a well-formed record into Pinecone", async () => {
    mockFeatureExtraction.mockResolvedValue([0.1, 0.2, 0.3]);
    mockUpsert.mockResolvedValue({ upsertedCount: 1 });

    await embedAndStoreRecipe(baseRecipe);

    expect(mockFeatureExtraction).toHaveBeenCalledWith(
      expect.objectContaining({ inputs: expect.stringContaining("Chicken Curry") })
    );

    expect(mockIndex).toHaveBeenCalledWith("recipechain-index");
    expect(mockUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: "recipe-1",
        values: [0.1, 0.2, 0.3],
        metadata: expect.objectContaining({
          title: "Chicken Curry",
          prep_time: 30,
          price: 20,
          image_url: "https://cdn.test/img.png",
        }),
      }),
    ]);
  });

  it("skips the upsert when the embedding provider returns an empty vector", async () => {
    mockFeatureExtraction.mockResolvedValue([]);

    await expect(embedAndStoreRecipe(baseRecipe)).resolves.toBeUndefined();

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("does not throw when the embedding provider fails (errors are swallowed and logged)", async () => {
    mockFeatureExtraction.mockRejectedValue(new Error("HuggingFace unavailable"));

    await expect(embedAndStoreRecipe(baseRecipe)).resolves.toBeUndefined();

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("does not throw when the Pinecone upsert fails (errors are swallowed and logged)", async () => {
    mockFeatureExtraction.mockResolvedValue([0.1, 0.2, 0.3]);
    mockUpsert.mockRejectedValue(new Error("Pinecone unavailable"));

    await expect(embedAndStoreRecipe(baseRecipe)).resolves.toBeUndefined();
  });
});
