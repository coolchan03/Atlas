import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { useTheme } from '../theme';
import { useWideLayout } from '../hooks/useWideLayout';
import { AddonsSection } from '../components/AddonsSection';
import {
  useOfflineLibrary, addLibraryFile, removeLibraryFile, searchLibrary, readArticle, libraryAvailable, LibraryHit,
} from '../atlasTools/offlineLibrary';

const gb = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.round(b / 1e6)} MB`);

/** Settings > Offline library: add Kiwix .zim files, search them, read articles. */
export const OfflineLibraryScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const wide = useWideLayout();
  const files = useOfflineLibrary((s) => s.files);
  const toggle = useOfflineLibrary((s) => s.toggle);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [article, setArticle] = useState<{ title: string; text: string } | null>(null);

  const add = async () => {
    try {
      const res = await pick({ mode: 'open', requestLongTermAccess: true, type: [types.allFiles], allowMultiSelection: true });
      setBusy(true);
      for (const f of res) {
        if (!/\.zim$/i.test(f.name || '')) { Alert.alert('Not a .zim file', `${f.name} is not a Kiwix .zim file.`); continue; }
        try { await addLibraryFile(f.uri); } catch (e: any) { Alert.alert('Could not open', `${f.name}: ${e?.message || e}`); }
      }
    } catch (e: any) {
      if (!(isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED)) Alert.alert('Error', String(e?.message || e));
    } finally { setBusy(false); }
  };

  const doSearch = async () => {
    if (!q.trim()) return;
    setBusy(true); setArticle(null);
    try { setHits(await searchLibrary(q.trim(), 10)); } catch (e: any) { Alert.alert('Search failed', String(e?.message || e)); } finally { setBusy(false); }
  };

  const card = { backgroundColor: colors.surface, borderRadius: 10, padding: 14, marginBottom: 12 };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <TouchableOpacity onPress={() => (article ? setArticle(null) : navigation.goBack())} style={{ marginRight: 12 }}><Icon name="arrow-left" size={20} color={colors.text} /></TouchableOpacity>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600', flex: 1 }} numberOfLines={1}>{article ? article.title : 'Offline library'}</Text>
        {busy && <ActivityIndicator color={colors.primary} />}
      </View>
      {article ? (
        <ScrollView contentContainerStyle={[{ padding: 18, paddingBottom: 100 }, wide.column]}>
          <Text style={{ color: colors.text, fontSize: 16, lineHeight: 24 }}>{article.text}</Text>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: 120 }, wide.column]} keyboardShouldPersistTaps="handled">
          {!libraryAvailable() && <Text style={{ color: colors.error, marginBottom: 12 }}>The offline library module is missing from this build.</Text>}
          <View style={card}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>What this is</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 }}>
              Download add-ons below, or add Kiwix .zim files you already have on this device (the PC build script saves them in the 10_Kiwix folder) - those stay where they are. Then turn on "Offline library" in an agent's tools (or the chat tools menu) and the AI can look things up with no internet.
            </Text>
            <TouchableOpacity onPress={add} disabled={busy} style={{ marginTop: 12, backgroundColor: colors.primary, borderRadius: 8, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Add .zim files from this device</Text>
            </TouchableOpacity>
          </View>

          <AddonsSection />

          {files.length > 0 && <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 6 }}>Your library</Text>}
          {files.map((f) => (
            <View key={f.uri} style={[card, { flexDirection: 'row', alignItems: 'center' }]}>
              <Icon name="book" size={20} color={colors.primary} />
              <View style={{ flex: 1, marginHorizontal: 12 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{f.title}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  {f.articles.toLocaleString()} articles · {gb(f.bytes)}{f.language ? ` · ${f.language}` : ''}{f.fulltext ? '' : ' · title search only'}
                </Text>
              </View>
              <Switch value={f.enabled} onValueChange={() => toggle(f.uri)} />
              <TouchableOpacity onPress={() => removeLibraryFile(f.uri)} style={{ marginLeft: 8, padding: 4 }}><Icon name="x" size={18} color={colors.textMuted} /></TouchableOpacity>
            </View>
          ))}

          {files.length > 0 && (
            <View style={card}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 8 }}>Search</Text>
              <View style={{ flexDirection: 'row' }}>
                <TextInput
                  value={q} onChangeText={setQ} onSubmitEditing={doSearch} returnKeyType="search"
                  placeholder="e.g. tetanus, solar charge controller" placeholderTextColor={colors.textMuted}
                  style={{ flex: 1, backgroundColor: colors.background, color: colors.text, borderRadius: 8, padding: 10 }}
                />
                <TouchableOpacity onPress={doSearch} style={{ marginLeft: 8, backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center' }}>
                  <Icon name="search" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              {hits?.length === 0 && <Text style={{ color: colors.textSecondary, marginTop: 10 }}>No results.</Text>}
              {hits?.map((h, i) => (
                <TouchableOpacity key={`${h.uri}-${h.path}-${i}`} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={async () => { setBusy(true); try { setArticle(await readArticle(h.uri, h.path, 60000)); } catch (e: any) { Alert.alert('Could not open', String(e?.message || e)); } finally { setBusy(false); } }}>
                  <Text style={{ color: colors.text, fontSize: 15 }}>{h.title}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{h.library}</Text>
                  {!!h.snippet && <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={2}>{h.snippet.replace(/<[^>]+>/g, '')}</Text>}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};
