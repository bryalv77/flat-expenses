import type { AppMode } from '@/lib/appMode';

/** What the Profile/Settings screens show; local mode has no account, so account-bound items disappear. */
export function profileItems(mode: AppMode) {
  const cloud = mode === 'cloud';
  return {
    changePassword: cloud,
    deleteAccount: cloud,
    documents: cloud,
    invitations: cloud,
    signOut: cloud,
    leaveLocalMode: !cloud,
    dataLossNotice: !cloud,
    localData: !cloud,
  };
}

/** House-tab entry points; invites and join-house need other people's accounts. */
export function houseActions(mode: AppMode) {
  const cloud = mode === 'cloud';
  return { invite: cloud, joinHouse: cloud, addGuest: true };
}
