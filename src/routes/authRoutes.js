const express = require("express");
const authController = require("../controllers/authController");
const authJwt = require("../middleware/authJwt");

const router = express.Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/password/forgot", authController.forgotPassword);
router.post("/password/reset", authController.resetPassword);
router.post("/otp/verify", authJwt, authController.verifySignupOtp);
router.post("/otp/resend", authJwt, authController.resendSignupOtp);

module.exports = router;
