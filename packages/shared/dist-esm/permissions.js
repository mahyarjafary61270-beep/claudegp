const MEMBER_ACTIONS = ['view', 'send_messages'];
const ADMIN_ACTIONS = [...MEMBER_ACTIONS, 'manage_channels', 'manage_members', 'manage_messages', 'create_invite'];
const OWNER_ACTIONS = [...ADMIN_ACTIONS, 'manage_server'];
export function roleCan(role, action) {
    switch (role) {
        case 'OWNER':
            return OWNER_ACTIONS.includes(action);
        case 'ADMIN':
            return ADMIN_ACTIONS.includes(action);
        default:
            return MEMBER_ACTIONS.includes(action);
    }
}
/** OWNER cannot be kicked/banned/demoted by anyone but themselves (transfer). */
export function canActOnRole(actorRole, targetRole) {
    if (targetRole === 'OWNER')
        return false;
    if (actorRole === 'OWNER')
        return true;
    if (actorRole === 'ADMIN')
        return targetRole === 'MEMBER';
    return false;
}
