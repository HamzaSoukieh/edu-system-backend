const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

// DB-1: createInstitution writes Institution + owner Membership atomically.
// On a replica set, a failure in the 2nd write must leave NO Institution
// behind. Self-skips without Mongo.

process.env.JWT_SECRET = process.env.JWT_SECRET || "insttx-secret";
process.env.QR_JWT_SECRET = process.env.QR_JWT_SECRET || "insttx-qr";
process.env.NODE_ENV = "test";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/edu-saas-insttx-test";

const institutionService = require("../src/services/institutionService");
const Institution = require("../src/models/Institution");
const Membership = require("../src/models/Membership");

const oid = () => new mongoose.Types.ObjectId();
let dbReady = false;
let isReplicaSet = false;

test.before(async () => {
    try {
        await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
        dbReady = true;
        try {
            const admin = mongoose.connection.db.admin();
            const status = await admin.command({ hello: 1 });
            isReplicaSet = Boolean(status.setName);
        } catch {
            isReplicaSet = false;
        }
    } catch {
        dbReady = false;
    }
});

test.after(async () => {
    if (dbReady) await mongoose.disconnect();
});

test("createInstitution persists Institution + owner Membership", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    const userId = oid();
    const { institution, membership } = await institutionService.createInstitution(
        { id: userId },
        { name: "Tx University", type: "university" }
    );
    try {
        assert.ok(institution.id);
        assert.equal(membership.role, "admin");
        const storedInst = await Institution.findById(institution.id).lean();
        const storedMem = await Membership.findOne({ institutionId: institution.id, userId }).lean();
        assert.ok(storedInst);
        assert.ok(storedMem);
        assert.equal(storedMem.role, "admin");
    } finally {
        await Membership.deleteMany({ userId });
        await Institution.deleteOne({ _id: institution.id });
    }
});

test("a failure creating the owner Membership rolls back the Institution (replica set)", async (t) => {
    if (!dbReady) return t.skip("no mongo");
    if (!isReplicaSet) return t.skip("standalone mongo: no transaction rollback");

    const userId = oid();
    // Force the 2nd write to fail by stubbing Membership.create to throw.
    const originalCreate = Membership.create;
    Membership.create = async () => {
        throw new Error("injected membership failure");
    };
    try {
        await assert.rejects(
            () => institutionService.createInstitution({ id: userId }, { name: "Rollback U", type: "university" }),
            /injected membership failure/
        );
        // The transaction must have rolled back the Institution write.
        const leaked = await Institution.findOne({ ownerUserId: userId }).lean();
        assert.equal(leaked, null, "Institution should have been rolled back");
    } finally {
        Membership.create = originalCreate;
        await Institution.deleteMany({ ownerUserId: userId });
        await Membership.deleteMany({ userId });
    }
});
