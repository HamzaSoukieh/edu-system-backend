const { resolveAllowedMaxCreditHours } = require("./universityAcademicPolicyService");
const {
    buildSubjectOutcomeSummaries,
    resolveBestAcademicOutcome,
    resolveBestAcademicOutcomeStatus,
} = require("./universityAcademicOutcomeService");
const {
    resolvePrerequisiteOutcomeStatus,
    resolveRepeatPolicy,
} = require("./universityRepeatPolicyService");

const SELF_ENROLLMENT_ENROLLABLE_SECTION_STATUSES = ["draft", "active"];
const SCHEDULE_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const SCHEDULE_CONFLICT_MESSAGE =
    "Selected section schedule conflicts with another enrolled or selected section.";
const SELF_ENROLLMENT_REASON_MESSAGES = {
    already_enrolled_in_section: "Student is already enrolled in the target section.",
    existing_section_enrollment_record: "Student already has an enrollment record for the target section.",
    section_full: "Section capacity is full.",
    missing_prerequisites: "One or more prerequisite subjects are not satisfied.",
    same_subject_already_passed_final: "Student already has a final-pass outcome for the target subject.",
    repeat_blocked_grade_improvement_not_allowed:
        "The active repeat policy does not allow repeating an improvable passed subject.",
    schedule_conflict: SCHEDULE_CONFLICT_MESSAGE,
    duplicate_subject_in_submission:
        "Self-enrollment submission cannot include multiple sections for the same subject.",
    projected_credit_load_exceeds_max: "Projected active-semester credit load exceeds the allowed maximum.",
    projected_credit_load_below_minimum_enrollment:
        "Projected active-semester credit load is below the policy minimum enrollment requirement.",
    near_graduation_exception_deferred:
        "Near-graduation minimum-enrollment exception is deferred until graduation requirement data exists.",
    prerequisite_requirements_satisfied: "All configured prerequisite subjects are satisfied.",
    no_prerequisites_configured: "No prerequisite subjects are configured for the target subject.",
    section_has_available_capacity: "Section still has available capacity.",
    no_prior_same_subject_final_pass: "Student does not have a prior final-pass outcome for the target subject.",
    projected_credit_load_within_allowed_max: "Projected active-semester credit load stays within the allowed maximum.",
    projected_credit_load_meets_minimum_enrollment:
        "Projected active-semester credit load meets the policy minimum enrollment requirement.",
    cumulative_gpa_used_for_policy_limit: "Cumulative GPA is part of the current policy load-limit calculation.",
    cumulative_gpa_not_available_for_policy_limit:
        "No cumulative GPA is available yet, so the default policy load limit applies.",
};

function createError(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeId(value) {
    if (!value) {
        return null;
    }

    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }

    if (typeof value.toString === "function") {
        const asString = value.toString().trim();
        return asString || null;
    }

    return null;
}

function normalizeString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeLowerString(value) {
    return normalizeString(value).toLowerCase();
}

function parseTimeToMinutes(rawValue, fieldName) {
    const value = normalizeString(rawValue);
    const match = value.match(/^(\d{1,2}):(\d{2})$/);

    if (!match) {
        throw createError(409, `${fieldName} must be in HH:mm format for self-enrollment schedule validation`);
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) {
        throw createError(409, `${fieldName} must be in HH:mm format for self-enrollment schedule validation`);
    }

    return hours * 60 + minutes;
}

function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
}

function ensureActiveStudentMembership(studentMembership) {
    if (!studentMembership || !studentMembership._id) {
        throw createError(500, "Membership context missing");
    }

    if (studentMembership.role !== "student") {
        throw createError(403, "Only students can preview self-enrollment eligibility");
    }

    if (studentMembership.status !== undefined && studentMembership.status !== "active") {
        throw createError(403, "Only active students can preview self-enrollment eligibility");
    }
}

function ensureActiveSemesterTargetContext({ activeSemester, targetSection }) {
    if (!activeSemester) {
        throw createError(404, "Active semester not found");
    }

    if (!targetSection) {
        throw createError(404, "Section not found");
    }

    if (!SELF_ENROLLMENT_ENROLLABLE_SECTION_STATUSES.includes(targetSection.status)) {
        throw createError(409, "Only draft or active sections can accept enrollments");
    }

    if (normalizeId(targetSection.semesterId) !== normalizeId(activeSemester._id)) {
        throw createError(409, "Section must belong to the active semester for self-enrollment eligibility");
    }
}

