/* eslint-disable max-params -- The confirmation helper takes its parts as separate arguments. */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Clipboard, Linking, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SpeedRankingCard } from '../components/models/SpeedRanking';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useAppStore } from '../stores';
import { useWhisperStore } from '../stores/whisperStore';
import { WHISPER_MODELS } from '../services/whisperService';
import { modelManager } from '../services';
import { modelDownloadService } from '../services/modelDownloadService';
import { uniformDownloadId } from '../services/modelDownloadService/uniformId';
import { CustomAlert, hideAlert, initialAlertState, AlertState, showAlert } from '../components/CustomAlert';
import { pickAndAttachMmProj, pickAndAttachDraft } from './ModelsScreen/importHelpers';
import { quickImportModel } from './ModelsScreen/quickImport';
import { pickAndAttachImageSupport, modifyImageSupport, isPickerCancel, ImageSupport } from './ModelsScreen/imageSupportActions';
import { imageJsonConfigHint, ATLAS_NATIVE_IMAGE_CONFIG_SAMPLE } from '../utils/imageSupportFormat';
import { getMissingImageSupportGuides, imageFamilyDisplay } from '../utils/nativeImageCompatibility';
import { listVolumes, sdCard, useStoragePrefs, chooseSd, fmtBytes, Volume } from '../atlasTools/storage';
import type { DownloadedModel, ONNXImageModel } from '../types';
import { useSpeedStats } from '../atlasTools/speed';

