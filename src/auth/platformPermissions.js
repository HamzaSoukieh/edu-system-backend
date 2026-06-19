const PLATFORM_PERMISSIONS = Object.freeze([
    "platform.institutions.read",
    "platform.billing.read",
    "platform.webhooks.read",
    "platform.audit.read",
]);

const PLATFORM_ROLE_PERMISSIONS = Object.freeze({
    platform_owner: PLATFORM_PERMISSIONS,
});

function getPlatformRolePermissions(role) {
    const permissions = PLATFORM_ROLE_PERMISSIONS[role];
    return permissions ? [...permissions] : null;
}

module.exports = {
    PLATFORM_PERMISSIONS,
    PLATFORM_ROLE_PERMISSIONS,
    getPlatformRolePermissions,
};