function ensureTargetSubjectEligibilityContext(targetSubject) {
    if (!targetSubject) {
        throw createError(404, "Subject not found");
    }

    if (targetSubject.status !== "active") {
        throw createError(409, "Subject must be active for self-enrollment eligibility");
    }

    if (!Number.isInteger(targetSubject.creditHours) || targetSubject.creditHours < 1) {
        throw createError(409, "Subject creditHours must be configured for university self-enrollment eligibility");
    }
}

function buildSelfEnrollmentScheduleEntries(section, source) {
    const sectionId = normalizeId(section?._id);
    if (!sectionId || !Array.isArray(section?.schedule) || section.schedule.length === 0) {
        throw createError(
            409,
            "Section schedule is missing or incomplete for self-enrollment schedule validation"
        );
    }

    return section.schedule.map((entry, index) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
            throw createError(409, `schedule[${index}] must be an object for self-enrollment schedule validation`);
        }

        const day = normalizeLowerString(entry.day);
        if (!SCHEDULE_DAYS.includes(day)) {
            throw createError(
                409,
                `schedule[${index}].day must be one of ${SCHEDULE_DAYS.join(", ")} for self-enrollment schedule validation`
            );
        }

        const startMinutes = parseTimeToMinutes(entry.startTime, `schedule[${index}].startTime`);
        const endMinutes = parseTimeToMinutes(entry.endTime, `schedule[${index}].endTime`);
        if (startMinutes >= endMinutes) {
            throw createError(
                409,
                `schedule[${index}].startTime must be before schedule[${index}].endTime for self-enrollment schedule validation`
            );
        }

        return {
            source,
            sectionId,
            sectionCode: section.code || null,
            sectionTitle: section.title || null,
            day,
            startTime: normalizeString(entry.startTime),
            endTime: normalizeString(entry.endTime),
            startMinutes,
            endMinutes,
        };
    });
}

function buildScheduleConflict(entry, conflictingEntry) {
    return {
        selectedSectionId: entry.sectionId,
        selectedSectionCode: entry.sectionCode,
        selectedSectionTitle: entry.sectionTitle,
        conflictingSectionId: conflictingEntry.sectionId,
        conflictingSectionCode: conflictingEntry.sectionCode,
        conflictingSectionTitle: conflictingEntry.sectionTitle,
        conflictingSource: conflictingEntry.source,
        day: entry.day,
        selectedStartTime: entry.startTime,
        selectedEndTime: entry.endTime,
        conflictingStartTime: conflictingEntry.startTime,
        conflictingEndTime: conflictingEntry.endTime,
    };
}

function buildScheduleConflictSummary({
    currentActiveSemesterSections = [],
    selections = [],
}) {
    const selectedSections = selections
        .map((selection) => selection?.targetSection || null)
        .filter(Boolean);
    const selectedEntries = selectedSections.flatMap((section) =>
        buildSelfEnrollmentScheduleEntries(section, "selected")
    );
    const currentEntries = currentActiveSemesterSections.flatMap((section) =>
        buildSelfEnrollmentScheduleEntries(section, "enrolled")
    );
    const conflicts = [];

    for (const selectedEntry of selectedEntries) {
        for (const currentEntry of currentEntries) {
            if (selectedEntry.sectionId === currentEntry.sectionId || selectedEntry.day !== currentEntry.day) {
                continue;
            }

            if (
                timeRangesOverlap(
                    currentEntry.startMinutes,
                    currentEntry.endMinutes,
                    selectedEntry.startMinutes,
                    selectedEntry.endMinutes
                )
            ) {
                conflicts.push(buildScheduleConflict(selectedEntry, currentEntry));
            }
        }
    }

    for (let leftIndex = 0; leftIndex < selectedEntries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < selectedEntries.length; rightIndex += 1) {
            const leftEntry = selectedEntries[leftIndex];
            const rightEntry = selectedEntries[rightIndex];
            if (leftEntry.sectionId === rightEntry.sectionId || leftEntry.day !== rightEntry.day) {
                continue;
            }

            if (
                timeRangesOverlap(
                    leftEntry.startMinutes,
                    leftEntry.endMinutes,
                    rightEntry.startMinutes,
                    rightEntry.endMinutes
                )
            ) {
                conflicts.push(buildScheduleConflict(leftEntry, rightEntry));
            }
        }
    }

    return {
        hasScheduleConflict: conflicts.length > 0,
        conflicts,
    };
}

