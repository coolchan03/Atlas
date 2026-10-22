/** An explicitly approved contact-name search. Works with calendar-related messages. */
import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import * as DT from '../../atlasTools/deviceTools';

interface PhoneContact { name: string; number: string }

export async function lookupNamedContact(name: string): Promise<string> {
  if (Platform.OS !== 'android' || !NativeModules.AtlasContacts) {
    return 'Contact-name lookup requires the Atlas Android app.';
  }
  const q = name.trim();
  if (q.length < 2 || q.length > 80 || /[%_]/.test(q)) {
    throw new Error('Enter at least two letters of a contact name.');
  }
  const approved = await DT.confirm('Search contacts?', `Find contacts named "${q}"? Up to 10 matches will be supplied to this chat. If the selected AI is remote, this information can reach that provider.`, 'Search');
  if (!approved) return 'The user cancelled the contact search.';
  const grant = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
  if (grant !== PermissionsAndroid.RESULTS.GRANTED) return 'Contacts permission was denied.';
  const hits: PhoneContact[] = await NativeModules.AtlasContacts.lookupName(q);
  if (!hits.length) return `No contacts matched "${q}". Ask for the phone number.`;
  return `Contacts matching "${q}":\n${hits.slice(0, 10).map((h, i) => `${i + 1}. ${h.name}: ${h.number}`).join('\n')}\nIf more than one person matches, ask the user which one to use before opening any message draft. No message was sent.`;
}
