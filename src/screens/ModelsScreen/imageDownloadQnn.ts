import { hideAlert, showAlert } from '../../components/CustomAlert';
import { ImageModelDescriptor, ImageDownloadDeps } from './types';

export function getQnnWarningMessage(
  modelInfo: ImageModelDescriptor,
  socInfo: { hasNPU: boolean; qnnVariant?: string },
): string | null {
  if (!socInfo.hasNPU) {
    return 'NPU models require a Qualcomm Snapdragon processor. ' +
      'Your device does not have a compatible NPU and this model will not work. ' +
      'Consider downloading a CPU model instead.';
  }
  if (!modelInfo.variant || !socInfo.qnnVariant) return null;

  const deviceVariant = socInfo.qnnVariant;
  const modelVariant = modelInfo.variant;
  // Chip-specific compiled QNN files are only guaranteed for their matching variant.
  const compatible = modelVariant === deviceVariant;
  if (compatible) return null;

  return `This image model uses the ${modelVariant} QNN variant, but your device requires ${deviceVariant}. ` +
    `An incompatible compiled variant may fail on load even after a complete download. ` +
    `Choose the ${deviceVariant} variant instead, or use a GPU (MNN) model.`;
}

export function showQnnWarningAlert(
  opts: {
    warningMessage: string;
    hasNPU: boolean;
    modelInfo: ImageModelDescriptor;
    onDownloadAnyway: () => void;
  },
  deps: ImageDownloadDeps,
): void {
  const { warningMessage, hasNPU, onDownloadAnyway } = opts;
  if (hasNPU) {
    deps.setAlertState(showAlert('Incompatible Model', warningMessage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Download Anyway',
        style: 'destructive',
        onPress: () => {
          deps.setAlertState(hideAlert());
          onDownloadAnyway();
        },
      },
    ]));
    return;
  }

  deps.setAlertState(showAlert('Incompatible Model', warningMessage, [
    { text: 'OK', style: 'cancel' },
  ]));
}