/** Everything downloaded, in one place: delete, move to the SD card, add a vision file, import. */
export const MyModelsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const textModels = useAppStore((s) => s.downloadedModels);
  const imageModels = useAppStore((s) => s.downloadedImageModels);
  const nicknames = useAppStore((s) => s.modelNicknames);
  const setModelNickname = useAppStore((s) => s.setModelNickname);
  const [nicknameTarget, setNicknameTarget] = useState<{ id: string; name: string } | null>(null);
  const [nicknameText, setNicknameText] = useState('');
  const openNickname = (id: string, name: string) => {
    setNicknameTarget({ id, name }); setNicknameText(nicknames[id] ?? '');
  };
  const activeId = useAppStore((s) => s.activeModelId);
  const whisperPresent = useWhisperStore((s) => s.presentModelIds);
  const useSd = useStoragePrefs((s) => s.useSd);
  const speeds = useSpeedStats((s) => s.byModel);
  const [alertState, setAlertState] = useState<AlertState>(initialAlertState);
  const [busy, setBusy] = useState<{ id: string; label: string; fraction: number } | null>(null);
  const [vols, setVols] = useState<Volume[]>([]);
  const [sd, setSd] = useState<Volume | undefined>(undefined);

  const refreshVolumes = useCallback(() => {
    listVolumes().then(setVols).catch(() => undefined);
    sdCard().then(setSd).catch(() => undefined);
  }, []);
  useEffect(() => { refreshVolumes(); useWhisperStore.getState().refreshPresentModels?.().catch?.(() => undefined); }, [refreshVolumes]);

  const phone = vols.find((v) => !v.removable);
  const card = { backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 10 };
  const btn = (color: string) => ({ flexDirection: 'row' as const, alignItems: 'center' as const, borderWidth: 1, borderColor: color, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginRight: 8, marginTop: 8 });

  const confirm = (title: string, msg: string, action: string, fn: () => void) =>
    Alert.alert(title, msg, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: 'destructive', onPress: fn }]);

  const delText = (m: DownloadedModel) => confirm('Delete model?', `${m.name} (${fmtBytes((m.fileSize || 0) + ((m as any).mmProjFileSize || 0))}) will be removed from this device.`, 'Delete', async () => {
    try {
      if (m.id === activeId) {
        const { activeModelService } = require('../services/activeModelService');
        await activeModelService.unloadTextModel().catch(() => undefined);
      }
      await modelManager.deleteModel(m.id);
      useAppStore.getState().removeDownloadedModel(m.id);
      modelDownloadService.remove(uniformDownloadId('text', m.id)).catch(() => undefined); // clear any download record
    } catch (e: any) {
      setAlertState(showAlert('Could not delete', String(e?.message || e)));
    }
  });
  const delImage = (m: ONNXImageModel) => confirm('Delete image model?', `${m.name} will be removed from this device.`, 'Delete', async () => {
    try { await modelDownloadService.remove(uniformDownloadId('image', m.id)); } catch (e: any) { setAlertState(showAlert('Could not delete', String(e?.message || e))); }
  });
  const delWhisper = (id: string, name: string) => confirm('Delete speech model?', `${name} will be removed. Talking to the app needs a speech model.`, 'Delete', async () => {
    try { await useWhisperStore.getState().deleteModelById(id); } catch (e: any) { setAlertState(showAlert('Could not delete', String(e?.message || e))); }
  });

  const move = async (m: DownloadedModel, toSd: boolean) => {
    if (m.id === activeId) {
      try { const { activeModelService } = require('../services/activeModelService'); await activeModelService.unloadTextModel(true); } catch { /* not loaded */ }
    }
    const target = toSd ? await sdCard() : undefined;
    if (toSd && !target) { setAlertState(showAlert('No SD card', 'Insert an SD card (set up as portable storage) and try again.')); return; }
    const need = (m.fileSize || 0) + ((m as any).mmProjFileSize || 0);
    if (toSd && target && target.free < need * 1.05) { setAlertState(showAlert('Not enough space', `The SD card has ${fmtBytes(target.free)} free; this model needs ${fmtBytes(need)}.`)); return; }
    setBusy({ id: m.id, label: toSd ? 'Moving to SD card' : 'Moving to phone', fraction: 0 });
    try {
      await modelManager.moveModel(m.id, toSd && target ? target.path : null, (f) => setBusy((b) => (b ? { ...b, fraction: f } : b)));
      refreshVolumes();
    } catch (e: any) {
      setAlertState(showAlert('Could not move the model', String(e?.message || e)));
    } finally { setBusy(null); }
  };

  const addVision = async (m: DownloadedModel) => {
    await pickAndAttachMmProj(m.id, m.name, {
      setAlertState,
      setImportProgress: (p) => setBusy(p ? { id: m.id, label: 'Adding vision file', fraction: p.fraction } : null),
    });
  };
  const addDraft = async (m: DownloadedModel) => {
    await pickAndAttachDraft(m.id, m.name, {
      setAlertState,
      setImportProgress: (p) => setBusy(p ? { id: m.id, label: 'Adding MTP file', fraction: p.fraction } : null),
    });
  };
  const removeDraft = (m: DownloadedModel) => confirm('Remove MTP file?', `${m.name} will no longer draft with its MTP file.`, 'Remove', async () => {
    await modelManager.removeDraft(m.id);
  });
  const removeVision = (m: DownloadedModel) => confirm('Remove vision file?', `${m.name} will no longer look at pictures.`, 'Remove', async () => {
    const mm = (m as any).mmProjPath as string | undefined;
    await modelManager.clearMmProjLink(m.id);
    if (mm && !textModels.some((x) => x.id !== m.id && (x as any).mmProjPath === mm)) {
      try { const RNFS = require('react-native-fs').default; await RNFS.unlink(mm); } catch { /* already gone */ }
    }
  });

  const doImport = async () => {
    await quickImportModel({ setAlertState, setImportProgress: (p) => setBusy(p ? { id: 'import', label: `Importing ${p.fileName}`, fraction: p.fraction } : null) });
  };

  const addImageSupport = async (model: ONNXImageModel) => {
    try {
      const attached = await pickAndAttachImageSupport(model, (label, fraction) =>
        setBusy({ id: model.id, label, fraction }));
      if (attached) setAlertState(showAlert('Support file attached',
        `${attached.name} is linked to ${model.name}. ${attached.kind === 'config' ? imageJsonConfigHint(attached.name) : ''}`));
    } catch (e: any) {
      if (!isPickerCancel(e)) setAlertState(showAlert('Could not attach image support', String(e?.message || e)));
    } finally { setBusy(null); }
  };

  const changeImageSupport = async (model: ONNXImageModel, file: ImageSupport,
    change: { delete?: boolean; enabled?: boolean; strength?: number }) => {
    setBusy({ id: model.id, label: 'Updating image support', fraction: 0 });
    try {
      await modifyImageSupport(model, file, change);
    } catch (e: any) {
      setAlertState(showAlert('Could not update support', String(e?.message || e)));
    } finally { setBusy(null); }
  };

  const whisperOnDisk = WHISPER_MODELS.filter((w: any) => whisperPresent.includes(w.id));

  return (
    <SafeAreaView style={[styles.s1, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.s2}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.s3}><Icon name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.s4, { color: colors.text }]}>My models</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scrollBody}>
        <SpeedRankingCard style={card} />
        {/* Storage */}
        <View style={card}>
          <Text style={[styles.s5, { color: colors.text }]}>Storage</Text>
          <Text style={[styles.s6, { color: colors.textSecondary }]}>
            Phone: {phone ? `${fmtBytes(phone.free)} free of ${fmtBytes(phone.total)}` : '...'}
            {sd ? `\nSD card: ${fmtBytes(sd.free)} free of ${fmtBytes(sd.total)}` : '\nNo SD card found'}
          </Text>
          {!!sd && (
            <View style={styles.s7}>
              <Text style={[styles.s8, { color: colors.text }]}>Save new library, maps and voice downloads to the SD card</Text>
              <Switch value={useSd} onValueChange={async (v) => { const r = await chooseSd(v); if (!r.ok) setAlertState(showAlert('SD card', r.message || '')); }} />
            </View>
          )}
          <Text style={[styles.s9, { color: colors.textMuted }]}>
            Models download to the phone first; use "Move to SD card" on a model to free phone space. Keep the card in: models on it can't load while it's out. Files on the SD card are deleted if Atlas is uninstalled.
          </Text>
        </View>

        <TouchableOpacity onPress={doImport} style={[card, styles.rowCenter]}>
          <Icon name="folder-plus" size={20} color={colors.primary} />
          <View style={styles.s10}>
            <Text style={[styles.s11, { color: colors.text }]}>Import a model file from this device</Text>
            <Text style={[styles.s12, { color: colors.textMuted }]}>.safetensors images, .gguf images/LLMs (including optional mmproj), or .litertlm. Import MNN/QNN ZIPs in Models.</Text>
          </View>
        </TouchableOpacity>

        {!!busy && (
          <View style={[card, styles.rowCenter]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.s13, { color: colors.text }]}>{busy.label}... {Math.round(busy.fraction * 100)}%</Text>
          </View>
        )}

        <Text style={[styles.s14, { color: colors.textSecondary }]}>TEXT MODELS ({textModels.length})</Text>
        {!textModels.length && <Text style={[styles.s15, { color: colors.textMuted }]}>None yet. Download one in the Models tab or import a file.</Text>}
        {textModels.map((m) => {
          const vision = m.engine === 'llama' && !!(m as any).mmProjPath;
          const onSd = (m as any).storage === 'sd';
          const size = (m.fileSize || 0) + ((m as any).mmProjFileSize || 0);
          return (
            <View key={m.id} style={card}>
              <Text style={[styles.s16, { color: colors.text }]}>{nicknames[m.id] || m.name}</Text>
              <Text style={[styles.s17, { color: colors.textMuted }]}>
                {m.fileName} · {fmtBytes(size)} · {onSd ? 'SD card' : 'phone'}{m.engine === 'litert' ? ' · LiteRT' : ''}{m.engine === 'llama' && (m.draftPath || m.embeddedMtp) ? ' · MTP' : ''}{vision ? ' · sees pictures' : ''}{m.id === activeId ? ' · in use' : ''}{speeds[m.id]?.decode ? ` · writes ~${Math.max(1, Math.round(speeds[m.id].decode * 0.75))} words/s` : ''}
              </Text>
              <View style={styles.s18}>
                <TouchableOpacity style={btn(colors.primary)} onPress={() => openNickname(m.id, m.name)}><Icon name="edit-2" size={14} color={colors.primary} /><Text style={[styles.s19, { color: colors.primary }]}>Nickname</Text></TouchableOpacity>
                <TouchableOpacity style={btn(colors.primary)} disabled={!!busy} onPress={() => navigation.navigate('ModelTest', { modelId: m.id })}><Icon name="activity" size={14} color={colors.primary} /><Text style={[styles.s20, { color: colors.primary }]}>Test</Text></TouchableOpacity>
                {m.engine === 'llama' && (vision ? (
                  <TouchableOpacity style={btn(colors.border)} onPress={() => removeVision(m)}><Icon name="eye-off" size={14} color={colors.textSecondary} /><Text style={[styles.s21, { color: colors.textSecondary }]}>Remove vision file</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity style={btn(colors.primary)} onPress={() => addVision(m)}><Icon name="eye" size={14} color={colors.primary} /><Text style={[styles.s22, { color: colors.primary }]}>Add vision file</Text></TouchableOpacity>
                ))}
                {m.engine === 'llama' && !m.draftPath && (
                  <TouchableOpacity style={btn(m.embeddedMtp ? colors.primary : colors.border)} testID={`embedded-mtp-${m.id}`}
                    onPress={() => { void modelManager.setEmbeddedMtp(m.id, !m.embeddedMtp); }}>
                    <Icon name="zap" size={14} color={m.embeddedMtp ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.s23, { color: m.embeddedMtp ? colors.primary : colors.textSecondary }]}>{m.embeddedMtp ? 'MTP built in: on' : 'MTP built in: off'}</Text>
                  </TouchableOpacity>
                )}
                {m.engine === 'llama' && (m.draftPath ? (
                  <TouchableOpacity style={btn(colors.border)} testID={`remove-mtp-${m.id}`} onPress={() => removeDraft(m)}><Icon name="zap-off" size={14} color={colors.textSecondary} /><Text style={[styles.s24, { color: colors.textSecondary }]}>Remove MTP file</Text></TouchableOpacity>
                ) : (
                  <TouchableOpacity style={btn(colors.primary)} disabled={!!busy} testID={`add-mtp-${m.id}`} onPress={() => addDraft(m)}><Icon name="zap" size={14} color={colors.primary} /><Text style={[styles.s25, { color: colors.primary }]}>Add MTP file</Text></TouchableOpacity>
                ))}
                {(sd || onSd) && (
                  <TouchableOpacity style={btn(colors.border)} disabled={!!busy} onPress={() => move(m, !onSd)}>
                    <Icon name={onSd ? 'smartphone' : 'hard-drive'} size={14} color={colors.text} />
                    <Text style={[styles.s26, { color: colors.text }]}>{onSd ? 'Move to phone' : 'Move to SD card'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={btn(colors.error)} disabled={!!busy} onPress={() => delText(m)}><Icon name="trash-2" size={14} color={colors.error} /><Text style={[styles.s27, { color: colors.error }]}>Delete</Text></TouchableOpacity>
              </View>
            </View>
          );
        })}

        <Text style={[styles.s28, { color: colors.textSecondary }]}>IMAGE MODELS ({imageModels.length})</Text>
        {imageModels.map((m) => (
          <View key={m.id} style={card}>
            <View style={styles.s29}>
              <View style={styles.s30}>
                <Text style={[styles.s31, { color: colors.text }]}>{nicknames[m.id] || m.name}</Text>
                <Text style={[styles.s32, { color: colors.textMuted }]}>
                  {fmtBytes(m.size || 0)} · {m.backend === 'sdcpp' ? `Original ${imageFamilyDisplay(m.nativeImageFamily)} weights` : (m.backend || 'model').toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity style={btn(colors.primary)} onPress={() => openNickname(m.id, m.name)}><Icon name="edit-2" size={14} color={colors.primary} /><Text style={[styles.s33, { color: colors.primary }]}>Nickname</Text></TouchableOpacity>
              <TouchableOpacity style={btn(colors.primary)} disabled={!!busy}
                onPress={() => navigation.navigate('ModelTest', { modelId: m.id, modelType: 'image' })}>
                <Icon name="activity" size={14} color={colors.primary} />
                <Text style={[styles.s34, { color: colors.primary }]}>Test</Text>
              </TouchableOpacity>
              <TouchableOpacity style={btn(colors.error)} disabled={!!busy} onPress={() => delImage(m)}>
                <Icon name="trash-2" size={14} color={colors.error} />
                <Text style={[styles.s35, { color: colors.error }]}>Delete</Text>
              </TouchableOpacity>
            </View>
            {m.backend === 'sdcpp' && getMissingImageSupportGuides(m).length > 0 && (
              <View style={styles.s36}>
                <Text style={[styles.s37, { color: colors.error }]}>
                  Missing components. Download and attach these to {m.name}:
                </Text>
                {getMissingImageSupportGuides(m).map(guide => (
                  <View key={guide.kind} style={styles.s38}>
                    <Text style={[styles.s39, { color: colors.text }]}>
                      {guide.label}{guide.fileName ? ` ? ${  guide.fileName}` : ''}
                    </Text>
                    {guide.downloadUrl && (
                      <TouchableOpacity
                        accessibilityRole="link"
                        onPress={() => Linking.openURL(guide.downloadUrl!).catch((err: unknown) =>
                          setAlertState(showAlert('Could not open download', String(err))))}
                        style={styles.s40}>
                        <Text style={[styles.s41, { color: colors.primary }]}>
                          Open official file on Hugging Face
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
                <Text style={[styles.s42, { color: colors.textMuted }]}>
                  After downloading, tap Attach LoRA / support file below. These are not chat models or style LoRAs.
                </Text>
              </View>
            )}
            {m.backend === 'sdcpp' && (
              <View style={styles.s43}>
                <TouchableOpacity style={[btn(colors.primary), styles.startSelf]} disabled={!!busy}
                  onPress={() => addImageSupport(m)}>
                  <Icon name="plus-circle" size={14} color={colors.primary} />
                  <Text style={[styles.s44, { color: colors.primary }]}>Attach LoRA / support file</Text>
                </TouchableOpacity>
                <Text style={[styles.s45, { color: colors.textMuted }]}>
                  LoRAs modify style. RealESRGAN .pth is an upscaler. Native atlas-runtime.json changes supported sampler settings; other JSON is metadata, not model weights.
                </Text>
                <TouchableOpacity testID="native-image-config-example" accessibilityRole="button"
                  style={[btn(colors.border), styles.startSelf]}
                  onPress={() => {
                    Clipboard.setString(ATLAS_NATIVE_IMAGE_CONFIG_SAMPLE);
                    setAlertState(showAlert('Native JSON config copied',
                      'Save this JSON as atlas-runtime.json, then Attach LoRA / support file. Supported sampler and schedule fields affect the native image engine. Other model/pipeline JSON cannot make incompatible weights runnable.'));
                  }}>
                  <Icon name="copy" size={14} color={colors.text} />
                  <Text style={[styles.s46, { color: colors.text }]}>Copy native JSON example</Text>
                </TouchableOpacity>
                {(m.supportFiles || []).map(file => (
                  <View key={`${file.kind  }/${  file.name}`} style={[styles.s47, { borderColor: colors.border }]}>
                    <Text style={[styles.s48, { color: colors.text }]}>{file.name}</Text>
                    <Text style={[styles.s49, { color: colors.textMuted }]}>{file.kind.toUpperCase()} · {fmtBytes(file.size)}{file.kind === 'lora' ? ` · strength ${file.strength.toFixed(2)}` : ''} · {file.enabled ? 'enabled' : 'disabled'}</Text>
                    {file.kind === 'config' && <Text style={[styles.s50, { color: colors.textMuted }]}>{imageJsonConfigHint(file.name)}</Text>}
                    <View style={styles.s51}>
                      <TouchableOpacity style={btn(colors.primary)} disabled={!!busy}
                        onPress={() => changeImageSupport(m, file, { enabled: !file.enabled })}>
                        <Text style={{ color: colors.primary }}>{file.enabled ? 'Disable' : 'Enable'}</Text>
                      </TouchableOpacity>
                      {file.kind === 'lora' && (
                        <>
                          <TouchableOpacity style={btn(colors.border)} disabled={!!busy}
                            onPress={() => changeImageSupport(m, file, { strength: Math.max(0, file.strength - 0.15) })}>
                            <Icon name="minus" size={15} color={colors.text} />
                          </TouchableOpacity>
                          <TouchableOpacity style={btn(colors.border)} disabled={!!busy}
                            onPress={() => changeImageSupport(m, file, { strength: Math.min(2, file.strength + 0.15) })}>
                            <Icon name="plus" size={15} color={colors.text} />
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity style={btn(colors.error)} disabled={!!busy}
                        onPress={() => confirm('Remove support file?', `${file.name  } will be detached and deleted from Atlas.`, 'Remove',
                          () => { void changeImageSupport(m, file, { delete: true }); })}>
                        <Icon name="trash-2" size={14} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ))}

        <Text style={[styles.s52, { color: colors.textSecondary }]}>SPEECH-TO-TEXT ({whisperOnDisk.length})</Text>
        {whisperOnDisk.map((w: any) => (
          <View key={w.id} style={[card, styles.rowCenter]}>
            <View style={styles.s53}>
              <Text style={[styles.s54, { color: colors.text }]}>{w.name || w.id}</Text>
              {!!w.size && <Text style={[styles.s55, { color: colors.textMuted }]}>{w.size} MB</Text>}
            </View>
            <TouchableOpacity style={btn(colors.error)} onPress={() => delWhisper(w.id, w.name || w.id)}><Icon name="trash-2" size={14} color={colors.error} /><Text style={[styles.s56, { color: colors.error }]}>Delete</Text></TouchableOpacity>
          </View>
        ))}
        <Text style={[styles.s57, { color: colors.textMuted }]}>Natural voices are in Models → Voice. Library packs and encyclopedias are in Settings → Offline Library. Maps are in Atlas → Maps.</Text>
      </ScrollView>
      <Modal transparent visible={!!nicknameTarget} animationType="fade"
        onRequestClose={() => setNicknameTarget(null)}>
        <View style={styles.s58}>
          <View style={[styles.s59, { backgroundColor: colors.surface }]}>
            <Text style={[styles.s60, { color: colors.text }]}>Model nickname</Text>
            <Text style={{ color: colors.textSecondary }}>Give {nicknameTarget?.name} a friendly name. The original filename and model weights stay unchanged.</Text>
            <TextInput autoFocus maxLength={80} value={nicknameText} onChangeText={setNicknameText}
              testID="model-nickname-input" placeholder={nicknameTarget?.name}
              placeholderTextColor={colors.textMuted}
              style={[styles.s61, { color: colors.text, borderColor: colors.border }]} />
            <View style={styles.s62}>
              <TouchableOpacity onPress={() => setNicknameTarget(null)}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => {
                if (nicknameTarget) setModelNickname(nicknameTarget.id, nicknameText);
                setNicknameTarget(null);
              }}><Text style={[styles.s63, { color: colors.primary }]}>Save</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <CustomAlert {...alertState} onClose={() => setAlertState(hideAlert())} />
    </SafeAreaView>
  );
};

/** The dim layer behind a dialog. */
const SCRIM = 'rgba(0,0,0,0.6)';
const styles = StyleSheet.create({
  scrollBody: { padding: 12, paddingBottom: 60, width: '100%', maxWidth: 900, alignSelf: 'center' },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },
  startSelf: { alignSelf: 'flex-start' },
  s1: { flex: 1 },
  s2: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  s3: { padding: 6 },
  s4: { fontSize: 22, fontWeight: '700', fontFamily: 'serif', marginLeft: 8, flex: 1 },
  s5: { fontWeight: '700', fontSize: 16 },
  s6: { marginTop: 4 },
  s7: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  s8: { flex: 1, paddingRight: 8 },
  s9: { fontSize: 12, marginTop: 8 },
  s10: { flex: 1, marginLeft: 12 },
  s11: { fontWeight: '600' },
  s12: { fontSize: 12 },
  s13: { marginLeft: 10, flex: 1 },
  s14: { fontWeight: '700', marginTop: 8, marginBottom: 6 },
  s15: { marginBottom: 10 },
  s16: { fontWeight: '600', fontSize: 15 },
  s17: { fontSize: 12, marginTop: 2 },
  s18: { flexDirection: 'row', flexWrap: 'wrap' },
  s19: { marginLeft: 6 },
  s20: { marginLeft: 6 },
  s21: { marginLeft: 6 },
  s22: { marginLeft: 6 },
  s23: { marginLeft: 6 },
  s24: { marginLeft: 6 },
  s25: { marginLeft: 6 },
  s26: { marginLeft: 6 },
  s27: { marginLeft: 6 },
  s28: { fontWeight: '700', marginTop: 8, marginBottom: 6 },
  s29: { flexDirection: 'row', alignItems: 'center' },
  s30: { flex: 1 },
  s31: { fontWeight: '600' },
  s32: { fontSize: 12 },
  s33: { marginLeft: 6 },
  s34: { marginLeft: 6 },
  s35: { marginLeft: 6 },
  s36: { marginTop: 8 },
  s37: { fontSize: 12, fontWeight: '600' },
  s38: { marginTop: 7 },
  s39: { fontSize: 12 },
  s40: { paddingVertical: 5 },
  s41: { fontSize: 12 },
  s42: { fontSize: 12, marginTop: 5 },
  s43: { marginTop: 8 },
  s44: { marginLeft: 6 },
  s45: { fontSize: 12, marginTop: 6 },
  s46: { marginLeft: 6, fontSize: 12 },
  s47: { marginTop: 8, borderTopWidth: 1, paddingTop: 8 },
  s48: { fontWeight: '500', fontSize: 13 },
  s49: { fontSize: 12 },
  s50: { fontSize: 12, marginTop: 4 },
  s51: { flexDirection: 'row', flexWrap: 'wrap' },
  s52: { fontWeight: '700', marginTop: 8, marginBottom: 6 },
  s53: { flex: 1 },
  s54: { fontWeight: '600' },
  s55: { fontSize: 12 },
  s56: { marginLeft: 6 },
  s57: { fontSize: 12, marginTop: 8 },
  s58: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: SCRIM },
  s59: { padding: 20, borderRadius: 14, gap: 12 },
  s60: { fontWeight: '700', fontSize: 18 },
  s61: { borderWidth: 1, borderRadius: 9, padding: 12 },
  s62: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20 },
  s63: { fontWeight: '700' },
});
