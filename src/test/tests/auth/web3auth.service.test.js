import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../models/userModel.js", () => ({
  upsertWeb3AuthUserModel: vi.fn(),
  createUserModel: vi.fn(),
  getUserByIdModel: vi.fn(),
  getUserByEmailModel: vi.fn(),
  getAllUsersModel: vi.fn(),
  updateUserModel: vi.fn(),
  deleteUserModel: vi.fn(),
  setUserRoleModel: vi.fn(),
  ensureBuyerRowModel: vi.fn(),
  ensureSellerRowModel: vi.fn(),
  getUserByUserIdModel: vi.fn(),
  setUserRoleByUserIdModel: vi.fn(),
  requestAccountDeletionByUserIdModel: vi.fn(),
  deleteMyBuyerAccountPermanentlyByUserIdModel: vi.fn()
}));

vi.mock("../../../config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn()
  }
}));

import userService from "../../../services/userService.js";
import { upsertWeb3AuthUserModel } from "../../../models/userModel.js";

describe("userService.syncWeb3AuthUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws error when email is missing", async () => {
    await expect(
      userService.syncWeb3AuthUser("", "rTestWallet", "google")
    ).rejects.toThrow("Email missing");
  });

  it("throws error when email format is invalid", async () => {
    await expect(
      userService.syncWeb3AuthUser("wrong-email", "rTestWallet", "google")
    ).rejects.toThrow("Invalid email format");
  });

  it("throws error when walletAddress is missing", async () => {
    await expect(
      userService.syncWeb3AuthUser("buyer@test.com", "", "google")
    ).rejects.toThrow("walletAddress is required");
  });

  it("syncs Web3Auth user successfully", async () => {
    const mockUser = {
      user_id: "user-1",
      email: "buyer@test.com",
      wallet_address: "rTestWallet",
      role: "buyer"
    };

    upsertWeb3AuthUserModel.mockResolvedValue(mockUser);

    const result = await userService.syncWeb3AuthUser(
      "BUYER@Test.COM",
      " rTestWallet ",
      "google"
    );

    expect(upsertWeb3AuthUserModel).toHaveBeenCalledWith(
      "buyer@test.com",
      "rTestWallet",
      "google"
    );

    expect(result).toEqual(mockUser);
  });
});