//src/middleware/sessionmiddleware.js

import jwt from "jsonwebtoken";

export const requireSession = (req, res, next) => {
  try {
    const token = req.cookies.rc_session;

    if (!token) {
      return res.status(401).json({
        message: "Authenticated user not found in session",
      });
    }

    const decoded = jwt.verify(token, process.env.SESSION_SECRET);

    req.user = decoded;

    next();
  } catch (err) {
    return res.status(401).json({
      message: "Invalid session",
    });
  }
};
export const optionalSession = (req, res, next) => {
    const token = req.cookies.rc_session;
    

    if (!token) {
        return next(); 
    }

    try {
        const decoded = jwt.verify(token, process.env.SESSION_SECRET);
        
        req.user = decoded; 
        next();
    } catch (err) {
        next(); 
    }
};
