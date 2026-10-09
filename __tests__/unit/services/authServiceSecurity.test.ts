import * as Keychain from 'react-native-keychain';
import { authService } from '../../../src/services/authService';

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED: 'WHEN_UNLOCKED' },
  setGenericPassword: jest.fn(async () => true),
  getGenericPassword: jest.fn(async () => false),
  resetGenericPassword: jest.fn(async () => true),
}));

describe('credential storage migration', () => {
  beforeEach(() => jest.clearAllMocks());
  it('stores a new passphrase in OS-protected keychain without custom hashing', async () => {
    await authService.setPassphrase('correct horse battery');
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'passphrase', 'correct horse battery',
      expect.objectContaining({ service: 'ai.offgridmobile.auth' }),
    );
  });
  it('accepts an existing OS keychain credential', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({ username: 'passphrase', password: 'secret' });
    expect(await authService.verifyPassphrase('secret')).toBe(true);
    expect(await authService.verifyPassphrase('incorrect')).toBe(false);
  });
});