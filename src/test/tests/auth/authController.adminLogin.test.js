import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockSignInWithPassword, mockFrom } = vi.hoisted(() => ({
  mockSignInWithPassword: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignInWithPassword,
    },
    from: mockFrom,
  },
}));

vi.mock("../../../services/userService.js", () => ({
  default: {},
}));

import { adminLogin } from "../../../controllers/authController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.cookie = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

// Helper that makes supabase.from() resolve differently per table name so the
// two sequential `.from("users")...` / `.from("admins")...` calls in adminLogin
// can be independently controlled per test.
function mockFromByTable(resultsByTable) {
  mockFrom.mockImplementation((table) => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(resultsByTable[table]),
      }),
    }),
  }));
}

describe("authController.adminLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with a token for valid admin credentials", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: "admin-1", email: "admin@test.com" },
        session: { access_token: "supabase-access-token" },
      },
      error: null,
    });

    mockFromByTable({
      users: { data: { role: "admin" }, error: null },
      admins: { data: { username: "root-admin" }, error: null },
    });

    const req = { body: { email: "admin@test.com", password: "correct-password" } };
    const res = createMockResponse();

    await adminLogin(req, res);

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: "admin@test.com",
      password: "correct-password",
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "Admin Login successful!",
      token: "supabase-access-token",
      user: {
        id: "admin-1",
        email: "admin@test.com",
        username: "root-admin",
        role: "admin",
      },
    });
  });

  it("returns 401 when email/password are wrong (signInWithPassword errors)", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials" },
    });

    const req = { body: { email: "nobody@test.com", password: "wrong" } };
    const res = createMockResponse();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Email or Password wrong" });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("returns 403 when the authenticated user is not an admin", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: "buyer-1", email: "buyer@test.com" },
        session: { access_token: "supabase-access-token" },
      },
      error: null,
    });

    mockFromByTable({
      users: { data: { role: "buyer" }, error: null },
    });

    const req = { body: { email: "buyer@test.com", password: "correct-password" } };
    const res = createMockResponse();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "You are not an Admin" });
  });

  it("returns 500 when the admin profile row is missing in the admins table", async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: {
        user: { id: "admin-1", email: "admin@test.com" },
        session: { access_token: "supabase-access-token" },
      },
      error: null,
    });

    mockFromByTable({
      users: { data: { role: "admin" }, error: null },
      admins: { data: null, error: { message: "No rows found" } },
    });

    const req = { body: { email: "admin@test.com", password: "correct-password" } };
    const res = createMockResponse();

    await adminLogin(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Admin profile data not found",
      supabaseError: "No rows found",
    });
  });
});
