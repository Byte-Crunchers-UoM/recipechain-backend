import jwt from "jsonwebtoken";

export const requireSession = (req, res, next) => {
  try {
    const token = req.cookies?.rc_session;

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Authenticated user not found in session",
      });
    }

    const secret = process.env.SESSION_SECRET;

    if (!secret) {
      return res.status(500).json({
        ok: false,
        message: "Missing SESSION_SECRET in backend environment",
      });
    }

    const payload = jwt.verify(token, secret);

    // ✅ keep old code working
    req.session = payload;

    // ✅ support new code too
    req.user = {
      user_id: payload.user_id,
      email: payload.email,
      role: payload.role ?? null,
    };

    next();
  } catch (error) {
    console.error("requireSession error:", error);

    return res.status(401).json({
      ok: false,
      message: "Authenticated user not found in session",
    });
  }
};

export const optionalSession = (req, _res, next) => {
  try {
    const token = req.cookies?.rc_session;
    const secret = process.env.SESSION_SECRET;

    if (!token || !secret) {
      req.session = null;
      req.user = null;
      return next();
    }

    const payload = jwt.verify(token, secret);

    req.session = payload;
    req.user = {
      user_id: payload.user_id,
      email: payload.email,
      role: payload.role ?? null,
    };

    next();
  } catch {
    req.session = null;
    req.user = null;
    next();
  }
};