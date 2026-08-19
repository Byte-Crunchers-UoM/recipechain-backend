import { describe, it, expect, vi, afterEach } from "vitest";

import { errorHandler } from "../../../middleware/errorHandler.js";

function createMockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("errorHandler (centralized Express error middleware)", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("defaults to 500 with a generic message when the error has no statusCode/message", () => {
    process.env.NODE_ENV = "test";
    const err = new Error();
    err.message = "";
    const res = createMockRes();

    errorHandler(err, {}, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "An unexpected error occurred",
        statusCode: 500,
      })
    );
  });

  it("uses the error's statusCode and message when present", () => {
    process.env.NODE_ENV = "test";
    const err = new Error("Recipe not found");
    err.statusCode = 404;
    const res = createMockRes();

    errorHandler(err, {}, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Recipe not found", statusCode: 404 })
    );
  });

  /**
   * Documents ACTUAL current behavior: the handler only omits the stack trace
   * when NODE_ENV === 'production'; any other value (including 'test' or
   * 'development') includes the full stack trace in the JSON response body.
   */
  it("includes the stack trace in non-production environments", () => {
    process.env.NODE_ENV = "development";
    const err = new Error("boom");
    const res = createMockRes();

    errorHandler(err, {}, res, vi.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe(err.stack);
  });

  it("omits the stack trace when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";
    const err = new Error("boom");
    const res = createMockRes();

    errorHandler(err, {}, res, vi.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBeNull();
  });

  it("never leaks credentials/secrets from the error message beyond what the thrower already put there (message is passed through verbatim)", () => {
    process.env.NODE_ENV = "production";
    const err = new Error("Missing SUPABASE_SERVICE_ROLE_KEY in backend .env");
    const res = createMockRes();

    errorHandler(err, {}, res, vi.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload.message).toBe("Missing SUPABASE_SERVICE_ROLE_KEY in backend .env");
    expect(payload.error).toBeNull();
  });
});
