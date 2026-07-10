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
// session to every model operation it performs (e.g.
// `Model.create([doc], { session })`, `.findOne(...).session(session)`), and
// must be idempotent because withTransaction may retry it on transient errors.
//
// On a non-replica-set deployment it transparently falls back to running
// `work(null)` once, without a transaction (no atomicity guarantee) — so the
// behaviour degrades gracefully in a standalone dev environment.
async function withTransaction(work) {
    const session = await mongoose.startSession();
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

module.exports = { withTransaction, isTransactionUnsupported };
