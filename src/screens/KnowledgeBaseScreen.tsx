import { OfficialStandardButton } from '../components/OfficialStandardButton';
import { DocRoleLine } from '../components/DocRoleLine';
import { ResearchLibrariesSection } from '../components/ResearchLibrariesSection';
import { describeLibrary, type LibraryStats } from '../services/rag/libraryStats';
import { IndexStopped, gate, useIndexControl } from '../services/rag/indexControl';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Feather';
import { pick, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { resolvePickedFileUri } from '../utils/resolvePickedFileUri';
import { importZipPack } from '../atlasTools/packImport';
import logger from '../utils/logger';
import { useTheme, useThemedStyles } from '../theme';
import { createStyles } from './KnowledgeBaseScreen.styles';
import { useProjectStore } from '../stores';
import { ragService } from '../services/rag';
import { isTextDocument } from '../services/rag/textDocument';
import type { RagDocument } from '../services/rag';
import { RootStackParamList } from '../navigation/types';
import { isPickerStuck } from '../utils/pickerErrorUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProps = RouteProp<RootStackParamList, 'KnowledgeBase'>;


const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const KnowledgeBaseScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { projectId } = route.params;
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [kbDocs, setKbDocs] = useState<RagDocument[]>([]);
  const [indexingFile, setIndexingFile] = useState<string | null>(null);
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const control = useIndexControl();
  const [isLoading, setIsLoading] = useState(true);
  const [isPicking, setIsPicking] = useState(false);
  const [indexError, setIndexError] = useState<{ fileName: string; message: string } | null>(null);
  const isPickingRef = useRef(false);

  const project = useProjectStore((s) => s.getProject(projectId));

  const loadKbDocs = useCallback(async () => {
    try {
      setIsLoading(true);
      setKbDocs(await ragService.getDocumentsByProject(projectId));
      setStats(await ragService.libraryStats(projectId).catch(() => null));
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to load documents');
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadKbDocs();
    // Passages whose indexing was cut off are finished quietly, and the list is read again if any were.
    void ragService.resumeIndexing(projectId).then((n) => { if (n > 0) loadKbDocs(); }).catch(() => undefined);
  }, [loadKbDocs, projectId]);

  // Reload when coming back from writing or editing a shared document.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }
    loadKbDocs();
  }, [loadKbDocs]));

  const handleAddDocument = async () => {
    if (isPickingRef.current) {
      logger.log('[KnowledgeBase] blocked — picker already in flight');
      return;
    }
    isPickingRef.current = true;
    setIsPicking(true);
    setIndexError(null);
    logger.log(`[KnowledgeBase] picker opening — platform: ${Platform.OS}, projectId: ${projectId}`);
    try {
      // iOS: 'import' → Apple copies the file before handing it to us, original untouched.
      // Android: 'open' → returns a content:// URI; keepLocalCopy() copies it to a real path.
      const files = Platform.OS === 'android'
        ? await pick({ mode: 'open', allowMultiSelection: true })
        : await pick({ mode: 'import', allowMultiSelection: true });
      if (!files?.length) {
        logger.log('[KnowledgeBase] picker returned empty result');
        return;
      }
      logger.log(`[KnowledgeBase] picker returned ${files.length} file(s): ${files.map(f => `${f.name} (${f.size}b)`).join(', ')}`);

      control.begin();
      const notes: string[] = [];
      for (let i = 0; i < files.length; i++) {
        if (!(await gate())) break; // paused here until resumed, or stopped: the files already added stay
        const file = files[i];
        const fileName = file.name || 'document';
        setIndexingFile(files.length > 1 ? `${fileName} (${i + 1}/${files.length})` : fileName);

        const pathForDb = await resolvePickedFileUri(file.uri, fileName);
        logger.log(`[KnowledgeBase] indexing file ${i + 1}/${files.length} — name: ${fileName}, path: ${pathForDb?.substring(0, 80)}`);

        try {
          await ragService.indexDocument({
            projectId, filePath: pathForDb, fileName, fileSize: file.size || 0, gate,
            onProgress: (p) => { if (/scanned page/.test(p.message)) setIndexingFile(p.message); else if (p.stage === 'done' && p.message.length > 5) notes.push(`${fileName}: ${p.message.replace(/^Done\.\s*/, '')}`); },
          });
          logger.log(`[KnowledgeBase] indexed successfully: ${fileName}`);
        } catch (indexErr: any) {
          // The index aborted mid-way and rolled back (ragService.indexDocument is atomic — no
          // half-indexed doc is left behind). Surface it as a persistent, retriable error card on
          // the screen rather than a fire-and-forget alert, so the user sees the failure and can retry.
          if (indexErr instanceof IndexStopped) break; // the person pressed stop: not an error
          logger.error(`[KnowledgeBase] index failed for "${fileName}" — ${indexErr?.message}`);
          setIndexError({ fileName, message: indexErr?.message || 'Unknown error' });
        }
      }
      await loadKbDocs();
      if (notes.length) Alert.alert('Added', notes.join('\n\n')); // pages read from pictures can have misread characters, and some may not have been readable
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
        logger.log('[KnowledgeBase] picker cancelled by user');
        return;
      }
      if (isPickerStuck(err)) {
        logger.warn(`[KnowledgeBase] picker stuck — code: ${err?.code}, message: ${err?.message}`);
        Alert.alert('File Picker Unavailable', "The file picker isn't responding. Please close and reopen the app, then try again.");
        return;
      }
      logger.error(`[KnowledgeBase] picker error — code: ${err?.code}, message: ${err?.message}`);
      Alert.alert('Error', err?.message || 'Failed to index documents');
    } finally {
      isPickingRef.current = false;
      setIsPicking(false);
      setIndexingFile(null);
      control.end();
      logger.log('[KnowledgeBase] picker settled, lock released');
    }
  };

  // Atlas: import a whole .zip pack of text files at once.
  const handleImportPack = async () => {
    if (isPickingRef.current) return;
    isPickingRef.current = true;
    setIsPicking(true);
    setIndexError(null);
    try {
      const r = await importZipPack(projectId, (m) => setIndexingFile(m));
      if (r) {
        await loadKbDocs();
        Alert.alert(
          'Pack imported',
          `${r.added} added, ${r.skipped} already here${r.failed.length ? `, ${r.failed.length} failed (${r.failed.slice(0, 3).map((f) => f.name).join(', ')}${r.failed.length > 3 ? '...' : ''})` : ''}${r.ignored.length ? `, ${r.ignored.length} not added because Atlas cannot read that kind of file (${r.ignored.slice(0, 3).join(', ')}${r.ignored.length > 3 ? '...' : ''})` : ''}.${r.total === 0 ? ' Nothing in the zip could be added.' : ''}`,
        );
      }
    } catch (err: any) {
      if (!(isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED)) {
        Alert.alert('Import failed', err?.message || 'Could not import the pack');
      }
    } finally {
      isPickingRef.current = false;
      setIsPicking(false);
      setIndexingFile(null);
    }
  };

  const handleToggleDocument = async (docId: number, enabled: boolean) => {
    try {
      await ragService.toggleDocument(docId, enabled);
      await loadKbDocs();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update document');
    }
  };

  const handleDeleteDocument = (doc: RagDocument) => {
    Alert.alert(
      'Remove Document',
      `Remove "${doc.name}" from the knowledge base?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await ragService.deleteDocument(doc.id);
              await loadKbDocs();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to remove document');
            }
          },
        },
      ]
    );
  };

  const renderDoc = ({ item }: { item: RagDocument }) => (
    <TouchableOpacity
      style={styles.docRow}
      onPress={() => (isTextDocument(item)
        ? navigation.navigate('ProjectDocument', { projectId, docId: item.id, name: item.name })
        : navigation.navigate('DocumentPreview', { filePath: item.path, fileName: item.name, fileSize: item.size }))}
      activeOpacity={0.7}
    >
      <View style={styles.docInfo}>
        <Text style={styles.docName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.docSize}>{formatFileSize(item.size)}{stats?.documents.find((d) => d.id === item.id) ? ` · ${stats.documents.find((d) => d.id === item.id)!.chunks.toLocaleString('en-US')} passages` : ''}</Text>
        <DocRoleLine name={item.name} names={kbDocs.map((d) => d.name)} projectId={projectId} />
      </View>
      <OfficialStandardButton name={item.name} />
      <Switch
        value={item.enabled === 1}
        onValueChange={(val) => handleToggleDocument(item.id, val)}
        trackColor={{ false: colors.border, true: colors.primary }}
      />
      <TouchableOpacity accessibilityLabel="Delete" style={styles.docDelete} onPress={() => handleDeleteDocument(item)}>
        <Icon name="trash-2" size={16} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {project?.name || 'Knowledge Base'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('ProjectDocument', { projectId })} style={styles.addButton} accessibilityLabel="Write a shared document">
          <Icon name="edit-3" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleImportPack} style={styles.addButton} disabled={isPicking || !!indexingFile} accessibilityLabel="Import a .zip pack">
          <Icon name="package" size={20} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity accessibilityLabel="Add" onPress={handleAddDocument} style={styles.addButton} disabled={isPicking || !!indexingFile}>
          {indexingFile ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="plus" size={20} color={colors.primary} />
          )}
        </TouchableOpacity>
      </View>

      {indexingFile && (
        <View style={styles.indexingBanner}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.indexingText}>{control.paused ? 'Pause asked: waits at the next file or scanned page. ' : ''}{/^(Adding|Copying|Unpacking|Reading)/.test(indexingFile) ? indexingFile : `Indexing ${indexingFile}...`}</Text>
          <TouchableOpacity onPress={control.paused ? control.resume : control.pause} accessibilityRole="button" testID="kb-pause"><Text style={{ color: colors.primary }}>{control.paused ? 'Resume' : 'Pause'}</Text></TouchableOpacity>
          <TouchableOpacity onPress={control.stop} accessibilityRole="button" testID="kb-stop"><Text style={{ color: colors.error }}>Stop</Text></TouchableOpacity>
        </View>
      )}

      <ResearchLibrariesSection projectId={projectId} />

      {!!describeLibrary(stats) && !indexingFile && <Text style={styles.docSize} testID="kb-library-size">{describeLibrary(stats)}</Text>}

      {indexError && !indexingFile && (
        <View style={styles.errorCard} testID="kb-index-error-card">
          <Icon name="alert-triangle" size={16} color={colors.error} />
          <View style={styles.errorTextWrap}>
            <Text style={styles.errorTitle} numberOfLines={2}>
              Couldn't add "{indexError.fileName}"
            </Text>
            <Text style={styles.errorMessage} numberOfLines={3}>{indexError.message}</Text>
          </View>
          <TouchableOpacity
            style={styles.errorRetry}
            testID="kb-index-retry"
            onPress={handleAddDocument}
            disabled={isPicking}
          >
            <Text style={styles.errorRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : kbDocs.length === 0 ? (
        <View style={styles.centered}>
          <Icon name="file-text" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No documents yet</Text>
          <Text style={styles.emptySubtext}>Add files to build your knowledge base</Text>
          <TouchableOpacity style={styles.addFirstButton} onPress={handleAddDocument} disabled={isPicking}>
            <Text style={styles.addFirstButtonText}>Add Document</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={kbDocs}
          renderItem={renderDoc}
          keyExtractor={(item) => String(item.id)}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};