jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
  Linking: { openURL: jest.fn().mockResolvedValue(undefined) },
}));
import { Linking } from 'react-native';
import { emailDraftUri, textDraftUri, dialerUri, openEmailDraft, openTextDraft } from '../../../../src/services/tools/contactDrafts';

describe('Atlas contact actions', () => {
  it('encodes drafts without sending', async () => {
    expect(emailDraftUri('reader@example.com', 'Hello & hi', 'Two lines\nOkay'))
      .toContain('subject=Hello%20%26%20hi');
    expect(textDraftUri('+1 (555) 222-9999', 'Meeting at 3?'))
      .toContain('body=Meeting%20at%203%3F');
    expect(dialerUri('+1 555 222 9999')).toContain('tel:+15552229999');
    await openEmailDraft('reader@example.com', 'Subject', 'Body');
    await openTextDraft('+15552229999', 'Hello');
    expect(Linking.openURL).toHaveBeenCalledTimes(2);
  });
  it('rejects invalid recipients', () => {
    expect(() => emailDraftUri('not-an-email')).toThrow();
    expect(() => textDraftUri('javascript:alert(1)')).toThrow();
  });
});
