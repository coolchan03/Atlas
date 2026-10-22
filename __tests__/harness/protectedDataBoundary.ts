/** Opaque native crypto fixtures. Stores, PIN flows, merges, and persistence stay real. */
export function installProtectedDataBoundary() {
  const RN = require('react-native');
  const previous = RN.NativeModules.AtlasDevice;
  let sequence = 0;
  const sealed = new Map<string, { plain: string; binding: string }>();
  const encrypt = (prefix: string, plain: string, binding: string): string => {
    const blob = `${prefix}${++sequence}`;
    sealed.set(blob, { plain, binding });
    return blob;
  };
  const decrypt = (blob: string, binding: string): string => {
    const item = sealed.get(blob);
    if (!item || item.binding !== binding) throw new Error('Invalid ciphertext or credentials');
    return item.plain;
  };
  const binding = (kind: string, id: string, pin: string, verifier: string): string => {
    if (verifier !== `pin:v1:${pin}`) throw new Error('Incorrect PIN');
    return `${kind}:${id}:${pin}:${verifier}`;
  };
  const device = {
    ...previous,
    createChatPinVerifier: async (pin: string) => `pin:v1:${pin}`,
    verifyChatPin: async (pin: string, verifier: string) => verifier === `pin:v1:${pin}`,
    encryptProtectedItem: async (kind: string, id: string, plain: string, pin: string, verifier: string) =>
      encrypt('atlasitem:v1:', plain, binding(kind, id, pin, verifier)),
    decryptProtectedItem: async (kind: string, id: string, blob: string, pin: string, verifier: string) =>
      decrypt(blob, binding(kind, id, pin, verifier)),
    removeProtectedItemKey: async () => true,
    encryptPortableBackup: async (plain: string, passphrase: string) =>
      encrypt('atlasbackup:v1:', plain, passphrase),
    decryptPortableBackup: async (blob: string, passphrase: string) => decrypt(blob, passphrase),
  };
  RN.NativeModules.AtlasDevice = device;
  return { device, restore: () => { RN.NativeModules.AtlasDevice = previous; } };
}
