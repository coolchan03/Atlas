/** Synthetic document picker, files, and native alert buttons for real backup restore flows. */
export function installBackupRestoreBoundary() {
  const RN = require('react-native');
  const fs = require('react-native-fs');
  const picker = require('@react-native-documents/picker');
  const previousPlatform = RN.Platform.OS;
  const previousCopy = picker.keepLocalCopy;
  const permissionCheck = jest.spyOn(RN.PermissionsAndroid, 'check').mockResolvedValue(false);
  const files = new Map<string, string>();
  const restorePath = '/mock/documents/restore.atlasbackup';
  const nativeAlerts: { title: string; message?: string; buttons?: { text?: string; onPress?: () => unknown }[] }[] = [];
  const alert = jest.spyOn(RN.Alert, 'alert').mockImplementation((title: string, message?: string, buttons?: any) => {
    nativeAlerts.push({ title, message, buttons });
  });
  const implementations: [jest.Mock, (...args: any[]) => any][] = [
    [fs.exists, async (path: string) => files.has(path)],
    [fs.readFile, async (path: string) => {
      if (!files.has(path)) throw new Error('Synthetic file not found');
      return files.get(path);
    }],
    [fs.writeFile, async (path: string, text: string) => { files.set(path, text); }],
    [fs.unlink, async (path: string) => { files.delete(path); }],
    [fs.stat, async (path: string) => ({ size: files.get(path)?.length ?? 0, isFile: () => true })],
    [picker.pick, async () => [{ uri: 'content://synthetic/restore', name: 'restore.atlasbackup' }]],
  ];
  const originals = implementations.map(([mock]) => [mock, mock.getMockImplementation()] as const);
  implementations.forEach(([mock, implementation]) => mock.mockImplementation(implementation));
  picker.keepLocalCopy = jest.fn(async () => [{ status: 'success', localUri: `file://${restorePath}` }]);
  RN.Platform.OS = 'android';

  return {
    alerts: nativeAlerts,
    pick: picker.pick as jest.Mock,
    fileWrites: fs.writeFile as jest.Mock,
    selectBackup(text: string) { files.set(restorePath, text); },
    async pressAlertButton(label: string) {
      const button = [...nativeAlerts].reverse().flatMap(item => item.buttons ?? []).find(item => item.text === label);
      if (!button) throw new Error(`Native alert button not shown: ${label}`);
      await button.onPress?.();
    },
    restore() {
      originals.forEach(([mock, implementation]) => mock.mockImplementation(implementation));
      picker.keepLocalCopy = previousCopy;
      alert.mockRestore();
      permissionCheck.mockRestore();
      RN.Platform.OS = previousPlatform;
    },
  };
}