function buildOutcomeMap(outcomes = []) {
    const outcomesBySubjectId = new Map();

    for (const outcome of outcomes) {
        const subjectId = normalizeId(outcome.subjectId);
        if (!subjectId) {
            continue;
        }

        if (!outcomesBySubjectId.has(subjectId)) {
            outcomesBySubjectId.set(subjectId, []);
        }

        outcomesBySubjectId.get(subjectId).push(outcome);
    }

    return outcomesBySubjectId;
}

function createReasonItem(code, details = {}) {
    return {
        code,
        message: SELF_ENROLLMENT_REASON_MESSAGES[code] || "Self-enrollment rule evaluated.",
        ...details,
    };
}

function toSelfEnrollmentEligibilitySummary(decision) {
    if (!decision || typeof decision !== "object") {
        return {
            isEligible: false,
            blockingReasonCodes: [],
        };
    }

    return {
        isEligible: Boolean(decision.isEligible),
        blockingReasonCodes: Array.isArray(decision.blockingReasonCodes)
            ? [...decision.blockingReasonCodes]
            : [],
    };
}

function buildPrerequisiteChecks({
    targetSubject,
    prerequisiteSubjects = [],
    outcomesBySubjectId = new Map(),
    subjectOutcomeSummaryBySubjectId,
    repeatPolicy,
}) {
    const prerequisiteSubjectIds = Array.isArray(targetSubject?.prerequisiteSubjectIds)
        ? targetSubject.prerequisiteSubjectIds.map((subjectId) => normalizeId(subjectId)).filter(Boolean)
        : [];

    const prerequisiteSubjectById = new Map(
        prerequisiteSubjects
            .map((prerequisiteSubject) => [normalizeId(prerequisiteSubject?._id), prerequisiteSubject])
            .filter(([subjectId]) => Boolean(subjectId))
    );

    return prerequisiteSubjectIds.map((prerequisiteSubjectId) => {
        const prerequisiteOutcomeSummary = subjectOutcomeSummaryBySubjectId.get(prerequisiteSubjectId) || null;
        const outcomeStatus = resolvePrerequisiteOutcomeStatus({
            outcomes: outcomesBySubjectId.get(prerequisiteSubjectId) || [],
            repeatPolicy,
            resolveBestAttempt: resolveBestAcademicOutcome,
        }) || prerequisiteOutcomeSummary?.bestOutcomeStatus || null;
        const prerequisiteSubject = prerequisiteSubjectById.get(prerequisiteSubjectId) || null;

        return {
            subjectId: prerequisiteSubjectId,
            subjectCode: prerequisiteSubject?.code || null,
            subjectName: prerequisiteSubject?.name || null,
            met: outcomeStatus === "passed_improvable" || outcomeStatus === "passed_final",
            outcomeStatus,
        };
    });
}

function calculateCurrentCreditHours({
    currentActiveSemesterSections = [],
    currentActiveSemesterSubjects = [],
}) {
    const currentActiveSemesterSubjectById = new Map(
        currentActiveSemesterSubjects
            .map((subject) => [normalizeId(subject?._id), subject])
            .filter(([subjectId]) => Boolean(subjectId))
    );
    const uniqueCurrentLoadSubjectIds = [...new Set(
        currentActiveSemesterSections
            .map((currentSection) => normalizeId(currentSection?.subjectId))
            .filter(Boolean)
    )];

    // Self-enrollment registration load is intentionally counted once per unique subject
    // across currently enrollable active-semester sections, not once per section row.
    return uniqueCurrentLoadSubjectIds.reduce((sum, subjectId) => {
        const currentSubject = currentActiveSemesterSubjectById.get(subjectId) || null;
        if (!currentSubject || !Number.isInteger(currentSubject.creditHours) || currentSubject.creditHours < 1) {
            return sum;
        }

        return sum + currentSubject.creditHours;
    }, 0);
}

