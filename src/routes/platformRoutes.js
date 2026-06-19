const express = require("express");
const authJwt = require("../middleware/authJwt");
const requireEmailVerified = require("../middleware/requireEmailVerified");
const { resolvePlatformAdmin, requirePlatformPermission } = require("../middleware/platformAuthorize");
const platformController = require("../controllers/platformController");

const router = express.Router();

router.use(authJwt, requireEmailVerified, resolvePlatformAdmin);
router.get("/institutions", requirePlatformPermission("platform.institutions.read"), platformController.listInstitutions);
router.get("/institutions/:institutionId", requirePlatformPermission("platform.institutions.read"), platformController.getInstitutionSummary);
router.get("/institutions/:institutionId/billing", requirePlatformPermission("platform.billing.read"), platformController.getInstitutionBilling);
router.get("/webhook-events", requirePlatformPermission("platform.webhooks.read"), platformController.listFailedWebhookEvents);
router.get("/audit", requirePlatformPermission("platform.audit.read"), platformController.listPlatformAuditLogs);

module.exports = router;
