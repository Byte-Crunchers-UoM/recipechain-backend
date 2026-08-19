import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockJwtVerify, mockCreateRemoteJWKSet } = vi.hoisted(() => ({
  mockJwtVerify: vi.fn(),
  mockCreateRemoteJWKSet: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: mockCreateRemoteJWKSet,
  jwtVerify: mockJwtVerify,
}));

// createRemoteJWKSet is called once at module load time (it just builds a lazy
// JWKS reference object) - it must return something before requireWeb3Auth is imported.
mockCreateRemoteJWKSet.mockReturnValue({ __fakeJwks: true });

const { requireWeb3Auth } = await import(
  "../../../middleware/web3authMiddleware.js"
);

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("web3authMiddleware.requireWeb3Auth", () => {
  beforeEach(() => {
    mockJwtVerify.mockReset();
    process.env.WEB3AUTH_CLIENT_ID = "test-client-id";
  });

  it("populates req.web3auth and calls next() for a valid token", async () => {
    const payload = {
      iss: "https://api-auth.web3auth.io",
      aud: "test-client-id",
      email: "user@test.com",
      name: "Test User",
    };

    mockJwtVerify.mockResolvedValue({
      payload,
      protectedHeader: { alg: "ES256" },
    });

    const req = { headers: { authorization: "Bearer valid.web3auth.token" } };
    const res = createMockResponse();
    const next = vi.fn();

    await requireWeb3Auth(req, res, next);

    expect(mockJwtVerify).toHaveBeenCalledWith(
      "valid.web3auth.token",
      { __fakeJwks: true },
      {
        algorithms: ["ES256"],
        issuer: "https://api-auth.web3auth.io",
        audience: "test-client-id",
      }
    );
    expect(req.web3auth).toEqual(payload);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 401 when the Authorization header is missing", async () => {
    const req = { headers: {} };
    const res = createMockResponse();
    const next = vi.fn();

    await requireWeb3Auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Missing Authorization Bearer token",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });

  it("returns 401 when jose.jwtVerify rejects (bad signature/issuer/audience)", async () => {
    mockJwtVerify.mockRejectedValue(new Error("signature verification failed"));

    const req = { headers: { authorization: "Bearer bad.token" } };
    const res = createMockResponse();
    const next = vi.fn();

    await requireWeb3Auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Invalid Web3Auth token",
      detail: "signature verification failed",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 500 when WEB3AUTH_CLIENT_ID is not configured", async () => {
    delete process.env.WEB3AUTH_CLIENT_ID;

    const req = { headers: { authorization: "Bearer any.token" } };
    const res = createMockResponse();
    const next = vi.fn();

    await requireWeb3Auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Missing WEB3AUTH_CLIENT_ID in .env",
    });
    expect(next).not.toHaveBeenCalled();
    expect(mockJwtVerify).not.toHaveBeenCalled();
  });
});
