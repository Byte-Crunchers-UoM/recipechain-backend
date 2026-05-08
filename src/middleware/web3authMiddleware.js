import * as jose from "jose";

const WEB3AUTH_ISSUER = "https://api-auth.web3auth.io";
const WEB3AUTH_JWKS_URL = "https://api-auth.web3auth.io/jwks";

/**
 * Remote JWKS lets the backend verify Web3Auth tokens using Web3Auth's public keys.
 * This avoids hardcoding public keys in our backend.
 */
const jwks = jose.createRemoteJWKSet(new URL(WEB3AUTH_JWKS_URL));

/**
 * Verifies a Web3Auth identity token before allowing auth sync/signup/login.
 *
 * Expected header:
 * Authorization: Bearer <web3auth_id_token>
 *
 * @param {import("express").Request} req - Express request containing Authorization header.
 * @param {import("express").Response} res - Express response used for auth errors.
 * @param {import("express").NextFunction} next - Express next middleware function.
 * @returns {Promise<void>}
 */
export const requireWeb3Auth = async (req, res, next) => {
  try {
    const auth = req.headers.authorization || "";

    /**
     * Web3Auth token is sent from frontend in Bearer format.
     * Example: Authorization: Bearer eyJ...
     */
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
        message: "Missing Authorization Bearer token",
      });
    }

    const audience = process.env.WEB3AUTH_CLIENT_ID;

    if (!audience) {
      /**
       * The audience must match the Web3Auth project/client ID.
       * Without it, the backend cannot confirm the token was issued for this app.
       */
      return res.status(500).json({
        ok: false,
        message: "Missing WEB3AUTH_CLIENT_ID in .env",
      });
    }

    /**
     * jwtVerify checks:
     * - token signature using Web3Auth JWKS public keys
     * - issuer is Web3Auth
     * - audience matches our Web3Auth client ID
     * - algorithm is ES256
     */
    const { payload, protectedHeader } = await jose.jwtVerify(token, jwks, {
      algorithms: ["ES256"],
      issuer: WEB3AUTH_ISSUER,
      audience,
    });

    /**
     * Keep this log useful for development/debugging provider issues.
     * Avoid logging the raw token because it is sensitive.
     */
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

    /**
     * Attach verified Web3Auth identity to the request.
     * Controllers can trust req.web3auth only after this middleware succeeds.
     */
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