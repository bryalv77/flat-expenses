import { houseActions, profileItems } from './localMode';

describe('profileItems', () => {
  it('local mode hides account-only items and shows the local ones', () => {
    const p = profileItems('local');
    expect(p).toMatchObject({ changePassword: false, deleteAccount: false, documents: false, invitations: false, signOut: false });
    expect(p).toMatchObject({ leaveLocalMode: true, dataLossNotice: true, localData: true });
  });
  it('cloud mode is unchanged', () => {
    const p = profileItems('cloud');
    expect(p).toMatchObject({ changePassword: true, deleteAccount: true, documents: true, invitations: true, signOut: true });
    expect(p).toMatchObject({ leaveLocalMode: false, dataLossNotice: false, localData: false });
  });
});

describe('houseActions', () => {
  it('local mode: guest roommate only, no invite or join-house', () => {
    expect(houseActions('local')).toEqual({ invite: false, joinHouse: false, addGuest: true });
  });
  it('cloud mode: invite and join-house stay', () => {
    expect(houseActions('cloud')).toEqual({ invite: true, joinHouse: true, addGuest: true });
  });
});
