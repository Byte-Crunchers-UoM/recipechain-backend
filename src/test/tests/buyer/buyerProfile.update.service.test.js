import { describe, it, expect, vi, beforeEach } from "vitest";

// ARRANGE: buyerService.updateBuyerProfile touches buyers/users/saved_recipes/
// feedbacks/payments/recipes plus activityService. This mock covers the
// read-modify-write path used by updateBuyerProfile -> buildBuyerProfile.
let buyersRow;
let usersRow;

function buildDb() {
  return {
    from: vi.fn((table) => {
      if (table === "buyers") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { ...buyersRow }, error: null }),
            }),
          }),
          update: (patch) => {
            Object.assign(buyersRow, patch);
            return {
              eq: () => Promise.resolve({ error: null }),
            };
          },
        };
      }

      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { ...usersRow }, error: null }),
            }),
          }),
        };
      }

      if (table === "saved_recipes") {
        return { select: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) };
      }

      if (table === "feedbacks") {
        return { select: () => ({ eq: () => Promise.resolve({ count: 0, error: null }) }) };
      }

      if (table === "recipe_purchases") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }

      throw new Error(`Unexpected table in test double: ${table}`);
    }),
  };
}

const stableDb = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../../../config/supabase.js", () => ({
  supabase: stableDb,
  supabaseAdmin: stableDb,
}));

vi.mock("../../../utils/uploadToCloudinary.js", () => ({
  uploadBufferToCloudinary: vi.fn(() =>
    Promise.resolve({ secure_url: "https://cdn.test/pic.png", public_id: "pic123" })
  ),
}));

vi.mock("../../../services/activityService.js", () => ({
  default: {
    logActivity: vi.fn(() => Promise.resolve(null)),
    getUserActivities: vi.fn(() => Promise.resolve([])),
  },
}));

import buyerService from "../../../services/buyerService.js";
import activityService from "../../../services/activityService.js";
import { uploadBufferToCloudinary } from "../../../utils/uploadToCloudinary.js";

describe("buyerService.updateBuyerProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    buyersRow = { display_name: "Old Name", bio: "Old bio", profile_picture: "" };
    usersRow = { email: "buyer@test.com" };
    stableDb.from.mockImplementation(buildDb().from);
  });

  it("sanitizes and trims the display name, and logs a profile_update activity", async () => {
    const profile = await buyerService.updateBuyerProfile({
      userId: "buyer-1",
      body: { displayName: "  New   Name  ", bio: "hi" },
      file: null,
    });

    expect(profile.display_name).toBe("New Name");
    expect(activityService.logActivity).toHaveBeenCalledTimes(1);
    expect(activityService.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "buyer-1", type: "profile_update" })
    );
  });

  it("falls back to an email-derived display name when displayName is blank", async () => {
    const profile = await buyerService.updateBuyerProfile({
      userId: "buyer-1",
      body: { displayName: "   ", bio: "hi" },
      file: null,
    });

    expect(profile.display_name).toBe("Buyer");
  });

  it("truncates a display name longer than 80 characters", async () => {
    const longName = "A".repeat(120);

    const profile = await buyerService.updateBuyerProfile({
      userId: "buyer-1",
      body: { displayName: longName, bio: "" },
      file: null,
    });

    expect(profile.display_name.length).toBe(80);
  });

  it("truncates a bio longer than 500 characters", async () => {
    const longBio = "B".repeat(600);

    await buyerService.updateBuyerProfile({
      userId: "buyer-1",
      body: { displayName: "Name", bio: longBio },
      file: null,
    });

    expect(buyersRow.bio.length).toBe(500);
  });

  it("does not log a profile_update activity when nothing actually changed", async () => {
    await buyerService.updateBuyerProfile({
      userId: "buyer-1",
      body: { displayName: "Old Name", bio: "Old bio" },
      file: null,
    });

    expect(activityService.logActivity).not.toHaveBeenCalled();
  });

  it("rejects a disallowed profile picture mimetype without calling Cloudinary", async () => {
    await expect(
      buyerService.updateBuyerProfile({
        userId: "buyer-1",
        body: { displayName: "Name", bio: "" },
        file: { mimetype: "application/pdf", size: 1000, buffer: Buffer.from("x") },
      })
    ).rejects.toThrow(/JPG, PNG, and WEBP/);

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("rejects a profile picture larger than 5MB without calling Cloudinary", async () => {
    await expect(
      buyerService.updateBuyerProfile({
        userId: "buyer-1",
        body: { displayName: "Name", bio: "" },
        file: { mimetype: "image/png", size: 6 * 1024 * 1024, buffer: Buffer.from("x") },
      })
    ).rejects.toThrow(/5MB or less/);

    expect(uploadBufferToCloudinary).not.toHaveBeenCalled();
  });

  it("uploads a valid profile picture and persists the returned URL", async () => {
    const profile = await buyerService.updateBuyerProfile({
      userId: "buyer-1",
      body: { displayName: "Name", bio: "" },
      file: { mimetype: "image/png", size: 1000, buffer: Buffer.from("x") },
    });

    expect(uploadBufferToCloudinary).toHaveBeenCalledTimes(1);
    expect(profile.profile_picture).toBe("https://cdn.test/pic.png");
  });
});
