# API Endpoint Index

| Method | Path | Module | Auth | Permission | Description |
|---|---|---|---|---|---|
| POST | `/auth/signup` | Auth | Public | Public | Create user, institution, admin membership, send signup OTP, return JWT. |
| POST | `/auth/login` | Auth | Public | Public | Authenticate verified active user and return an access + refresh token pair. |
| POST | `/auth/refresh` | Auth | Public | Refresh token | Rotate the refresh token and issue a new access token (reuse detection revokes the family). |
| POST | `/auth/logout` | Auth | Public | Refresh token | Revoke the presented refresh token. |
| POST | `/auth/logout-all` | Auth | Protected | Authenticated user | Bump tokenVersion, invalidating all sessions/devices. |
| POST | `/auth/setup-password` | Auth | Public | Setup token | Member sets their initial password via a single-use setup token, then can log in. |
| POST | `/auth/password/forgot` | Auth | Public | Public | Send password reset OTP if eligible. |
| POST | `/auth/password/reset` | Auth | Public | Public | Reset password with OTP (invalidates prior sessions). |
| POST | `/auth/otp/verify` | OTP/email verification | Protected | Authenticated user | Verify signup OTP. |
| POST | `/auth/otp/resend` | OTP/email verification | Protected | Authenticated user | Resend signup OTP. |
| POST | `/stripe/webhook` | Stripe webhook | Public | Stripe signature | Receive Stripe events using raw body. |
| GET | `/billing/plans` | Billing/Stripe | Public | Public | Display-safe plan catalog (name + seat limits + billing cycle; no secrets) for the marketing/pricing page. |
| GET | `/platform/institutions` | Provider control plane | Protected platform admin | platform.institutions.read | List safe aggregate institution operations. |
| GET | `/platform/institutions/:institutionId` | Provider control plane | Protected platform admin | platform.institutions.read | Read one provider-level institution summary. |
| GET | `/platform/institutions/:institutionId/billing` | Provider control plane | Protected platform admin | platform.billing.read | Read local billing, seats, sync state, and failed webhooks. |
| GET | `/platform/webhook-events` | Provider control plane | Protected platform admin | platform.webhooks.read | List failed Stripe webhook summaries only. |
| GET | `/platform/audit` | Provider control plane | Protected platform admin | platform.audit.read | List immutable platform audit records. |
| GET | `/institutions/me` | Institutions | Protected | Authenticated verified user | Enriched current user institution context for frontend bootstrap. |
| POST | `/institutions` | Institutions | Protected | Authenticated verified user | Create additional institution. |
| PATCH | `/institutions/:institutionId` | Institutions | Protected | institution.manage | Update institution. |
| POST | `/institutions/:institutionId/logo` | Uploads/downloads | Protected | institution.manage | Upload institution logo. |
| POST | `/institutions/:institutionId/billing/checkout-session` | Billing/Stripe | Protected | Owner/admin service check | Create Stripe Checkout Session. |
| POST | `/institutions/:institutionId/billing/upgrade-to-pro` | Billing/Stripe | Protected | Owner/admin service check | Immediate prorated Plus -> Pro upgrade on the existing Stripe subscription. |
| GET | `/institutions/:institutionId/billing/status` | Billing/Stripe | Protected | Owner/admin service check | Read local billing status. |
| POST | `/institutions/:institutionId/responsibility-assignments` | Responsibility assignments | Protected | Owner/admin service check | Create scoped Head/Coordinator/Mentor assignment for an active instructor. |
| GET | `/institutions/:institutionId/responsibility-assignments` | Responsibility assignments | Protected | Owner/admin service check | List tenant-scoped responsibility assignments with safe filters. |
| GET | `/institutions/:institutionId/responsibility-assignments/:assignmentId` | Responsibility assignments | Protected | Owner/admin service check | Get one tenant-scoped responsibility assignment. |
| PATCH | `/institutions/:institutionId/responsibility-assignments/:assignmentId` | Responsibility assignments | Protected | Owner/admin service check | Update assignment scope/date/isActive fields. |
| PATCH | `/institutions/:institutionId/responsibility-assignments/:assignmentId/deactivate` | Responsibility assignments | Protected | Owner/admin service check | Soft-deactivate a Head, Coordinator, or Mentor assignment. |
| DELETE | `/institutions/:institutionId/responsibility-assignments/:assignmentId` | Responsibility assignments | Protected | Owner/admin service check | Soft-deactivate a responsibility assignment. |
| GET | `/institutions/:institutionId/academic-oversight/risk-summary` | Academic oversight | Protected | Owner/admin or Head `academicRisk.read_scope` | Read derived attendance/grade risk summary. |
| GET | `/institutions/:institutionId/academic-oversight/students` | Academic oversight | Protected | Owner/admin or Head `academicRisk.read_scope` | List scoped students with read-only risk rows. |
| GET | `/institutions/:institutionId/academic-oversight/students/:studentMemberId` | Academic oversight | Protected | Owner/admin or Head `academicProfile.read_scope` | Get one scoped student's profile detail row. |
| GET | `/institutions/:institutionId/academic-oversight/students/:studentMemberId/standing` | Academic oversight | Protected | Owner/admin or Head `academicStanding.read_scope` | Get one scoped student's standing detail row. |
| POST | `/institutions/:institutionId/academic-decisions/enrollment-drop` | Academic decisions | Protected | Head `academicDecision.recommend_scope` | Create enrollment-drop recommendation without changing Enrollment. |
| GET | `/institutions/:institutionId/academic-decisions` | Academic decisions | Protected | Head `academicDecision.read_scope` or Admin/Owner service check | List visible AcademicDecision records with safe filters. |
| GET | `/institutions/:institutionId/academic-decisions/review-queue` | Academic decisions | Protected | Admin `academicDecision.review` or Owner service check | List institution decisions requiring administrative review. |
| GET | `/institutions/:institutionId/academic-decisions/:decisionId` | Academic decisions | Protected | Head scoped read or Admin/Owner service check | Get one tenant-scoped AcademicDecision. |
| POST | `/institutions/:institutionId/academic-decisions/:decisionId/approve` | Academic decisions | Protected | Admin `academicDecision.review` or Owner service check | Approve a recommended enrollment-drop decision without applying it. |
| POST | `/institutions/:institutionId/academic-decisions/:decisionId/reject` | Academic decisions | Protected | Admin `academicDecision.review` or Owner service check | Reject a recommended enrollment-drop decision. |
| POST | `/institutions/:institutionId/academic-decisions/:decisionId/apply` | Academic decisions | Protected | Admin `academicDecision.apply` or Owner service check | Apply an approved enrollment-drop decision to the exact Enrollment. |
| PATCH | `/institutions/:institutionId/academic-decisions/:decisionId/cancel` | Academic decisions | Protected | Recommending Head in current scope | Cancel own recommended decision. |
| GET | `/institutions/:institutionId/notifications` | Notifications | Protected | Own active institution membership | List current user's in-app notifications. |
| PATCH | `/institutions/:institutionId/notifications/:notificationId/read` | Notifications | Protected | Own active institution membership | Mark current user's notification read. |
| GET | `/institutions/:institutionId/announcements` | Announcements | Protected | Active membership (audience-filtered) | List institution announcements visible to the caller's audience. |
| POST | `/institutions/:institutionId/announcements` | Announcements | Protected | Admin | Create an announcement (title, body, audience). |
| PATCH | `/institutions/:institutionId/announcements/:announcementId` | Announcements | Protected | Admin | Update an announcement. |
| DELETE | `/institutions/:institutionId/announcements/:announcementId` | Announcements | Protected | Admin | Delete an announcement. |
| POST | `/institutions/:institutionId/academic-years` | Academic Years | Protected | institution.manage | Create academic year. |
| GET | `/institutions/:institutionId/academic-years` | Academic Years | Protected | institution.manage | List academic years. |
| GET | `/institutions/:institutionId/academic-years/active` | Academic Years | Protected | Active institution membership | Get active academic year. |
| GET | `/institutions/:institutionId/academic-years/:academicYearId` | Academic Years | Protected | institution.manage | Get academic year. |
| PATCH | `/institutions/:institutionId/academic-years/:academicYearId` | Academic Years | Protected | institution.manage | Update academic year. |
| POST | `/institutions/:institutionId/academic-years/:academicYearId/archive` | Academic Years | Protected | institution.manage | Archive academic year. |
| POST | `/institutions/:institutionId/academic-policies` | Academic profiles/policies | Protected | institution.manage | Create university academic policy. |
| GET | `/institutions/:institutionId/academic-policies` | Academic profiles/policies | Protected | institution.manage | List university academic policies. |
| GET | `/institutions/:institutionId/academic-policies/:policyId` | Academic profiles/policies | Protected | institution.manage | Get university academic policy. |
| PATCH | `/institutions/:institutionId/academic-policies/:policyId` | Academic profiles/policies | Protected | institution.manage | Update university academic policy. |
| POST | `/institutions/:institutionId/academic-policies/school` | School academic policies | Protected | institution.manage | Create school academic policy. |
| GET | `/institutions/:institutionId/academic-policies/school` | School academic policies | Protected | institution.manage | List school academic policies. |
| GET | `/institutions/:institutionId/academic-policies/school/:policyId` | School academic policies | Protected | institution.manage | Get school academic policy. |
| PATCH | `/institutions/:institutionId/academic-policies/school/:policyId` | School academic policies | Protected | institution.manage | Update school academic policy. |
| POST | `/institutions/:institutionId/academic-policies/school/:policyId/archive` | School academic policies | Protected | institution.manage | Archive school academic policy. |
| GET | `/institutions/:institutionId/academic-standing/university/summary` | Academic standing | Protected | section.manage | University standing summary. |
| GET | `/institutions/:institutionId/academic-standing/university/students` | Academic standing | Protected | section.manage | University standing student list. |
| GET | `/institutions/:institutionId/instructors/me/academic-standing/summary` | Academic standing | Protected | Instructor service scope | Instructor standing summary. |
| GET | `/institutions/:institutionId/instructors/me/academic-standing/students` | Academic standing | Protected | Instructor service scope | Instructor standing students. |
| GET | `/institutions/:institutionId/students/me/academic-profile` | Academic profiles | Protected | Student self service scope | Own academic profile. |
| GET | `/institutions/:institutionId/students/:studentMembershipId/academic-profile` | Academic profiles | Protected | membership.manage + provider checks | Staff student academic profile. |
| GET | `/institutions/:institutionId/school-outcomes/students/:studentMembershipId/semesters/:semesterId/report-card` | School outcomes | Protected | class.manage | School semester report card. |
| GET | `/institutions/:institutionId/school-outcomes/students/:studentMembershipId/academic-years/:academicYearId/report-card` | School outcomes | Protected | class.manage | School yearly report card. |
| GET | `/institutions/:institutionId/school-outcomes/classes/:schoolClassId/academic-years/:academicYearId/promotion-summary` | School outcomes | Protected | class.manage | Class promotion summary. |
| GET | `/institutions/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary` | School outcomes | Protected | class.manage | Admin promotion dashboard summary. |
| GET | `/institutions/:institutionId/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students` | School outcomes | Protected | class.manage | Admin promotion dashboard students. |
| GET | `/institutions/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/summary` | School outcomes | Protected | Instructor service scope | Instructor section outcome summary. |
| GET | `/institutions/:institutionId/instructors/me/school-outcomes/academic-years/:academicYearId/promotion-dashboard/students` | School outcomes | Protected | Instructor service scope | Instructor section outcome rows. |
| POST | `/institutions/:institutionId/school-outcomes/students/:studentMembershipId/academic-years/:academicYearId/finalize` | School outcomes | Protected | class.manage | Finalize school yearly outcome. |
| PATCH | `/institutions/:institutionId/school-outcomes/final-outcomes/:outcomeId/override` | School outcomes | Protected | class.manage | Override school final outcome. |
| GET | `/institutions/:institutionId/school-outcomes/students/:studentMembershipId/academic-years/:academicYearId/final-outcome` | School outcomes | Protected | class.manage | Read school final outcome. |
| POST | `/institutions/:institutionId/departments` | Departments | Protected | department.manage | Create department. |
| GET | `/institutions/:institutionId/departments` | Departments | Protected | Institution access | List departments. |
| GET | `/institutions/:institutionId/departments/:departmentId` | Departments | Protected | Institution access | Get department. |
| PATCH | `/institutions/:institutionId/departments/:departmentId` | Departments | Protected | department.manage | Update department. |
| DELETE | `/institutions/:institutionId/departments/:departmentId` | Departments | Protected | department.manage | Delete department. |
| POST | `/institutions/:institutionId/class-levels` | Classes/class levels | Protected | class.manage | Create class level. |
| GET | `/institutions/:institutionId/class-levels` | Classes/class levels | Protected | class.manage | List class levels. |
| GET | `/institutions/:institutionId/class-levels/:classLevelId` | Classes/class levels | Protected | class.manage | Get class level. |
| PATCH | `/institutions/:institutionId/class-levels/:classLevelId` | Classes/class levels | Protected | class.manage | Update class level. |
| POST | `/institutions/:institutionId/classes` | Classes/class levels | Protected | class.manage | Create school class. |
| GET | `/institutions/:institutionId/classes` | Classes/class levels | Protected | class.manage | List school classes. |
| GET | `/institutions/:institutionId/classes/:classId` | Classes/class levels | Protected | class.manage | Get school class. |
| PATCH | `/institutions/:institutionId/classes/:classId` | Classes/class levels | Protected | class.manage | Update school class. |
| POST | `/institutions/:institutionId/classes/:classId/students` | Classes/class levels | Protected | class.manage | Assign student to school class. |
| GET | `/institutions/:institutionId/classes/:classId/students` | Classes/class levels | Protected | class.manage | List class assignments. |
| GET | `/institutions/:institutionId/classes/:classId/students/:assignmentId` | Classes/class levels | Protected | class.manage | Get class assignment. |
| PATCH | `/institutions/:institutionId/classes/:classId/students/:assignmentId/status` | Classes/class levels | Protected | class.manage | Update class assignment status. |
| POST | `/institutions/:institutionId/departments/:departmentId/subjects` | Subjects | Protected | subject.manage | Create university subject. |
| POST | `/institutions/:institutionId/class-levels/:classLevelId/subjects` | Subjects | Protected | subject.manage | Create school subject. |
| GET | `/institutions/:institutionId/subjects` | Subjects | Protected | subject.manage | List subjects. |
| GET | `/institutions/:institutionId/subjects/:subjectId` | Subjects | Protected | subject.manage | Get subject. |
| PATCH | `/institutions/:institutionId/subjects/:subjectId` | Subjects | Protected | subject.manage | Update subject. |
| DELETE | `/institutions/:institutionId/subjects/:subjectId` | Subjects | Protected | subject.manage | Delete subject. |
| POST | `/institutions/:institutionId/members` | Memberships/users | Protected | membership.manage | Create member. |
| GET | `/institutions/:institutionId/members` | Memberships/users | Protected | membership.manage | List members. |
| GET | `/institutions/:institutionId/members/me` | Memberships/users | Protected | Active institution membership | Get authenticated member/profile. |
| GET | `/institutions/:institutionId/members/:membershipId` | Memberships/users | Protected | membership.manage | Get member. |
| PATCH | `/institutions/:institutionId/members/:membershipId` | Memberships/users | Protected | membership.manage | Update member. |
| PATCH | `/institutions/:institutionId/members/:membershipId/status` | Memberships/users | Protected | membership.manage | Update member status. |
| POST | `/institutions/:institutionId/sections` | Sections | Protected | section.manage | Create section. |
| GET | `/institutions/:institutionId/sections` | Sections | Protected | section.read + service scope | List sections. |
| GET | `/institutions/:institutionId/sections/:sectionId` | Sections | Protected | section.read + service scope | Get section. |
| PATCH | `/institutions/:institutionId/sections/:sectionId` | Sections | Protected | section.manage | Update section. |
| DELETE | `/institutions/:institutionId/sections/:sectionId` | Sections | Protected | section.manage | Delete section. |
| POST | `/institutions/:institutionId/sections/:sectionId/sessions` | Section sessions | Protected | Service scope | Create section session. |
| GET | `/institutions/:institutionId/sections/:sectionId/sessions` | Section sessions | Protected | Service scope | List section sessions. |
| POST | `/institutions/:institutionId/sections/:sectionId/sessions/generate` | Section sessions | Protected | Service scope | Generate section sessions. |
| GET | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId` | Section sessions | Protected | Service scope | Get section session. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/status` | Section sessions | Protected | Service scope | Update session status. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId` | Section sessions | Protected | Service scope | Update session non-status fields. |
| POST | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/open` | Attendance | Protected | Service scope | Open attendance. |
| POST | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/qr-token` | Attendance | Protected | Service scope | Issue QR token. |
| PUT | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/manual` | Attendance | Protected | Service scope | Manual attendance upsert. |
| GET | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/roster` | Attendance | Protected | Service scope | Attendance roster. |
| POST | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/close` | Attendance | Protected | Service scope | Close attendance. |
| POST | `/institutions/:institutionId/sections/:sectionId/sessions/:sectionSessionId/attendance/check-in` | Attendance | Protected | Student self service scope | Student QR check-in. |
| GET | `/institutions/:institutionId/sections/:sectionId/attendance/analytics` | Attendance | Protected | Service scope | Section attendance analytics. |
| GET | `/institutions/:institutionId/students/me/attendance-history` | Attendance | Protected | Student self service scope | Own attendance history. |
| POST | `/institutions/:institutionId/sections/:sectionId/enrollments` | Enrollments | Protected | section.manage | Create enrollment. |
| GET | `/institutions/:institutionId/sections/:sectionId/enrollments` | Enrollments | Protected | section.manage | List enrollments. |
| GET | `/institutions/:institutionId/sections/:sectionId/enrollments/:enrollmentId` | Enrollments | Protected | section.manage | Get enrollment. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/enrollments/:enrollmentId/status` | Enrollments | Protected | section.manage | Update enrollment status. |
| GET | `/institutions/:institutionId/students/me/self-enrollment/sections` | Enrollments | Protected | enrollment.self_manage | Browse self-enrollment sections. |
| GET | `/institutions/:institutionId/students/me/self-enrollment/sections/:sectionId/eligibility` | Enrollments | Protected | enrollment.self_manage | Preview self-enrollment eligibility. |
| POST | `/institutions/:institutionId/students/me/self-enrollment/submissions` | Enrollments | Protected | enrollment.self_manage | Submit self-enrollment section set. |
| POST | `/institutions/:institutionId/sections/:sectionId/assessments` | Assessments/results | Protected | Service scope | Create assessment. |
| GET | `/institutions/:institutionId/sections/:sectionId/assessments` | Assessments/results | Protected | Service scope | List assessments. |
| GET | `/institutions/:institutionId/sections/:sectionId/assessments/:assessmentId` | Assessments/results | Protected | Service scope | Get assessment. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/assessments/:assessmentId` | Assessments/results | Protected | Service scope | Update assessment. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/status` | Assessments/results | Protected | Service scope | Update assessment status. |
| PUT | `/institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/results` | Assessments/results | Protected | Service scope | Bulk upsert results. |
| GET | `/institutions/:institutionId/sections/:sectionId/assessments/:assessmentId/results` | Assessments/results | Protected | Service scope | List assessment results. |
| GET | `/institutions/:institutionId/sections/:sectionId/results` | Assessments/results | Protected | Service scope | Section aggregate results. |
| GET | `/institutions/:institutionId/students/me/assessments` | Assessments/results | Protected | Student self service scope | Own visible assessments. |
| GET | `/institutions/:institutionId/students/me/results` | Assessments/results | Protected | Student self service scope | Own published results. |
| POST | `/institutions/:institutionId/sections/:sectionId/homeworks` | Homework/projects | Protected | Service scope | Create homework/project. |
| GET | `/institutions/:institutionId/sections/:sectionId/homeworks` | Homework/projects | Protected | Service scope | List section homework. |
| GET | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId` | Homework/projects | Protected | Service scope | Get homework. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId` | Homework/projects | Protected | Service scope | Update homework. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/status` | Homework/projects | Protected | Service scope | Update homework status. |
| GET | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions` | Homework/projects | Protected | Service scope | Homework submission roster. |
| PUT | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/enrollments/:enrollmentId/submission` | Homework/projects | Protected | Service scope | Mark offline submission. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions/:submissionId` | Homework/projects | Protected | Service scope | Update submission. |
| GET | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submissions/:submissionId/file` | Homework/projects | Protected | Service scope | Download private submission file. |
| GET | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submission` | Homework/projects | Protected | Student self service scope | Get own homework submission. |
| POST | `/institutions/:institutionId/sections/:sectionId/homeworks/:homeworkId/submission` | Homework/projects | Protected | Student self service scope | Submit homework file. |
| GET | `/institutions/:institutionId/students/me/homeworks` | Homework/projects | Protected | Student self service scope | Own visible homework. |
| POST | `/institutions/:institutionId/sections/:sectionId/materials` | Section materials | Protected | Service scope | Create material with PDF. |
| GET | `/institutions/:institutionId/sections/:sectionId/materials` | Section materials | Protected | Service scope | Staff list materials. |
| GET | `/institutions/:institutionId/sections/:sectionId/materials/:materialId` | Section materials | Protected | Service scope | Staff material detail. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/materials/:materialId` | Section materials | Protected | Service scope | Update/replace material. |
| PATCH | `/institutions/:institutionId/sections/:sectionId/materials/:materialId/status` | Section materials | Protected | Service scope | Update material status. |
| GET | `/institutions/:institutionId/sections/:sectionId/materials/:materialId/file` | Section materials | Protected | Service scope | Download private material file. |
| GET | `/institutions/:institutionId/students/me/materials` | Section materials | Protected | Student self service scope | Own published materials. |
| POST | `/institutions/:institutionId/semesters` | Semesters | Protected | semester.manage | Create semester. |
| GET | `/institutions/:institutionId/semesters` | Semesters | Protected | semester.manage | List semesters. |
| GET | `/institutions/:institutionId/semesters/active` | Semesters | Protected | Institution access | Get active semester. |
| GET | `/institutions/:institutionId/semesters/:semesterId` | Semesters | Protected | semester.manage | Get semester. |
| PATCH | `/institutions/:institutionId/semesters/:semesterId` | Semesters | Protected | semester.manage | Update semester. |
| DELETE | `/institutions/:institutionId/semesters/:semesterId` | Semesters | Protected | semester.manage | Delete semester. |
