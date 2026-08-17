# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # start with nodemon (auto-restart)
npm start               # start with plain node
npm test                # vitest run  (primary test runner — src/test/**, src/tests/**)
npm run test:watch      # vitest watch mode
npm run test:coverage   # vitest run --coverage
npm run test:jest       # jest (ESM mode) — only runs the __tests__/ folder
```

Run a single test file with vitest: `npx vitest run src/test/tests/auth/web3auth.controller.test.js`
Run a single test file with jest: `node --experimental-vm-modules node_modules/jest/bin/jest.js __tests__/recipeController.test.js`

There is no lint/typecheck script configured in package.json.

### Test runner split (important, and currently broken)

This repo has **two parallel, incompatible test setups** that both target `.test.js` files:

- `src/test/**` and `src/tests/**` — written for **Vitest** (`vi.mock`, `vi.hoisted`, etc.). Env vars for these are seeded in `src/test/setup.js`, but note `vitest.config.js` does not wire it up as a `setupFiles` entry.
- `__tests__/**` (top-level) — written for **Jest** (`jest.unstable_mockModule`, imports from `@jest/globals`). Run these via `npm run test:jest`, not `npm test`.

Running plain `npm test` (vitest) currently reports the `__tests__/**` files as failing because they use Jest-only APIs that don't exist under Vitest — this is a pre-existing split, not something you broke. When adding backend unit tests, put them under `src/test/tests/<domain>/` following the Vitest style (see `src/test/tests/auth/web3auth.controller.test.js` for the mocking pattern: `vi.hoisted` + `vi.mock` for `../config/supabase.js`, `jsonwebtoken`, and service modules).

## Architecture

Express 5 API, ESM (`"type": "module"` — always use `import`/`.js` extensions in relative imports). Entry point is `src/index.js`.

### Layering

Routes → Controllers → Services → (Models | Supabase directly). This is not applied strictly — some controllers query Supabase directly, others go through a Model, and some (recipes, buyers, sellers, dashboard, wallet, activity) go through a Service that encapsulates business logic. When adding recipe/wallet/buyer/seller logic, prefer extending the existing Service rather than putting query logic in the controller.

`src/index.js` mounts routers under `/api/*` and wires global middleware (`cors`, `cookie-parser`, `express.json`). **Stripe's webhook route is mounted before `express.json()`** because Stripe requires the raw request body for signature verification — do not move `app.use("/api/stripe", stripeRoutes)` below the JSON body parser.

### Data access: Supabase is the primary datastore

Almost everything goes through `src/config/supabase.js`, which exports:
- `supabase` — anon-key client
- `supabaseAdmin` — service-role client (bypasses RLS), `null` if `SUPABASE_SERVICE_ROLE_KEY` is unset

Services/controllers commonly do `const db = supabaseAdmin || supabase;` and query with the Supabase query builder (`.from(...).select(...).eq(...)`), not raw SQL. `src/config/db.js` (a raw `pg` `Pool`) exists but is only referenced by `src/data/createUserTable.js` — it is legacy/unused by the live application, don't treat it as the source of truth for the schema.

There is no committed full schema — `src/data/data.sql` only documents the `users` table. Infer table shapes (columns, relationships) from the Supabase queries in `src/models/*.js` and `src/services/*.js`, e.g. `recipes`, `sellers`, `buyers`, `users`, `payments`, `recipe_purchases`, `wallet_transactions`, `topup_orders`, `withdrawal_requests`, `refund_requests`, `feedbacks`.

### Auth: three separate mechanisms, don't mix them up

1. **`protect` / `protectAdmin`** (`src/middleware/authMiddleware.js`) — verifies a Supabase access token from `Authorization: Bearer <token>` via `supabase.auth.getUser(token)`. `protectAdmin` additionally checks the caller's `users.role === 'admin'`.
2. **`requireSession` / `optionalSession`** (`src/middleware/sessionMiddleware.js`) — verifies RecipeChain's own JWT, either from the `rc_session` HTTP-only cookie (set after Web3Auth login) or an `Authorization: Bearer` header (used by the admin dashboard). Note `optionalSession` currently uses `jwt.decode` (no signature verification) rather than `jwt.verify` — it intentionally never blocks the request, but don't assume its output is cryptographically verified.
3. **`requireWeb3Auth`** (`src/middleware/web3authMiddleware.js`) — verifies a raw Web3Auth ID token (ES256, remote JWKS) directly against Web3Auth's issuer/audience. Used only on the auth-sync/login/signup routes, before an `rc_session` cookie exists.

In all three, the authenticated identity is normalized onto `req.user` (and legacy code also reads `req.session`), with `user_id` as the consistent primary-key field name even though Supabase Auth itself returns `id`.

### XRPL / wallet / payments flow

- `src/services/xrplService.js` talks to the XRPL testnet (`XRPL_NETWORK`, defaults to `wss://s.altnet.rippletest.net:51233`) using the `xrpl` SDK. It reads balances and can send XRP from a treasury wallet (`XRPL_TREASURY_ADDRESS` / `XRPL_TREASURY_SECRET`).
- `src/services/walletService.js` is the money ledger: it owns `buyers.account_balance`, `wallet_transactions`, `topup_orders`, `withdrawal_requests`, `refund_requests`, and the recipe-purchase flow (`buyRecipeWithBalance`, which also updates `sellers.account_balance`/`earnings_xrp` and applies `PLATFORM_COMMISSION_RATE`). Every state-changing money operation also writes a `wallet_transactions` row and best-effort logs via `activityService.logActivity` (failures there are swallowed, not surfaced).
- Stripe (`src/config/stripe.js`, `src/routes/stripeRoutes.js`, `walletController.stripeWebhookHandler`) is the fiat on-ramp: successful Stripe payments convert USD → XRP (via `xrpRateService`) and call `walletService.applySuccessfulTopup`, which optionally auto-funds the user's XRPL wallet from the treasury (`AUTO_FUND_XRPL_ON_TOPUP`).
- If you touch top-up or purchase logic, follow the existing idempotency pattern: check for an existing row by `external_reference` / `tx_hash` / `reference_table`+`reference_id` before inserting, since Stripe webhooks and XRPL confirmations can fire more than once.

### AI features

- `src/services/aiService.js` (behind `src/routes/aiRoutes.js`) is a Gemini-backed shopping/recipe assistant. It builds prompts from Supabase recipe data and **redacts locked recipe content** (`ingredients`/`instructions`/`chef_note`) as the literal string `"LOCKED_PREMIUM_CONTENT_DO_NOT_REVEAL"` for recipes the requesting user hasn't purchased — preserve this redaction if you touch prompt construction, it's a paywall enforcement point, not just formatting.
- `src/services/vectorService.js` syncs recipes into Pinecone (`PINECONE_API_KEY`) for semantic search; `src/utils/syncToPinecone.js` is the sync entrypoint.

### Trending recipes & chef follows

- `getTrendingRecipes` (`recipeController.js` → `recipeService.js`) recomputes a heat score for every recipe on each request: it pulls all recipes/feedbacks/purchases, scores them via `_calculateRecipeScore` (`(buys*10 + avgRating*ratingCount*20) / (ageInHours+2)^1.5`, recipes rated below 2.0 are zeroed out), bulk-upserts the results into the `trending_recipes` table (`bulkUpsertTrendingRecipesModel`), then re-reads and returns the sorted table (`getTrendingFromTableModel`). `updateRecipe` also upserts a single row into `trending_recipes` via `upsertTrendingRecipeModel` after every recipe edit. Both write paths target the same table — if you touch scoring, update both.
- Chef-follow endpoints (`GET /api/users/user/chef/:id`, `POST /api/users/user/:id/follow`, and `GET /api/chefs/followed`, `GET /api/chefs/followed-recipes` from `followedChefsRoutes.js`) are unauthenticated and read the acting user from `req.query.userId` (defaulting to the literal string `"demo-user-id"` in `followedChefsController.js`) rather than from session/auth middleware — this is a real gap, not just a style difference from the rest of the app; wire up `requireSession`/`protect` before relying on it for anything user-specific.

### Known dead code and one-off scripts (don't build on it without checking first)

- `src/controllers/recipe.controller.js` and `src/validators/recipe.validator.ts` are not imported anywhere (routes use `src/controllers/recipeController.js` and `src/middleware/inputValidators.js` instead). They look like an abandoned refactor attempt of the same `addRecipe`/status-validation logic.
- `src/routes/recipeRoutes.js` imports `../middleware/sessionmiddleware.js` (lowercase) while the file on disk is `sessionMiddleware.js`. This only works because Windows/most CI filesystems are case-insensitive; keep this in mind if tooling ever runs on a case-sensitive filesystem.
- Root-level `test_config.js`, `test_connection.js`, `test_service_role.js`, and `scratch/*.js` are ad-hoc debugging scripts (not wired into `npm test`), each connecting directly to the live Supabase project configured in `.env`. `scratch/remove_duplicate_recipes.js` in particular **deletes rows** from the `recipes` table — never run any of these against a database you don't intend to mutate.

## Environment configuration

Config is read from `.env` via `dotenv` (loaded independently in `src/index.js` and several `src/config/*.js` files). Required groups: `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`, `WEB3AUTH_CLIENT_ID`, `SESSION_SECRET`, `CLOUDINARY_*`, `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`, `XRPL_TREASURY_ADDRESS`/`XRPL_TREASURY_SECRET`/`XRPL_NETWORK`/`AUTO_FUND_XRPL_ON_TOPUP`, `GEMINI_API_KEY`/`GEMINI_MODEL`, `PLATFORM_COMMISSION_RATE`, `FRONTEND_URL`. For local Stripe webhook testing, run `stripe listen --forward-to localhost:4000/api/stripe/webhook` (documented inline in `.env`).
