import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('../../../src/services', () => ({
  modelManager: {
    setAttachmentEnabled: jest.fn(() => Promise.resolve()), detachAttachment: jest.fn(() => Promise.resolve()),
    archiveAttachment: jest.fn(() => Promise.resolve()), restoreAttachment: jest.fn(() => Promise.resolve()),
    deleteAttachment: jest.fn(() => Promise.resolve({ fileRemoved: true, keptForOtherModels: false })),
    isAttachmentShared: jest.fn(() => Promise.resolve(false)), setEmbeddedMtp: jest.fn(() => Promise.resolve()),
  },
  llmService: { getLoadReport: jest.fn(() => null) },
}));
import { modelManager, llmService } from '../../../src/services';
const mockManager = modelManager as unknown as Record<string, jest.Mock>;
const mockLlm = llmService as unknown as { getLoadReport: jest.Mock };

import { ModelAttachments, runtimeLine } from '../../../src/components/models/ModelAttachments';

const MB = 1024 * 1024;
const base: any = {
  id: 'm1', name: 'Gemma', engine: 'llama', filePath: '/m/g.gguf', fileName: 'g.gguf', fileSize: 1, isVisionModel: true,
  mmProjPath: '/m/mm.gguf', mmProjFileSize: 600 * MB, draftPath: '/m/d.gguf', draftFileSize: 150 * MB,
};
const props = { loaded: false, busy: false, onAdd: jest.fn(), onError: jest.fn() };

beforeEach(() => { jest.clearAllMocks(); mockLlm.getLoadReport.mockReturnValue(null); });

describe('ModelAttachments', () => {
  it('an enabled picture file offers Disable, Detach, Archive and Delete, and shows its memory cost', () => {
    const { getByTestId, queryByTestId, getByText } = render(<ModelAttachments model={base} {...props} />);
    for (const id of ['disable', 'detach', 'archive', 'delete']) expect(getByTestId(`vision-${id}-m1`)).toBeTruthy();
    expect(queryByTestId('vision-restore-m1')).toBeNull();
    expect(getByText(/On, about 600 MB while running/)).toBeTruthy();
  });

  it('Disable and Detach go straight to the model manager for that kind only', async () => {
    const { getByTestId } = render(<ModelAttachments model={base} {...props} />);
    fireEvent.press(getByTestId('vision-disable-m1'));
    fireEvent.press(getByTestId('draft-detach-m1'));
    await waitFor(() => expect(mockManager.detachAttachment).toHaveBeenCalledWith('m1', 'draft'));
    expect(mockManager.setAttachmentEnabled).toHaveBeenCalledWith('m1', 'vision', false);
  });

  it('a disabled file says it is kept, uses no memory, and offers Enable', () => {
    const { getByTestId, getByText } = render(<ModelAttachments model={{ ...base, mmProjDisabled: true }} {...props} />);
    expect(getByTestId('vision-enable-m1')).toBeTruthy();
    expect(getByText(/Off\. Kept on the phone \(600 MB\); not started, so it uses no memory\./)).toBeTruthy();
  });

  it('an archived file offers Restore and Delete only', () => {
    const archived = { ...base, mmProjPath: undefined, archivedAttachments: { vision: { path: '/m/mm.gguf', fileName: 'mm.gguf', archivedAt: 't' } } };
    const { getByTestId, queryByTestId } = render(<ModelAttachments model={archived} {...props} />);
    fireEvent.press(getByTestId('vision-restore-m1'));
    expect(mockManager.restoreAttachment).toHaveBeenCalledWith('m1', 'vision');
    expect(getByTestId('vision-delete-m1')).toBeTruthy();
    expect(queryByTestId('vision-disable-m1')).toBeNull();
  });

  it('a missing file offers to add one', () => {
    const { getByTestId } = render(<ModelAttachments model={{ ...base, mmProjPath: undefined }} {...props} />);
    fireEvent.press(getByTestId('vision-add-m1'));
    expect(props.onAdd).toHaveBeenCalledWith('vision');
  });

  it('Delete asks first, and says when another model keeps the file', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockManager.isAttachmentShared.mockResolvedValueOnce(true);
    const { getByTestId } = render(<ModelAttachments model={base} {...props} />);
    fireEvent.press(getByTestId('vision-delete-m1'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][1]).toMatch(/Another model also uses this picture file, so the file stays on the phone/);
    expect(mockManager.deleteAttachment).not.toHaveBeenCalled(); // nothing is deleted until the user confirms
    const confirm = (alert.mock.calls[0][2] as any[]).find((b) => b.text === 'Delete');
    confirm.onPress();
    await waitFor(() => expect(mockManager.deleteAttachment).toHaveBeenCalledWith('m1', 'vision'));
    alert.mockRestore();
  });

  it('shows an error to the user instead of swallowing it', async () => {
    mockManager.restoreAttachment.mockRejectedValueOnce(new Error('mm.gguf is no longer on this phone'));
    const archived = { ...base, mmProjPath: undefined, archivedAttachments: { vision: { path: '/m/mm.gguf', fileName: 'mm.gguf', archivedAt: 't' } } };
    const { getByTestId } = render(<ModelAttachments model={archived} {...props} />);
    fireEvent.press(getByTestId('vision-restore-m1'));
    await waitFor(() => expect(props.onError).toHaveBeenCalledWith('mm.gguf is no longer on this phone'));
  });

  it('offers a switch for MTP built into the model only when no MTP file is attached', () => {
    const { getByTestId, queryByTestId, rerender } = render(<ModelAttachments model={{ ...base, draftPath: undefined }} {...props} />);
    fireEvent.press(getByTestId('embedded-mtp-m1'));
    expect(mockManager.setEmbeddedMtp).toHaveBeenCalledWith('m1', true);
    rerender(<ModelAttachments model={base} {...props} />);
    expect(queryByTestId('embedded-mtp-m1')).toBeNull();
  });

  it('for the loaded model, says what is really running rather than what is attached', () => {
    mockLlm.getLoadReport.mockReturnValue({
      safeMode: false, backend: 'cpu', notes: [],
      vision: { requested: true, loaded: true, estimatedMB: 600 },
      mtp: { kind: 'file', requested: true, loaded: false, estimatedMB: 0, skippedBecause: 'it could not start' },
    });
    const { getByText } = render(<ModelAttachments model={base} {...props} loaded />);
    expect(getByText(/Running now, using about 600 MB\./)).toBeTruthy();
    expect(getByText(/Not running: it could not start\./)).toBeTruthy();
    expect(getByText(/Changes apply the next time this model loads\./)).toBeTruthy();
  });

  it('runtimeLine is silent when the model is not loaded', () => {
    expect(runtimeLine('vision', null)).toBeNull();
  });
});