function calculateSelectionCreditHours(selections = []) {
    const selectedSubjectById = new Map();

    for (const selection of selections) {
        const subject = selection?.targetSubject || null;
        const subjectId = normalizeId(subject?._id);
        if (!subjectId || selectedSubjectById.has(subjectId)) {
            continue;
        }

        selectedSubjectById.set(subjectId, subject);
    }

    return [...selectedSubjectById.values()].reduce((sum, subject) => {
        if (!Number.isInteger(subject?.creditHours) || subject.creditHours < 1) {
            return sum;
        }

        return sum + subject.creditHours;
    }, 0);
}

function countUniqueSelectionSubjects(selections = []) {
    return new Set(
        selections
            .map((selection) => normalizeId(selection?.targetSubject?._id))
            .filter(Boolean)
    ).size;
}

function buildSubmissionDuplicateSubjectSummary(selections = []) {
    const selectionGroupsBySubjectId = new Map();

    for (const selection of selections) {
        const targetSubject = selection?.targetSubject || null;
        const targetSection = selection?.targetSection || null;
        const subjectId = normalizeId(targetSubject?._id) || normalizeId(targetSection?.subjectId);
        const sectionId = normalizeId(targetSection?._id);

        if (!subjectId || !sectionId) {
            continue;
        }

        if (!selectionGroupsBySubjectId.has(subjectId)) {
            selectionGroupsBySubjectId.set(subjectId, {
                subjectId,
                subjectCode: targetSubject?.code || null,
                subjectName: targetSubject?.name || null,
                sectionIds: [],
            });
        }

        selectionGroupsBySubjectId.get(subjectId).sectionIds.push(sectionId);
    }

    const duplicateSubjects = [...selectionGroupsBySubjectId.values()].filter(
        (subjectGroup) => subjectGroup.sectionIds.length > 1
    );

    return {
        hasDuplicateSubjects: duplicateSubjects.length > 0,
        duplicateCount: duplicateSubjects.length,
        duplicateSubjects,
    };
}

function buildCapacitySummary({ targetSection, currentSectionSeatCount }) {
    const capacity =
        Number.isInteger(targetSection?.capacity) && targetSection.capacity >= 1 ? targetSection.capacity : null;
    const enrolledSeatCount =
        Number.isInteger(currentSectionSeatCount) && currentSectionSeatCount >= 0 ? currentSectionSeatCount : 0;

    return {
        capacity,
        enrolledSeatCount,
        remainingSeatCount: capacity === null ? null : Math.max(capacity - enrolledSeatCount, 0),
        isFull: capacity !== null && enrolledSeatCount >= capacity,
    };
}

