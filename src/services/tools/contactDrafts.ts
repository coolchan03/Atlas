import { Linking, Platform } from 'react-native';

/** Compose-only contact actions. No CALL_PHONE, SEND_SMS or automatic send. */
function emailAddress(to: string): string {
  const value = String(to).trim();
  if (value.length > 254 || !/^[^\s@<>;,?]+@[^\s@<>;,?]+\.[^\s@<>;,?]+$/.test(value)) {
    throw new Error('Enter one valid email address.');
  }
  return value;
}
function phoneNumber(to: string): string {
  const value = String(to).replace(/[\s().-]/g, '');
  if (!/^\+?[0-9]{3,20}$/.test(value)) throw new Error('Enter a valid phone number.');
  return value;
}
export const emailDraftUri = (to: string, subject = '', body = '') =>
  `mailto:${encodeURIComponent(emailAddress(to))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
export const textDraftUri = (to: string, body = '') =>
  `sms:${phoneNumber(to)}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(body)}`;
export const dialerUri = (to: string) => `tel:${phoneNumber(to)}`;

export async function openEmailDraft(to: string, subject = '', body = ''): Promise<string> {
  await Linking.openURL(emailDraftUri(to, subject, body));
  return `Opened an email draft for ${emailAddress(to)}. The user must send it manually.`;
}
export async function openTextDraft(to: string, body = ''): Promise<string> {
  await Linking.openURL(textDraftUri(to, body));
  return `Opened an SMS draft for ${phoneNumber(to)}. The user must send it manually.`;
}
export async function openPhoneDialer(to: string): Promise<string> {
  await Linking.openURL(dialerUri(to));
  return `Opened the dialer for ${phoneNumber(to)}. No call was placed.`;
}
