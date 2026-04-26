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
    // 1. හරියටම requireSession එකේ වගේම rc_session කුකිය ගන්නවා
    const token = req.cookies.rc_session;
    
    // (අවශ්‍ය නම් Header එකෙනුත් ගන්න පුළුවන් විදියට තියාගන්න)
    // const token = req.cookies.rc_session || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

    if (!token) {
        return next(); // කුකිය නැත්නම් Guest විදියට යවනවා
    }

    try {
        // 2. මෙතන 'process.env.SESSION_SECRET' වෙන්න ඕනේ, 'JWT_SECRET' නෙවෙයි (requireSession එකේ තියෙන්නෙත් එහෙමයි)
        const decoded = jwt.verify(token, process.env.SESSION_SECRET);
        
        req.user = decoded; 
        next();
    } catch (err) {
        next(); 
    }
};