function resolveSelfEnrollmentEligibility({
    studentMembership,
    activeSemester,
    targetSection,
    targetSubject,
    policy,
    existingSectionEnrollment = null,
    currentSectionSeatCount = 0,
    academicOutcomeSummary = null,
    prerequisiteSubjects = [],
    currentActiveSemesterSections = [],
    currentActiveSemesterSubjects = [],
    enforceMinimumEnrollment = true,
    enforceMaxAllowedCreditHours = true,
}) {
    ensureActiveStudentMembership(studentMembership);
    ensureActiveSemesterTargetContext({ activeSemester, targetSection });
    ensureTargetSubjectEligibilityContext(targetSubject);

    if (!policy) {
        throw createError(500, "Academic policy context missing");
    }

    const repeatPolicy = resolveRepeatPolicy(policy);
    const outcomes = academicOutcomeSummary?.outcomes || [];
    const subjectOutcomeSummaries = Array.isArray(academicOutcomeSummary?.subjectOutcomeSummaries)
        ? academicOutcomeSummary.subjectOutcomeSummaries
        : buildSubjectOutcomeSummaries(outcomes);
    const subjectOutcomeSummaryBySubjectId = new Map(
        subjectOutcomeSummaries
            .map((subjectOutcomeSummary) => [normalizeId(subjectOutcomeSummary?.subjectId), subjectOutcomeSummary])
            .filter(([subjectId]) => Boolean(subjectId))
    );
    const outcomesBySubjectId = buildOutcomeMap(outcomes);
    const prerequisiteChecks = buildPrerequisiteChecks({
        targetSubject,
        prerequisiteSubjects,
        outcomesBySubjectId,
        subjectOutcomeSummaryBySubjectId,
        repeatPolicy,
    });

    const sameSubjectOutcomeSummary =
        subjectOutcomeSummaryBySubjectId.get(normalizeId(targetSubject._id)) || null;
    const sameSubjectOutcomes = outcomesBySubjectId.get(normalizeId(targetSubject._id)) || [];
    const sameSubjectOutcomeStatus =
        sameSubjectOutcomeSummary?.bestOutcomeStatus ||
        resolveBestAcademicOutcomeStatus(sameSubjectOutcomes);

    const blockingReasons = [];
    if (existingSectionEnrollment) {
        const duplicateEnrollmentCode =
            existingSectionEnrollment.status === "enrolled"
                ? "already_enrolled_in_section"
                : "existing_section_enrollment_record";
        blockingReasons.push(
            createReasonItem(duplicateEnrollmentCode, {
                existingEnrollmentStatus: existingSectionEnrollment.status || null,
            })
        );
    }

    const capacitySummary = buildCapacitySummary({
        targetSection,
        currentSectionSeatCount,
    });
    if (capacitySummary.isFull) {
        blockingReasons.push(
            createReasonItem("section_full", {
                capacity: capacitySummary.capacity,
                enrolledSeatCount: capacitySummary.enrolledSeatCount,
                remainingSeatCount: capacitySummary.remainingSeatCount,
            })
        );
    }

    const prerequisiteSummary = {
        requiredCount: prerequisiteChecks.length,
        satisfiedCount: prerequisiteChecks.filter((check) => check.met).length,
        missingCount: prerequisiteChecks.filter((check) => !check.met).length,
        checks: prerequisiteChecks,
        method: repeatPolicy.prerequisiteMethod,
    };
    if (prerequisiteChecks.some((check) => !check.met)) {
        blockingReasons.push(
            createReasonItem("missing_prerequisites", {
                missingPrerequisiteSubjectIds: prerequisiteChecks
                    .filter((check) => !check.met)
                    .map((check) => check.subjectId),
            })
        );
    }

    if (sameSubjectOutcomeStatus === "passed_final" && repeatPolicy.blockRepeatAfterFinalPass) {
        blockingReasons.push(
            createReasonItem("same_subject_already_passed_final", {
                outcomeStatus: sameSubjectOutcomeStatus,
                attemptCount: sameSubjectOutcomeSummary?.attemptCount || 0,
                repeatPolicyReasonCode: "repeat_blocked_after_final_pass",
            })
        );
    }

    if (sameSubjectOutcomeStatus === "passed_improvable" && !repeatPolicy.allowGradeImprovementRepeats) {
        blockingReasons.push(
            createReasonItem("repeat_blocked_grade_improvement_not_allowed", {
                outcomeStatus: sameSubjectOutcomeStatus,
                attemptCount: sameSubjectOutcomeSummary?.attemptCount || sameSubjectOutcomes.length,
            })
        );
    }

    const currentCreditHours = calculateCurrentCreditHours({
        currentActiveSemesterSections,
        currentActiveSemesterSubjects,
    });
    const targetCreditHours = targetSubject.creditHours;
    const projectedCreditHours = currentCreditHours + targetCreditHours;
    const cumulativeGpa = academicOutcomeSummary?.summary?.cumulativeGpa ?? null;
    const maxAllowedCreditHours = resolveAllowedMaxCreditHours({
        policy,
        cumulativeGpa,
    });
    const qualifiesForOverloadByGpa =
        typeof cumulativeGpa === "number" && cumulativeGpa >= policy.overloadMinGpa;
    const warnings = [];
    const infos = [];

    if (projectedCreditHours > maxAllowedCreditHours) {
        const maxLoadReason = createReasonItem("projected_credit_load_exceeds_max", {
            projectedCreditHours,
            maxAllowedCreditHours,
        });
        (enforceMaxAllowedCreditHours ? blockingReasons : warnings).push(
            maxLoadReason
        );
    }

    if (projectedCreditHours < policy.minimumEnrollmentCreditHours) {
        const minimumLoadReason = createReasonItem("projected_credit_load_below_minimum_enrollment", {
            projectedCreditHours,
            minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
        });
        (enforceMinimumEnrollment ? blockingReasons : warnings).push(
            minimumLoadReason
        );
    }

    if (!capacitySummary.isFull) {
        infos.push(
            createReasonItem("section_has_available_capacity", {
                capacity: capacitySummary.capacity,
                enrolledSeatCount: capacitySummary.enrolledSeatCount,
                remainingSeatCount: capacitySummary.remainingSeatCount,
            })
        );
    }

    if (!prerequisiteChecks.length) {
        infos.push(createReasonItem("no_prerequisites_configured"));
    } else if (prerequisiteSummary.missingCount === 0) {
        infos.push(
            createReasonItem("prerequisite_requirements_satisfied", {
                requiredCount: prerequisiteSummary.requiredCount,
            })
        );
    }

    if (sameSubjectOutcomeStatus !== "passed_final" || !repeatPolicy.blockRepeatAfterFinalPass) {
        infos.push(
            createReasonItem("no_prior_same_subject_final_pass", {
                outcomeStatus: sameSubjectOutcomeStatus,
                attemptCount: sameSubjectOutcomeSummary?.attemptCount || 0,
            })
        );
    }

    if (projectedCreditHours <= maxAllowedCreditHours) {
        infos.push(
            createReasonItem("projected_credit_load_within_allowed_max", {
                projectedCreditHours,
                maxAllowedCreditHours,
            })
        );
    }

    if (projectedCreditHours >= policy.minimumEnrollmentCreditHours) {
        infos.push(
            createReasonItem("projected_credit_load_meets_minimum_enrollment", {
                projectedCreditHours,
                minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
            })
        );
    }

    infos.push(
        createReasonItem(
            typeof cumulativeGpa === "number"
                ? "cumulative_gpa_used_for_policy_limit"
                : "cumulative_gpa_not_available_for_policy_limit",
            {
                cumulativeGpa,
                overloadMinGpa: policy.overloadMinGpa,
                qualifiesForOverloadByGpa,
            }
        )
    );

    const blockingReasonCodes = blockingReasons.map((reason) => reason.code);
    const duplicateEnrollmentSummary = {
        hasExistingEnrollment: Boolean(existingSectionEnrollment),
        existingEnrollmentStatus: existingSectionEnrollment?.status || null,
        blockingReasonCode: blockingReasonCodes.find((code) =>
            ["already_enrolled_in_section", "existing_section_enrollment_record"].includes(code)
        ) || null,
    };
    const sameSubjectSummary = {
        bestOutcomeStatus: sameSubjectOutcomeStatus,
        attemptCount: sameSubjectOutcomeSummary?.attemptCount || 0,
        hasFailedAttempt: sameSubjectOutcomeSummary?.hasFailedAttempt || false,
        hasPassedImprovableAttempt: sameSubjectOutcomeSummary?.hasPassedImprovableAttempt || false,
        hasPassedFinalAttempt: sameSubjectOutcomeSummary?.hasPassedFinalAttempt || false,
        blockingReasonCode:
            sameSubjectOutcomeStatus === "passed_final" && repeatPolicy.blockRepeatAfterFinalPass
                ? "same_subject_already_passed_final"
                : sameSubjectOutcomeStatus === "passed_improvable" && !repeatPolicy.allowGradeImprovementRepeats
                  ? "repeat_blocked_grade_improvement_not_allowed"
                  : null,
        repeatPolicy: {
            allowGradeImprovementRepeats: repeatPolicy.allowGradeImprovementRepeats,
            blockRepeatAfterFinalPass: repeatPolicy.blockRepeatAfterFinalPass,
        },
    };
    const loadSummary = {
        currentCreditHours,
        targetCreditHours,
        projectedCreditHours,
        cumulativeGpa,
        minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
        maxAllowedCreditHours,
        belowMinimumEnrollment: projectedCreditHours < policy.minimumEnrollmentCreditHours,
        exceedsAllowedMax: projectedCreditHours > maxAllowedCreditHours,
        overloadMinGpa: policy.overloadMinGpa,
        qualifiesForOverloadByGpa,
        minimumEnrollmentCheckDeferredToSubmission: !enforceMinimumEnrollment,
        maxCreditCheckDeferredToSubmission: !enforceMaxAllowedCreditHours,
    };

    return {
        isEligible: blockingReasons.length === 0,
        blockingReasons,
        blockingReasonCodes,
        warnings,
        infos,
        currentCreditHours,
        targetCreditHours,
        projectedCreditHours,
        minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
        maxAllowedCreditHours,
        cumulativeGpa,
        prerequisiteChecks,
        sameSubjectOutcomeStatus,
        sameSubjectOutcomeSummary,
        duplicateEnrollment: duplicateEnrollmentSummary,
        prerequisiteSummary,
        sameSubjectSummary,
        sectionCapacity: capacitySummary,
        capacitySummary,
        loadSummary,
        policySummary: {
            minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
            defaultMaxCreditHours: policy.defaultMaxCreditHours,
            overloadMinGpa: policy.overloadMinGpa,
            overloadMaxCreditHours: policy.overloadMaxCreditHours,
            maxAllowedCreditHours,
            qualifiesForOverloadByGpa,
            repeatPolicy,
        },
    };
}

