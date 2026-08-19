import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockSetUserRoleByUserIdModel,
  mockEnsureBuyerRowModel,
  mockEnsureSellerRowModel,
} = vi.hoisted(() => ({
  mockSetUserRoleByUserIdModel: vi.fn(),
  mockEnsureBuyerRowModel: vi.fn(),
  mockEnsureSellerRowModel: vi.fn(),
}));

vi.mock("../../../models/userModel.js", () => ({
  createUserModel: vi.fn(),
  getUserByIdModel: vi.fn(),
  getUserByEmailModel: vi.fn(),
  getAllUsersModel: vi.fn(),
  updateUserModel: vi.fn(),
  deleteUserModel: vi.fn(),
  upsertWeb3AuthUserModel: vi.fn(),
  setUserRoleModel: vi.fn(),
  ensureBuyerRowModel: mockEnsureBuyerRowModel,
  ensureSellerRowModel: mockEnsureSellerRowModel,
  getUserByUserIdModel: vi.fn(),
  setUserRoleByUserIdModel: mockSetUserRoleByUserIdModel,
  requestAccountDeletionByUserIdModel: vi.fn(),
  deleteMyBuyerAccountPermanentlyByUserIdModel: vi.fn(),
  getChefProfileModel: vi.fn(),
  incrementFollowersModel: vi.fn(),
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: { from: vi.fn() },
  supabaseAdmin: { from: vi.fn() },
}));

import userService from "../../../services/userService.js";

describe("userService.setUserRoleByUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets role 'buyer', persists via setUserRoleByUserIdModel, and ensures a buyer row", async () => {
    const updatedUser = { user_id: "user-1", role: "buyer" };
    mockSetUserRoleByUserIdModel.mockResolvedValue(updatedUser);
    mockEnsureBuyerRowModel.mockResolvedValue({ user_id: "user-1" });

    const result = await userService.setUserRoleByUserId(
      "user-1",
      "Buyer@Test.com",
      "buyer"
    );

    expect(mockSetUserRoleByUserIdModel).toHaveBeenCalledWith("user-1", "buyer");
    expect(mockEnsureBuyerRowModel).toHaveBeenCalledWith(
      "user-1",
      "buyer@test.com"
    );
    expect(mockEnsureSellerRowModel).not.toHaveBeenCalled();
    expect(result).toEqual(updatedUser);
  });

  it("sets role 'seller', persists via setUserRoleByUserIdModel, and ensures a seller row", async () => {
    const updatedUser = { user_id: "user-2", role: "seller" };
    mockSetUserRoleByUserIdModel.mockResolvedValue(updatedUser);
    mockEnsureSellerRowModel.mockResolvedValue({ user_id: "user-2" });

    const result = await userService.setUserRoleByUserId(
      "user-2",
      "seller@test.com",
      "SELLER"
    );

    expect(mockSetUserRoleByUserIdModel).toHaveBeenCalledWith("user-2", "seller");
    expect(mockEnsureSellerRowModel).toHaveBeenCalledWith("user-2");
    expect(mockEnsureBuyerRowModel).not.toHaveBeenCalled();
    expect(result).toEqual(updatedUser);
  });

  it("rejects an invalid role string without touching the model layer", async () => {
    await expect(
      userService.setUserRoleByUserId("user-3", "user3@test.com", "admin")
    ).rejects.toThrow("Role must be buyer or seller");

    expect(mockSetUserRoleByUserIdModel).not.toHaveBeenCalled();
    expect(mockEnsureBuyerRowModel).not.toHaveBeenCalled();
    expect(mockEnsureSellerRowModel).not.toHaveBeenCalled();
  });

  it("rejects an empty/missing role string", async () => {
    await expect(
      userService.setUserRoleByUserId("user-3", "user3@test.com", "")
    ).rejects.toThrow("Role must be buyer or seller");

    expect(mockSetUserRoleByUserIdModel).not.toHaveBeenCalled();
  });

  it("rejects when userId is missing", async () => {
    await expect(
      userService.setUserRoleByUserId(null, "user3@test.com", "buyer")
    ).rejects.toThrow("Missing user_id in session");

    expect(mockSetUserRoleByUserIdModel).not.toHaveBeenCalled();
  });

  it("rejects when email is missing", async () => {
    await expect(
      userService.setUserRoleByUserId("user-3", "", "buyer")
    ).rejects.toThrow("Missing email in session");

    expect(mockSetUserRoleByUserIdModel).not.toHaveBeenCalled();
  });

  it("rejects when email format is invalid", async () => {
    await expect(
      userService.setUserRoleByUserId("user-3", "not-an-email", "buyer")
    ).rejects.toThrow("Invalid email format");

    expect(mockSetUserRoleByUserIdModel).not.toHaveBeenCalled();
  });
});
