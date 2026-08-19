import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetUser, mockFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock("../../../config/supabase.js", () => ({
  supabase: {
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  },
}));

import { protect, protectAdmin } from "../../../middleware/authMiddleware.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function createMockReq(headers = {}) {
  return { headers };
}

describe("authMiddleware.protect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("populates req.user and calls next() for a valid token", async () => {
    const supabaseUser = { id: "user-abc", email: "test@example.com" };

    mockGetUser.mockResolvedValue({
      data: { user: supabaseUser },
      error: null,
    });

    const req = createMockReq({ authorization: "Bearer valid-token" });
    const res = createMockResponse();
    const next = vi.fn();

    await protect(req, res, next);

    expect(mockGetUser).toHaveBeenCalledWith("valid-token");
    expect(req.user).toEqual({
      ...supabaseUser,
      user_id: "user-abc",
    });
    expect(req.accessToken).toBe("valid-token");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = createMockReq({});
    const res = createMockResponse();
    const next = vi.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Token not found, please login",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is malformed (no Bearer prefix)", async () => {
    const req = createMockReq({ authorization: "Token something" });
    const res = createMockResponse();
    const next = vi.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Token not found, please login",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("returns 401 when supabase.auth.getUser returns an error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    });

    const req = createMockReq({ authorization: "Bearer bad-token" });
    const res = createMockResponse();
    const next = vi.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Not authorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when supabase.auth.getUser returns no user and no error", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const req = createMockReq({ authorization: "Bearer bad-token" });
    const res = createMockResponse();
    const next = vi.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Not authorized" });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("authMiddleware.protectAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockUsersRoleQuery(result) {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(result),
        }),
      }),
    });
  }

  it("calls next() when the caller has role 'admin'", async () => {
    const supabaseUser = { id: "admin-1", email: "admin@example.com" };

    mockGetUser.mockResolvedValue({
      data: { user: supabaseUser },
      error: null,
    });

    mockUsersRoleQuery({ data: { role: "admin" }, error: null });

    const req = createMockReq({ authorization: "Bearer admin-token" });
    const res = createMockResponse();
    const next = vi.fn();

    await protectAdmin(req, res, next);

    expect(mockFrom).toHaveBeenCalledWith("users");
    expect(req.user).toEqual({ ...supabaseUser, user_id: "admin-1" });
    expect(req.adminRole).toBe("admin");
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller has a valid but non-admin role", async () => {
    const supabaseUser = { id: "buyer-1", email: "buyer@example.com" };

    mockGetUser.mockResolvedValue({
      data: { user: supabaseUser },
      error: null,
    });

    mockUsersRoleQuery({ data: { role: "buyer" }, error: null });

    const req = createMockReq({ authorization: "Bearer buyer-token" });
    const res = createMockResponse();
    const next = vi.fn();

    await protectAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin only route" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the users-table profile lookup errors", async () => {
    const supabaseUser = { id: "user-1", email: "user@example.com" };

    mockGetUser.mockResolvedValue({
      data: { user: supabaseUser },
      error: null,
    });

    mockUsersRoleQuery({ data: null, error: { message: "not found" } });

    const req = createMockReq({ authorization: "Bearer some-token" });
    const res = createMockResponse();
    const next = vi.fn();

    await protectAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Admin only route" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token itself is invalid", async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    });

    const req = createMockReq({ authorization: "Bearer bad-token" });
    const res = createMockResponse();
    const next = vi.fn();

    await protectAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Not authorized" });
    expect(next).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