function resolveSelfEnrollmentSubmissionEligibility({
    studentMembership,
    activeSemester,
    policy,
    academicOutcomeSummary = null,
    currentActiveSemesterSections = [],
    currentActiveSemesterSubjects = [],
    selections = [],
}) {
    ensureActiveStudentMembership(studentMembership);

    if (!policy) {
        throw createError(500, "Academic policy context missing");
    }

    const repeatPolicy = resolveRepeatPolicy(policy);
    if (!Array.isArray(selections) || !selections.length) {
        throw createError(500, "Self-enrollment submission context missing");
    }

    const sectionDecisions = selections.map((selection) => {
        const targetSection = selection?.targetSection || null;
        const targetSubject = selection?.targetSubject || null;
        const eligibility = resolveSelfEnrollmentEligibility({
            studentMembership,
            activeSemester,
            targetSection,
            targetSubject,
            policy,
            existingSectionEnrollment: selection?.existingSectionEnrollment || null,
            currentSectionSeatCount: selection?.currentSectionSeatCount || 0,
            academicOutcomeSummary,
            prerequisiteSubjects: selection?.prerequisiteSubjects || [],
            currentActiveSemesterSections,
            currentActiveSemesterSubjects,
            enforceMinimumEnrollment: false,
            enforceMaxAllowedCreditHours: false,
        });

        return {
            sectionId: normalizeId(targetSection?._id),
            sectionCode: targetSection?.code || null,
            sectionTitle: targetSection?.title || null,
            subjectId: normalizeId(targetSubject?._id),
            subjectCode: targetSubject?.code || null,
            subjectName: targetSubject?.name || null,
            creditHours: Number.isInteger(targetSubject?.creditHours) ? targetSubject.creditHours : null,
            eligibility,
        };
    });

    const blockingReasons = [];
    for (const sectionDecision of sectionDecisions) {
        for (const reason of sectionDecision.eligibility.blockingReasons) {
            blockingReasons.push({
                ...reason,
                sectionId: sectionDecision.sectionId,
                subjectId: sectionDecision.subjectId,
            });
        }
    }

    const currentCreditHours = calculateCurrentCreditHours({
        currentActiveSemesterSections,
        currentActiveSemesterSubjects,
    });
    const selectedCreditHours = calculateSelectionCreditHours(selections);
    const projectedCreditHours = currentCreditHours + selectedCreditHours;
    const cumulativeGpa = academicOutcomeSummary?.summary?.cumulativeGpa ?? null;
    const maxAllowedCreditHours = resolveAllowedMaxCreditHours({
        policy,
        cumulativeGpa,
    });
    const qualifiesForOverloadByGpa =
        typeof cumulativeGpa === "number" && cumulativeGpa >= policy.overloadMinGpa;
    const duplicateSubjectSummary = buildSubmissionDuplicateSubjectSummary(selections);
    const warnings = [];
    const infos = [];

    if (duplicateSubjectSummary.hasDuplicateSubjects) {
        blockingReasons.push(
            createReasonItem("duplicate_subject_in_submission", {
                duplicateSubjects: duplicateSubjectSummary.duplicateSubjects,
            })
        );
    }

    const scheduleConflictSummary = buildScheduleConflictSummary({
        currentActiveSemesterSections,
        selections,
    });
    if (scheduleConflictSummary.hasScheduleConflict) {
        blockingReasons.push(
            createReasonItem("schedule_conflict", {
                conflicts: scheduleConflictSummary.conflicts,
            })
        );
    }

    if (projectedCreditHours > maxAllowedCreditHours) {
        blockingReasons.push(
            createReasonItem("projected_credit_load_exceeds_max", {
                projectedCreditHours,
                maxAllowedCreditHours,
            })
        );
    } else {
        infos.push(
            createReasonItem("projected_credit_load_within_allowed_max", {
                projectedCreditHours,
                maxAllowedCreditHours,
            })
        );
    }

    if (projectedCreditHours < policy.minimumEnrollmentCreditHours) {
        blockingReasons.push(
            createReasonItem("projected_credit_load_below_minimum_enrollment", {
                projectedCreditHours,
                minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
                nearGraduationExceptionApplied: false,
                nearGraduationExceptionDeferred: true,
                remainingGraduationCreditHours: null,
            })
        );
        warnings.push(createReasonItem("near_graduation_exception_deferred"));
    } else {
        infos.push(
            createReasonItem("projected_credit_load_meets_minimum_enrollment", {
                projectedCreditHours,
                minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
            })
        );
    }

    infos.push(
        createReasonItem(
            typeof cumulativeGpa === "number"
                ? "cumulative_gpa_used_for_policy_limit"
                : "cumulative_gpa_not_available_for_policy_limit",
            {
                cumulativeGpa,
                overloadMinGpa: policy.overloadMinGpa,
                qualifiesForOverloadByGpa,
            }
        )
    );

    // TODO/verify: the existing reusable section schedule helpers are room-booking oriented.
    // Add student schedule overlap validation here once a shared non-room-specific schedule helper exists.
    const blockingReasonCodes = [];
    const seenBlockingReasonCodes = new Set();
    for (const blockingReason of blockingReasons) {
        if (seenBlockingReasonCodes.has(blockingReason.code)) {
            continue;
        }

        seenBlockingReasonCodes.add(blockingReason.code);
        blockingReasonCodes.push(blockingReason.code);
    }

    return {
        isEligible: blockingReasons.length === 0,
        blockingReasons,
        blockingReasonCodes,
        warnings,
        infos,
        currentCreditHours,
        selectedCreditHours,
        projectedCreditHours,
        minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
        maxAllowedCreditHours,
        cumulativeGpa,
        sectionDecisions,
        duplicateSubjectSummary,
        scheduleConflictSummary,
        loadSummary: {
            currentCreditHours,
            selectedCreditHours,
            selectedSectionCount: sectionDecisions.length,
            selectedSubjectCount: countUniqueSelectionSubjects(selections),
            projectedCreditHours,
            cumulativeGpa,
            minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
            maxAllowedCreditHours,
            belowMinimumEnrollment: projectedCreditHours < policy.minimumEnrollmentCreditHours,
            exceedsAllowedMax: projectedCreditHours > maxAllowedCreditHours,
            overloadMinGpa: policy.overloadMinGpa,
            qualifiesForOverloadByGpa,
            nearGraduationExceptionApplied: false,
            nearGraduationExceptionDeferred: true,
            remainingGraduationCreditHours: null,
            graduationRequirementDataAvailable: false,
        },
        policySummary: {
            minimumEnrollmentCreditHours: policy.minimumEnrollmentCreditHours,
            defaultMaxCreditHours: policy.defaultMaxCreditHours,
            overloadMinGpa: policy.overloadMinGpa,
            overloadMaxCreditHours: policy.overloadMaxCreditHours,
            maxAllowedCreditHours,
            qualifiesForOverloadByGpa,
            repeatPolicy,
        },
    };
}

module.exports = {
    SELF_ENROLLMENT_ENROLLABLE_SECTION_STATUSES,
    SELF_ENROLLMENT_REASON_MESSAGES,
    calculateCurrentCreditHours,
    timeRangesOverlap,
    buildScheduleConflictSummary,
    toSelfEnrollmentEligibilitySummary,
    resolveSelfEnrollmentEligibility,
    resolveSelfEnrollmentSubmissionEligibility,
};
