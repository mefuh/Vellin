import {
  ALL_PERMISSIONS,
  DEFAULT_GUEST_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  type RoomPermissions,
  type RoomRole,
} from '@vellin/shared';

export type PermissionKey = keyof RoomPermissions;

export function getEffectivePermissions(
  role: RoomRole,
  customJson: string | null | undefined,
): RoomPermissions {
  if (role === 'superadmin' || role === 'owner' || role === 'admin') {
    return { ...ALL_PERMISSIONS };
  }
  if (role === 'guest') return { ...DEFAULT_GUEST_PERMISSIONS };
  if (!customJson) return { ...DEFAULT_MEMBER_PERMISSIONS };
  try {
    const parsed = JSON.parse(customJson) as Partial<RoomPermissions>;
    return { ...DEFAULT_MEMBER_PERMISSIONS, ...parsed };
  } catch {
    return { ...DEFAULT_MEMBER_PERMISSIONS };
  }
}

export function serializeMemberPermissions(perms: Partial<RoomPermissions>): string {
  const sanitized: Partial<RoomPermissions> = {};
  if (typeof perms.canPlayPause === 'boolean') sanitized.canPlayPause = perms.canPlayPause;
  if (typeof perms.canSeek === 'boolean') sanitized.canSeek = perms.canSeek;
  if (typeof perms.canSetVideoUrl === 'boolean') sanitized.canSetVideoUrl = perms.canSetVideoUrl;
  if (typeof perms.canManagePlaylist === 'boolean') sanitized.canManagePlaylist = perms.canManagePlaylist;
  return JSON.stringify(sanitized);
}
