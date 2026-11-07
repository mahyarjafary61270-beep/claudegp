import { describe, expect, it } from 'vitest';
import { canActOnRole, roleCan } from '@mg/shared';

describe('role permissions', () => {
  it('members can view and send but not manage', () => {
    expect(roleCan('MEMBER', 'view')).toBe(true);
    expect(roleCan('MEMBER', 'send_messages')).toBe(true);
    expect(roleCan('MEMBER', 'manage_channels')).toBe(false);
    expect(roleCan('MEMBER', 'manage_members')).toBe(false);
    expect(roleCan('MEMBER', 'manage_server')).toBe(false);
  });

  it('admins manage channels/members/messages/invites but not the server', () => {
    expect(roleCan('ADMIN', 'manage_channels')).toBe(true);
    expect(roleCan('ADMIN', 'manage_members')).toBe(true);
    expect(roleCan('ADMIN', 'manage_messages')).toBe(true);
    expect(roleCan('ADMIN', 'create_invite')).toBe(true);
    expect(roleCan('ADMIN', 'manage_server')).toBe(false);
  });

  it('owners can do everything', () => {
    expect(roleCan('OWNER', 'manage_server')).toBe(true);
    expect(roleCan('OWNER', 'manage_channels')).toBe(true);
  });
});

describe('role hierarchy for moderation actions', () => {
  it('nobody acts on an owner', () => {
    expect(canActOnRole('OWNER', 'OWNER')).toBe(false);
    expect(canActOnRole('ADMIN', 'OWNER')).toBe(false);
    expect(canActOnRole('MEMBER', 'OWNER')).toBe(false);
  });

  it('admins act only on members', () => {
    expect(canActOnRole('ADMIN', 'MEMBER')).toBe(true);
    expect(canActOnRole('ADMIN', 'ADMIN')).toBe(false);
  });

  it('owners act on admins and members', () => {
    expect(canActOnRole('OWNER', 'ADMIN')).toBe(true);
    expect(canActOnRole('OWNER', 'MEMBER')).toBe(true);
  });

  it('members act on nobody', () => {
    expect(canActOnRole('MEMBER', 'MEMBER')).toBe(false);
  });
});
