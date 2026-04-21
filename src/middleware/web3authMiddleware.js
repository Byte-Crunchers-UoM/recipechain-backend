import * as jose from "jose";

const WEB3AUTH_ISSUER = "https://api-auth.web3auth.io";
const WEB3AUTH_JWKS_URL = "https://api-auth.web3auth.io/jwks";

const jwks = jose.createRemoteJWKSet(new URL(WEB3AUTH_JWKS_URL));

export const requireWeb3Auth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Missing Authorization Bearer token",
      });
    }

    const audience = process.env.WEB3AUTH_CLIENT_ID;
    if (!audience) {
      return res.status(500).json({
        ok: false,
        message: "Missing WEB3AUTH_CLIENT_ID in .env",
      });
    }

    const { payload, protectedHeader } = await jose.jwtVerify(token, jwks, {
      algorithms: ["ES256"],
      issuer: WEB3AUTH_ISSUER,
      audience,
    });

    console.log("Web3Auth token verified:", {
      iss: payload.iss,
      aud: payload.aud,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      profileImage: payload.profileImage,
      userId: payload.userId,
      authConnection: payload.authConnection,
      groupedAuthConnectionId: payload.groupedAuthConnectionId,
      alg: protectedHeader.alg,
    });

    req.web3auth = payload;
    next();
  } catch (e) {
    console.error("Web3Auth token verification failed:", {
      message: e?.message,
      code: e?.code,
      claim: e?.claim,
      reason: e?.reason,
    });

    return res.status(401).json({
      ok: false,
      message: "Invalid Web3Auth token",
      detail: e?.message || "Unknown token verification error",
    });
  }
};