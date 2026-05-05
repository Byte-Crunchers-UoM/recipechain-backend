import jwt from "jsonwebtoken";

export const requireSession = (req, res, next) => {
  try {
    const token = req.cookies?.rc_session;
    if (!token) return res.status(401).json({ ok: false, message: "No session" });

    const secret = process.env.SESSION_SECRET;
    if (!secret) {
      return res.status(500).json({ ok: false, message: "Missing SESSION_SECRET" });
    }

    const payload = jwt.verify(token, secret);
    req.session = payload; // { user_id, email, role }
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: "Invalid session" });
  }
};