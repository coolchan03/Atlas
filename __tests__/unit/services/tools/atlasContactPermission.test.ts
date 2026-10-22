jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  NativeModules: { AtlasContacts: {
    lookupName: jest.fn().mockResolvedValue([
      { name: 'Taylor Smith', number: '+15551230000' },
      { name: 'Taylor Adams', number: '+15551239999' },
    ]),
  } },
  PermissionsAndroid: {
    PERMISSIONS: { READ_CONTACTS: 'android.permission.READ_CONTACTS' },
    RESULTS: { GRANTED: 'granted', DENIED: 'denied' },
    request: jest.fn().mockResolvedValue('granted'),
  },
}));
jest.mock('../../../../src/atlasTools/deviceTools', () => ({
  confirm: jest.fn().mockResolvedValue(true),
}));
import { NativeModules, PermissionsAndroid } from 'react-native';
import * as DT from '../../../../src/atlasTools/deviceTools';
import { lookupNamedContact } from '../../../../src/services/tools/contactLookup';

describe('Phone contacts permission and draft workflow', () => {
  beforeEach(() => jest.clearAllMocks());
  it('asks permission before searching and requires disambiguation', async () => {
    const result = await lookupNamedContact('Taylor');
    expect(DT.confirm).toHaveBeenCalledWith(
      'Search contacts?', expect.stringContaining('Taylor'), 'Search');
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
    expect(NativeModules.AtlasContacts.lookupName).toHaveBeenCalledWith('Taylor');
    expect(result).toContain('Taylor Smith');
    expect(result).toContain('ask the user which one');
    expect(result).toContain('No message was sent');
  });
  it('does not inspect contacts after user refusal', async () => {
    (DT.confirm as jest.Mock).mockResolvedValueOnce(false);
    expect(await lookupNamedContact('Taylor')).toContain('cancelled');
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
    expect(NativeModules.AtlasContacts.lookupName).not.toHaveBeenCalled();
  });
  it('does not inspect contacts after Android permission refusal', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValueOnce('denied');
    expect(await lookupNamedContact('Taylor')).toContain('permission was denied');
    expect(NativeModules.AtlasContacts.lookupName).not.toHaveBeenCalled();
  });
  it('rejects wildcard and overly broad name lookups', async () => {
    await expect(lookupNamedContact('%')).rejects.toThrow();
    expect(NativeModules.AtlasContacts.lookupName).not.toHaveBeenCalled();
  });
});
