const express = require("express");
const authJwt = require("../middleware/authJwt");
const requireEmailVerified = require("../middleware/requireEmailVerified");
const { institutionAccess, requirePermission } = require("../middleware/authorize");
const uploadInstitutionLogo = require("../middleware/uploadInstitutionLogo");
const institutionController = require("../controllers/institutionController");
const departmentController = require("../controllers/departmentController");
const subjectController = require("../controllers/subjectController");

const router = express.Router();

router.get("/me", authJwt, requireEmailVerified, institutionController.getMyInstitutionContext);
router.patch(
    "/:institutionId",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("institution.manage"),
    institutionController.updateInstitution
);
router.post(
    "/:institutionId/logo",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("institution.manage"),
    uploadInstitutionLogo,
    institutionController.uploadInstitutionLogo
);
router.post(
    "/:institutionId/departments",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("department.manage"),
    departmentController.createDepartment
);
router.get(
    "/:institutionId/departments",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    departmentController.listDepartments
);
router.get(
    "/:institutionId/departments/:departmentId",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    departmentController.getDepartmentById
);
router.patch(
    "/:institutionId/departments/:departmentId",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("department.manage"),
    departmentController.updateDepartment
);
router.delete(
    "/:institutionId/departments/:departmentId",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("department.manage"),
    departmentController.deleteDepartment
);
router.post(
    "/:institutionId/departments/:departmentId/subjects",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("subject.manage"),
    subjectController.createSubject
);
router.get(
    "/:institutionId/subjects",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("subject.manage"),
    subjectController.listSubjects
);
router.get(
    "/:institutionId/subjects/:subjectId",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("subject.manage"),
    subjectController.getSubjectById
);
router.patch(
    "/:institutionId/subjects/:subjectId",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("subject.manage"),
    subjectController.updateSubject
);
router.delete(
    "/:institutionId/subjects/:subjectId",
    authJwt,
    requireEmailVerified,
    institutionAccess(),
    requirePermission("subject.manage"),
    subjectController.deleteSubject
);

module.exports = router;
