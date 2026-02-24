import * as jose from "jose";

const WEB3AUTH_ISSUER = "https://api-auth.web3auth.io";
const WEB3AUTH_JWKS_URL = "https://api-auth.web3auth.io/jwks";

const jwks = jose.createRemoteJWKSet(new URL(WEB3AUTH_JWKS_URL));

export const requireWeb3Auth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({ ok: false, message: "Missing Authorization Bearer token" });
    }

    const audience = process.env.WEB3AUTH_CLIENT_ID;
    if (!audience) {
      return res.status(500).json({ ok: false, message: "Missing WEB3AUTH_CLIENT_ID in .env" });
    }

    const { payload } = await jose.jwtVerify(token, jwks, {
      algorithms: ["ES256"],
      issuer: WEB3AUTH_ISSUER,
      audience,
    });

    // payload now trusted
    req.web3auth = payload;
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, message: "Invalid Web3Auth token" });
  }
};