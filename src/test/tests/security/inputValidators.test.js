import { describe, it, expect, vi } from "vitest";

import { validateUser, validateRecipe } from "../../../middleware/inputValidators.js";

function createMockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("inputValidators.validateUser", () => {
  it("returns 400 when the request body is empty", () => {
    const req = { body: {} };
    const res = createMockRes();
    const next = vi.fn();

    validateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when username is shorter than the minimum length", () => {
    const req = { body: { username: "ab", email: "a@test.com" } };
    const res = createMockRes();
    const next = vi.fn();

    validateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid email format", () => {
    const req = { body: { username: "validname", email: "not-an-email" } };
    const res = createMockRes();
    const next = vi.fn();

    validateUser(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("calls next() for a valid username/email", () => {
    const req = { body: { username: "validname", email: "buyer@test.com" } };
    const res = createMockRes();
    const next = vi.fn();

    validateUser(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a very-long username via the max-length rule instead of crashing", () => {
    const req = { body: { username: "a".repeat(500), email: "buyer@test.com" } };
    const res = createMockRes();
    const next = vi.fn();

    expect(() => validateUser(req, res, next)).not.toThrow();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  /**
   * SQL-injection-like input is just ordinary string data to a Joi format/length
   * validator - it is neither specially rejected nor specially sanitized here.
   * This test only proves the validator does not crash and applies its normal
   * length/format rules; it is NOT a claim that any injection vector is "safe"
   * or "fixed" (parameterized/ORM-style Supabase queries are what actually
   * prevent SQL injection elsewhere in the codebase).
   */
  it("treats a SQL-injection-like username as ordinary string data (passes because it satisfies length/format rules, not because it is sanitized)", () => {
    const req = { body: { username: "'; DROP TABLE users; --", email: "buyer@test.com" } };
    const res = createMockRes();
    const next = vi.fn();

    expect(() => validateUser(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("treats an XSS-like username as ordinary string data (no server-side execution, no special handling)", () => {
    const req = { body: { username: "<script>alert(1)</script>", email: "buyer@test.com" } };
    const res = createMockRes();
    const next = vi.fn();

    expect(() => validateUser(req, res, next)).not.toThrow();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("inputValidators.validateRecipe", () => {
  it("defaults approval_status to 'pending' when missing and requires price/description/etc. for a non-draft recipe", () => {
    const req = { body: { title: "Milk Rice" } };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(req.body.approval_status).toBe("pending");
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows a minimal draft recipe without price/description/ingredients", () => {
    const req = { body: { title: "Draft Recipe", approval_status: "draft" } };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a negative price for a published recipe", () => {
    const req = {
      body: {
        title: "Chicken Curry",
        description: "Spicy curry",
        price: -5,
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        ingredients: [{ id: "1", name: "chicken" }],
        instructions: ["cook it"],
        approval_status: "published",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric price for a published recipe", () => {
    const req = {
      body: {
        title: "Chicken Curry",
        description: "Spicy curry",
        price: "free",
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        ingredients: [{ id: "1", name: "chicken" }],
        instructions: ["cook it"],
        approval_status: "published",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a valid published recipe", () => {
    const req = {
      body: {
        title: "Chicken Curry",
        description: "Spicy curry",
        price: 15,
        prep_time: 10,
        cook_time: 20,
        servings: 4,
        ingredients: [{ id: "1", name: "chicken" }],
        instructions: ["cook it"],
        approval_status: "published",
      },
    };
    const res = createMockRes();
    const next = vi.fn();

    validateRecipe(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
