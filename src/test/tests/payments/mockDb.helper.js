// src/test/tests/payments/mockDb.helper.js
//
// Lightweight fake for the Supabase query-builder chain used by
// walletService.js / recipeService.js. Not a test file itself (no
// ".test.js" suffix) so Vitest will not try to run it directly.
//
// Usage:
//   const chains = {};
//   const db = createMockDb({
//     buyers: [{ data: buyerRow, error: null }],
//     recipes: [{ data: recipeRow, error: null }],
//   }, chains);
//
// Each `db.from(table)` call consumes the next queued response for that
// table (in the exact order the source code queries it). If more calls
// happen than responses were queued, the last queued response is reused.
// `chains[table]` collects every chain object created for that table, in
// call order, so assertions can inspect `.insert.mock.calls`,
// `.update.mock.calls`, `.eq.mock.calls`, etc.
import { vi } from "vitest";

function createChain(response) {
  const promise = Promise.resolve(response);

  const chain = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    range: vi.fn(() => chain),
    single: vi.fn(() => promise),
    maybeSingle: vi.fn(() => promise),
    then: (resolve, reject) => promise.then(resolve, reject),
    catch: (onReject) => promise.catch(onReject),
  };

  return chain;
}

export function createMockDb(sequences = {}, chainsOut = {}) {
  const cursors = {};

  const from = vi.fn((table) => {
    const list = sequences[table];

    if (!list || list.length === 0) {
      throw new Error(
        `mockDb: no response queued for table "${table}" (call #${
          (cursors[table] || 0) + 1
        })`
      );
    }

    const idx = cursors[table] || 0;
    cursors[table] = idx + 1;

    const response = idx < list.length ? list[idx] : list[list.length - 1];
    const chain = createChain(response);

    chainsOut[table] = chainsOut[table] || [];
    chainsOut[table].push(chain);

    return chain;
  });

  return { from, _cursors: cursors };
}
