const express = require("express");
const authController = require("../controllers/authController");
const authJwt = require("../middleware/authJwt");
const { authStandardLimiter, authIssuanceLimiter } = require("../middleware/rateLimit");

const router = express.Router();

router.post("/signup", authIssuanceLimiter, authController.signup);
router.post("/login", authStandardLimiter, authController.login);
router.post("/password/forgot", authIssuanceLimiter, authController.forgotPassword);
router.post("/password/reset", authStandardLimiter, authController.resetPassword);
router.post("/otp/verify", authStandardLimiter, authJwt, authController.verifySignupOtp);
router.post("/otp/resend", authIssuanceLimiter, authJwt, authController.resendSignupOtp);

module.exports = router;
