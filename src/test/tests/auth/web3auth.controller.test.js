import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockJwtSign,
  mockSyncWeb3AuthUser,
  mockHydrateBuyerIdentityFromWeb3Auth,
} = vi.hoisted(() => ({
  mockJwtSign: vi.fn(),
  mockSyncWeb3AuthUser: vi.fn(),
  mockHydrateBuyerIdentityFromWeb3Auth: vi.fn(),
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: mockJwtSign,
  },
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
    },
    from: vi.fn(),
  },
}));

vi.mock("../../../services/userService.js", () => ({
  default: {
    syncWeb3AuthUser: mockSyncWeb3AuthUser,
    hydrateBuyerIdentityFromWeb3Auth: mockHydrateBuyerIdentityFromWeb3Auth,
  },
}));

import { logout, syncWeb3AuthUser } from "../../../controllers/authController.js";

function createMockResponse() {
  const res = {};

  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);

  return res;
}

describe("authController.syncWeb3AuthUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    process.env.SESSION_SECRET = "test-session-secret";

    mockJwtSign.mockReturnValue("test-session-token");
    mockHydrateBuyerIdentityFromWeb3Auth.mockResolvedValue(undefined);
  });

  it("returns 400 when Web3Auth email is missing", async () => {
    const req = {
      web3auth: {},
      body: {
        walletAddress: "rTestWalletAddress",
      },
    };

    const res = createMockResponse();

    await syncWeb3AuthUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);

    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Email missing in Web3Auth token.",
    });

    expect(mockSyncWeb3AuthUser).not.toHaveBeenCalled();
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("syncs Web3Auth user, hydrates buyer identity, sets session cookie, and returns user", async () => {
    const mockUser = {
      user_id: "user-123",
      email: "buyer@test.com",
      role: "buyer",
      wallet_address: "rTestWalletAddress",
      auth_provider: "google",
    };

    mockSyncWeb3AuthUser.mockResolvedValue(mockUser);

    const req = {
      web3auth: {
        email: "BUYER@Test.COM",
        authConnection: "google",
        name: "Test Buyer",
        picture: "https://example.com/profile.png",
      },
      body: {
        walletAddress: "rTestWalletAddress",
      },
    };

    const res = createMockResponse();

    await syncWeb3AuthUser(req, res);

    expect(mockSyncWeb3AuthUser).toHaveBeenCalledWith(
      "buyer@test.com",
      "rTestWalletAddress",
      "google"
    );

    expect(mockHydrateBuyerIdentityFromWeb3Auth).toHaveBeenCalledWith({
      userId: "user-123",
      email: "buyer@test.com",
      name: "Test Buyer",
      profileImage: "https://example.com/profile.png",
    });

    expect(mockJwtSign).toHaveBeenCalledWith(
      {
        user_id: "user-123",
        email: "buyer@test.com",
        role: "buyer",
      },
      "test-session-secret",
      {
        expiresIn: "7d",
      }
    );

    expect(res.cookie).toHaveBeenCalledWith(
      "rc_session",
      "test-session-token",
      {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }
    );

    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      user: mockUser,
    });
  });

  it("uses fallback auth provider when provider data is missing", async () => {
    const mockUser = {
      user_id: "user-123",
      email: "buyer@test.com",
      role: null,
      wallet_address: "rTestWalletAddress",
      auth_provider: "unknown",
    };

    mockSyncWeb3AuthUser.mockResolvedValue(mockUser);

    const req = {
      web3auth: {
        email: "buyer@test.com",
      },
      body: {
        walletAddress: "rTestWalletAddress",
      },
    };

    const res = createMockResponse();

    await syncWeb3AuthUser(req, res);

    expect(mockSyncWeb3AuthUser).toHaveBeenCalledWith(
      "buyer@test.com",
      "rTestWalletAddress",
      "unknown"
    );

    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      user: mockUser,
    });
  });

  it("uses groupedAuthConnectionId when authConnection is missing", async () => {
    const mockUser = {
      user_id: "user-123",
      email: "buyer@test.com",
      role: "buyer",
      wallet_address: "rTestWalletAddress",
      auth_provider: "facebook",
    };

    mockSyncWeb3AuthUser.mockResolvedValue(mockUser);

    const req = {
      web3auth: {
        email: "buyer@test.com",
        groupedAuthConnectionId: "facebook",
      },
      body: {
        walletAddress: "rTestWalletAddress",
      },
    };

    const res = createMockResponse();

    await syncWeb3AuthUser(req, res);

    expect(mockSyncWeb3AuthUser).toHaveBeenCalledWith(
      "buyer@test.com",
      "rTestWalletAddress",
      "facebook"
    );
  });

  it("returns 409 when same email is already registered with another provider", async () => {
    mockSyncWeb3AuthUser.mockRejectedValue(
      new Error("This email is already registered with google")
    );

    const req = {
      web3auth: {
        email: "buyer@test.com",
        authConnection: "facebook",
      },
      body: {
        walletAddress: "rTestWalletAddress",
      },
    };

    const res = createMockResponse();

    await syncWeb3AuthUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);

    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "This email is already registered with google",
    });

    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected sync error", async () => {
    mockSyncWeb3AuthUser.mockRejectedValue(new Error("Database error"));

    const req = {
      web3auth: {
        email: "buyer@test.com",
        authConnection: "google",
      },
      body: {
        walletAddress: "rTestWalletAddress",
      },
    };

    const res = createMockResponse();

    await syncWeb3AuthUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Database error",
    });

    expect(res.cookie).not.toHaveBeenCalled();
  });

  it("returns 500 when SESSION_SECRET is missing", async () => {
    delete process.env.SESSION_SECRET;

    const mockUser = {
      user_id: "user-123",
      email: "buyer@test.com",
      role: "buyer",
      wallet_address: "rTestWalletAddress",
      auth_provider: "google",
    };

    mockSyncWeb3AuthUser.mockResolvedValue(mockUser);

    const req = {
      web3auth: {
        email: "buyer@test.com",
        authConnection: "google",
      },
      body: {
        walletAddress: "rTestWalletAddress",
      },
    };

    const res = createMockResponse();

    await syncWeb3AuthUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);

    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Missing SESSION_SECRET",
    });

    expect(res.cookie).not.toHaveBeenCalled();
  });
});

describe("authController.logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears rc_session cookie and returns success message", async () => {
    const req = {};
    const res = createMockResponse();

    await logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith("rc_session", {
      path: "/",
    });

    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      message: "Logged out",
    });
  });
});