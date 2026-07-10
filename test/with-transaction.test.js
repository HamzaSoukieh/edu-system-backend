const test = require("node:test");
const assert = require("node:assert/strict");

const { withTransaction, isTransactionUnsupported, createInSession } = require("../src/utils/withTransaction");

test("createInSession uses the plain single-doc form when there is no session", async () => {
    const calls = [];
    const FakeModel = {
        async create(...args) {
            calls.push(args);
            return { _id: "single", ...args[0] };
        },
    };
    const created = await createInSession(FakeModel, { name: "x" }, null);
    assert.deepEqual(calls, [[{ name: "x" }]]);
    assert.equal(created._id, "single");
});

test("createInSession uses the atomic array form when a session is provided", async () => {
    const calls = [];
    const FakeModel = {
        async create(...args) {
            calls.push(args);
            // Array form returns an array.
            return args[0].map((doc, i) => ({ _id: `arr-${i}`, ...doc }));
        },
    };
    const session = { id: "sess" };
    const created = await createInSession(FakeModel, { name: "y" }, session);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][0], [{ name: "y" }]); // array form
    assert.deepEqual(calls[0][1], { session });     // options carry the session
    assert.equal(created._id, "arr-0");             // returns the first element
});

test("withTransaction falls back to work(null) when no session can be started (no live connection)", async () => {
    // In this unit-test process there is no Mongo connection, so
    // mongoose.startSession() rejects and the helper must run work without a session.
    let receivedSession = "unset";
    const result = await withTransaction(async (session) => {
        receivedSession = session;
        return "ran-without-session";
    });
    assert.equal(receivedSession, null);
    assert.equal(result, "ran-without-session");
});

test("isTransactionUnsupported recognizes standalone-topology errors", () => {
    assert.equal(isTransactionUnsupported({ code: 20 }), true);
    assert.equal(isTransactionUnsupported({ message: "Transaction numbers are only allowed on a replica set member" }), true);
    assert.equal(isTransactionUnsupported({ message: "some other error" }), false);
});
