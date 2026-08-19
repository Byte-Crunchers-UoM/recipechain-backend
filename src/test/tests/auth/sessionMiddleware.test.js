import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

import {
  requireSession,
  optionalSession,
} from "../../../middleware/sessionMiddleware.js";

const SECRET = "test-session-secret";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("sessionMiddleware.requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = SECRET;
  });

  it("populates req.user and req.session and calls next() for a valid cookie", () => {
    const token = jwt.sign(
      { user_id: "user-1", email: "buyer@test.com", role: "buyer" },
      SECRET,
      { expiresIn: "7d" }
    );

    const req = { cookies: { rc_session: token } };
    const res = createMockResponse();
    const next = vi.fn();

    requireSession(req, res, next);

    expect(req.user).toMatchObject({
      user_id: "user-1",
      email: "buyer@test.com",
      role: "buyer",
    });
    expect(req.session).toEqual(req.user);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when the cookie is missing", () => {
    const req = { cookies: {} };
    const res = createMockResponse();
    const next = vi.fn();

    requireSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Authenticated user not found in session",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the cookie signature is invalid/tampered", () => {
    const token = jwt.sign({ user_id: "user-1" }, "a-completely-different-secret", {
      expiresIn: "7d",
    });

    const req = { cookies: { rc_session: token } };
    const res = createMockResponse();
    const next = vi.fn();

    requireSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Authenticated user not found in session",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is expired", () => {
    const token = jwt.sign({ user_id: "user-1" }, SECRET, {
      expiresIn: "-10s",
    });

    const req = { cookies: { rc_session: token } };
    const res = createMockResponse();
    const next = vi.fn();

    requireSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Authenticated user not found in session",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 500 when SESSION_SECRET is not configured", () => {
    delete process.env.SESSION_SECRET;

    const req = { cookies: { rc_session: "any-token" } };
    const res = createMockResponse();
    const next = vi.fn();

    requireSession(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Missing SESSION_SECRET in backend environment",
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe("sessionMiddleware.optionalSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SESSION_SECRET = SECRET;
  });

  it("reads a valid token from the Authorization Bearer header", () => {
    const token = jwt.sign({ user_id: "admin-1", role: "admin" }, SECRET, {
      expiresIn: "7d",
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };
    const res = createMockResponse();
    const next = vi.fn();

    optionalSession(req, res, next);

    expect(req.user).toMatchObject({ user_id: "admin-1", role: "admin" });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("falls back to the rc_session cookie when there is no Authorization header", () => {
    const token = jwt.sign({ user_id: "buyer-1", role: "buyer" }, SECRET, {
      expiresIn: "7d",
    });

    const req = {
      headers: {},
      cookies: { rc_session: token },
    };
    const res = createMockResponse();
    const next = vi.fn();

    optionalSession(req, res, next);

    expect(req.user).toMatchObject({ user_id: "buyer-1", role: "buyer" });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("sets req.user = null but still calls next() when there is no token at all", () => {
    const req = { headers: {}, cookies: {} };
    const res = createMockResponse();
    const next = vi.fn();

    optionalSession(req, res, next);

    expect(req.user).toBeNull();
    expect(req.session).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("sets req.user = null and still calls next() for a garbage/malformed token, without throwing", () => {
    const req = {
      headers: { authorization: "Bearer not-a-real-jwt" },
      cookies: {},
    };
    const res = createMockResponse();
    const next = vi.fn();

    expect(() => optionalSession(req, res, next)).not.toThrow();

    expect(req.user).toBeNull();
    expect(req.session).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("does NOT cryptographically verify the token signature (uses jwt.decode, not jwt.verify)", () => {
    // A token signed with the WRONG secret is still accepted because optionalSession
    // uses jwt.decode() rather than jwt.verify(). This documents existing, intentional
    // behavior per sessionMiddleware.js comments - it is not something to "fix".
    const token = jwt.sign({ user_id: "user-1", role: "buyer" }, "wrong-secret", {
      expiresIn: "7d",
    });

    const req = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };
    const res = createMockResponse();
    const next = vi.fn();

    optionalSession(req, res, next);

    expect(req.user).toMatchObject({ user_id: "user-1", role: "buyer" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
