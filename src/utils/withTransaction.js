const mongoose = require("mongoose");

// True when the error indicates the MongoDB deployment can't run transactions
// (a standalone, non-replica-set topology). Production runs a replica set
// (see roadmap T0.1 / DB-1); this guard lets the same code run against a
// standalone dev Mongo without transactions rather than hard-failing.
function isTransactionUnsupported(error) {
    const message = error?.message || "";
    return (
        error?.code === 20 || // IllegalOperation
        error?.codeName === "IllegalOperation" ||
        /Transaction numbers are only allowed on a replica set/i.test(message) ||
        /transactions are not supported/i.test(message) ||
        /does not support transactions/i.test(message) ||
        /Transactions are not supported/i.test(message)
    );
}

// Run `work(session)` inside a MongoDB transaction. `work` must pass the given
// session to every model operation it performs — use `createInSession(...)` for
// inserts and `.session(session)` for reads — and must be idempotent because
// withTransaction may retry it on transient errors.
//
// The function degrades gracefully in two ways so the same code runs everywhere:
//   1. On a non-replica-set deployment (standalone dev Mongo), a transaction is
//      unsupported → it falls back to running `work(null)` once, without atomicity.
//   2. When no session can even be started (e.g. a fully-mocked unit test with no
//      live connection), it also falls back to `work(null)`.
// Production runs a replica set (roadmap T0.1 / DB-1) and gets a real transaction.
async function withTransaction(work) {
    let session;
    try {
        session = await mongoose.startSession();
    } catch {
        // No live connection / cannot start a session — run without one.
        return work(null);
    }
    try {
        let result;
        await session.withTransaction(async () => {
            result = await work(session);
        });
        return result;
    } catch (error) {
        if (isTransactionUnsupported(error)) {
            return work(null);
        }
        throw error;
    } finally {
        await session.endSession();
    }
}

// Insert one document, honoring an optional transaction session. With a session
// the atomic array form `Model.create([doc], { session })` is required; without
// one (standalone fallback / mocked unit tests) the plain single-doc form is used
// so existing mocks that stub `Model.create(payload)` keep working unchanged.
async function createInSession(Model, doc, session) {
    if (session) {
        const [created] = await Model.create([doc], { session });
        return created;
    }
    return Model.create(doc);
}

module.exports = { withTransaction, isTransactionUnsupported, createInSession };
