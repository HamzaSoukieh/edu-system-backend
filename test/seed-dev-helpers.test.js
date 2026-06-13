const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getDatabaseNameFromUri,
    looksLikeLocalDatabaseName,
    normalizeEmail,
    normalizeName,
    normalizeNameKey,
    parseArgs,
} = require("../scripts/seed-dev");

test("seed helpers normalize safe demo identifiers", () => {
    assert.equal(normalizeEmail(" Owner@Example.Test "), "owner@example.test");
    assert.equal(normalizeName(" Demo   University "), "Demo University");
    assert.equal(normalizeNameKey(" Demo   University "), "demo university");
});

test("seed helpers parse Mongo database names", () => {
    assert.equal(
        getDatabaseNameFromUri("mongodb://localhost:27017/edu-system?retryWrites=true"),
        "edu-system"
    );
    assert.equal(
        getDatabaseNameFromUri("mongodb+srv://user:pass@example.test/edu-saas-dev?retryWrites=true"),
        "edu-saas-dev"
    );
    assert.equal(getDatabaseNameFromUri(""), "");
});

test("seed helpers identify reset-safe local database names", () => {
    assert.equal(looksLikeLocalDatabaseName("edu-saas-dev"), true);
    assert.equal(looksLikeLocalDatabaseName("edu-saas-test"), true);
    assert.equal(looksLikeLocalDatabaseName("edu-system"), true);
    assert.equal(looksLikeLocalDatabaseName("production"), false);
    assert.equal(looksLikeLocalDatabaseName("edu-saas"), false);
});

test("seed helpers parse reset argument", () => {
    assert.deepEqual(parseArgs([]), { reset: false });
    assert.deepEqual(parseArgs(["--reset"]), { reset: true });
});
