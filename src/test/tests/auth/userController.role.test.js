import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetUserByUserId,
  mockSetUserRoleByUserId,
  mockRequestAccountDeletion,
  mockDeleteMyAccountPermanently,
} = vi.hoisted(() => ({
  mockGetUserByUserId: vi.fn(),
  mockSetUserRoleByUserId: vi.fn(),
  mockRequestAccountDeletion: vi.fn(),
  mockDeleteMyAccountPermanently: vi.fn(),
}));

vi.mock("../../../services/userService.js", () => ({
  default: {
    getUserByUserId: mockGetUserByUserId,
    setUserRoleByUserId: mockSetUserRoleByUserId,
    requestAccountDeletion: mockRequestAccountDeletion,
    deleteMyAccountPermanently: mockDeleteMyAccountPermanently,
  },
}));

import {
  getMe,
  setUserRole,
  requestMyAccountDeletion,
  deleteMyAccountPermanently,
} from "../../../controllers/userController.js";

function createMockResponse() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.clearCookie = vi.fn().mockReturnValue(res);
  return res;
}

describe("userController.setUserRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session on the request", async () => {
    const req = { session: null, user: null, body: { role: "buyer" } };
    const res = createMockResponse();

    await setUserRole(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Missing session. Please login again.",
      data: null,
    });
    expect(mockSetUserRoleByUserId).not.toHaveBeenCalled();
  });

  it("returns 200 with the updated user for a valid role update", async () => {
    const updatedUser = { user_id: "user-1", role: "buyer" };
    mockSetUserRoleByUserId.mockResolvedValue(updatedUser);

    const req = {
      session: { user_id: "user-1", email: "buyer@test.com" },
      user: null,
      body: { role: "buyer" },
    };
    const res = createMockResponse();

    await setUserRole(req, res);

    expect(mockSetUserRoleByUserId).toHaveBeenCalledWith(
      "user-1",
      "buyer@test.com",
      "buyer"
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "User role updated successfully",
      data: updatedUser,
    });
  });

  it("returns 400 when userService rejects an invalid role", async () => {
    // userService.setUserRoleByUserId only accepts "buyer" or "seller" per
    // userService.isValidRole(); anything else throws "Role must be buyer or seller".
    mockSetUserRoleByUserId.mockRejectedValue(
      new Error("Role must be buyer or seller")
    );

    const req = {
      session: { user_id: "user-1", email: "buyer@test.com" },
      user: null,
      body: { role: "admin" },
    };
    const res = createMockResponse();

    await setUserRole(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Role must be buyer or seller",
      data: null,
    });
  });
});

describe("userController.getMe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session/user on the request", async () => {
    const req = { session: null, user: null };
    const res = createMockResponse();

    await getMe(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "No session user_id found",
      data: null,
    });
    expect(mockGetUserByUserId).not.toHaveBeenCalled();
  });

  it("loads and returns the user for a valid session", async () => {
    const user = { user_id: "user-1", email: "buyer@test.com", role: "buyer" };
    mockGetUserByUserId.mockResolvedValue(user);

    const req = { session: { user_id: "user-1" }, user: null };
    const res = createMockResponse();

    await getMe(req, res);

    expect(mockGetUserByUserId).toHaveBeenCalledWith("user-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "User loaded successfully",
      data: user,
    });
  });
});

describe("userController.requestMyAccountDeletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an error response when there is no session", async () => {
    const req = { session: null, user: null };
    const res = createMockResponse();

    await requestMyAccountDeletion(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Missing session. Please login again.",
      data: null,
    });
    expect(mockRequestAccountDeletion).not.toHaveBeenCalled();
  });

  it("returns 200 on a successful deletion request", async () => {
    const updatedUser = { user_id: "user-1", account_status: "deletion_requested" };
    mockRequestAccountDeletion.mockResolvedValue(updatedUser);

    const req = { session: { user_id: "user-1" }, user: null };
    const res = createMockResponse();

    await requestMyAccountDeletion(req, res);

    expect(mockRequestAccountDeletion).toHaveBeenCalledWith("user-1");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      message: "Account deletion request submitted successfully.",
      data: updatedUser,
    });
  });
});

describe("userController.deleteMyAccountPermanently", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    const req = { session: null, user: null };
    const res = createMockResponse();

    await deleteMyAccountPermanently(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      ok: false,
      message: "Missing session. Please login again.",
    });
    expect(mockDeleteMyAccountPermanently).not.toHaveBeenCalled();
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it("deletes the account, clears the rc_session cookie, and returns 200 on success", async () => {
    mockDeleteMyAccountPermanently.mockResolvedValue({ success: true });

    const req = { session: { user_id: "user-1" }, user: null };
    const res = createMockResponse();

    await deleteMyAccountPermanently(req, res);

    expect(mockDeleteMyAccountPermanently).toHaveBeenCalledWith("user-1");
    expect(res.clearCookie).toHaveBeenCalledWith("rc_session", { path: "/" });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      message: "Account deleted permanently.",
    });
  });
});
