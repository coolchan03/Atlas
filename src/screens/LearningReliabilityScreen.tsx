import { confidenceOf } from '../learning/confidence';
import React, { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { ScreenHeader } from '../components/ScreenHeader';
import { ProgressSection } from './learningReliability/ProgressSection';
import { ExamSection } from './learningReliability/ExamSection';
import { ExportSection } from './learningReliability/ExportSection';
import { useTheme } from '../theme';
import { useAgentStore } from '../stores/agentStore';
import { learningKnowledgeDb, type ReliabilityClaim, type ReliabilitySnapshot } from '../learning/knowledgeDb';
import type { ClaimStatus } from '../learning/evidenceGate';

/** Human-facing evidence ledger, deliberately not a self-certifying learning loop. */
export function LearningReliabilityScreen() {
  const { colors } = useTheme();
  const agents = useAgentStore((s) => s.agents);
  const [snapshot, setSnapshot] = useState<ReliabilitySnapshot | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [sources, setSources] = useState<Array<{ title: string; locator: string; passage: string; url: string; stance: string }>>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => {
    try { setSnapshot(learningKnowledgeDb.getReliabilitySnapshot()); setError(''); setRefreshKey((k) => k + 1); }
    catch (e: any) { setError(String(e?.message || e)); }
  }, []);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  const showSources = (id: string) => {
    try { setSelected(id); setSources(learningKnowledgeDb.getClaimSources(id)); setReason(''); }
    catch (e: any) { Alert.alert('Cannot open evidence', String(e?.message || e)); }
  };
  const review = (claim: ReliabilityClaim, status: ClaimStatus) => {
    if (!reason.trim()) { Alert.alert('Review reason required', 'Explain what you verified, disputed or corrected.'); return; }
    try {
      // Only the user's explicit action can approve a status. This is not an autonomous proof.
      learningKnowledgeDb.reviewClaim({ id: claim.id, status, actor: 'device-owner-review', reason });
      setSelected(null); setReason(''); setSources([]); refresh();
    } catch (e: any) { Alert.alert('Review not saved', String(e?.message || e)); }
  };
  const stat = (status: keyof ReliabilitySnapshot['counts'], label: string) => (
    <View style={[styles.stat, { borderColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{snapshot?.counts[status] ?? 0}</Text>
      <Text style={[styles.small, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]} edges={['top']}>
      <ScreenHeader title="Learning reliability" right={
        <TouchableOpacity onPress={refresh} accessibilityLabel="Refresh evidence"><Icon name="refresh-cw" size={18} color={colors.primary} /></TouchableOpacity>
      } />
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.intro, { color: colors.textSecondary }]}>This shows candidate claims and supporting source records. An AI judge saying PASS does not make a claim verified. The label “verified” means a person explicitly reviewed a source passage; it is not a guarantee of truth.</Text>
        {Boolean(error) && <Text style={[styles.error, { color: colors.error }]}>{error}</Text>}
        <View style={styles.stats}>
          {stat('candidate', 'Pending review')}{stat('disputed', 'Disputed')}{stat('verified', 'Manual review')}{stat('rejected', 'Rejected')}{stat('superseded', 'Superseded')}
        </View>
        <ProgressSection refreshKey={refreshKey} onChanged={refresh} />
        <Text style={[styles.section, { color: colors.text }]}>Recent learning claims</Text>
        {!snapshot?.recent.length && <Text style={{ color: colors.textSecondary }}>No claim records yet. As Atlas learns, candidates and their sources appear here.</Text>}
        {snapshot?.recent.map((c) => (
          <View key={c.id} style={[styles.claim, { borderColor: colors.border }]}>
            <Text style={[styles.strong, { color: colors.text }]}>{c.claim}</Text>
            <Text style={[styles.small, styles.meta, { color: colors.textSecondary }]}>
              {agents.find((a) => a.id === c.agentId)?.name || c.agentId || 'Agent not recorded'} · {c.topic} · {confidenceOf(c).label} · {c.citations} citations · {c.sourcePassages} source passages
            </Text>
            <TouchableOpacity onPress={() => showSources(c.id)} style={styles.showEvidence} accessibilityLabel={`Review evidence for ${c.topic}`}>
              <Text style={{ color: colors.primary }}>{selected === c.id ? 'Evidence shown below' : 'Show evidence & review'}</Text>
            </TouchableOpacity>
            {selected === c.id && <View style={[styles.evidence, { borderTopColor: colors.border }]}>
              {!sources.length && <Text style={{ color: colors.textSecondary }}>No source passages were attached. This claim cannot be marked verified.</Text>}
              {sources.map((src, i) => <View key={i} style={styles.source}>
                <Text style={[styles.strong, { color: colors.text }]}>{src.title}{src.stance === 'context' ? ' (context only: the claim does not cite it)' : src.stance === 'supporting' ? ' (a second source)' : ''}</Text>
                <Text selectable style={[styles.small, { color: colors.textSecondary }]}>{src.locator || src.url || 'No locator supplied'}</Text>
                <Text selectable style={[styles.small, styles.passage, { color: colors.textSecondary }]}>{src.passage || 'No source passage available'}</Text>
              </View>)}
              <TextInput value={reason} onChangeText={setReason} maxLength={500} multiline placeholder="Why does this evidence support or contradict the claim?" placeholderTextColor={colors.textMuted}
                style={[styles.reason, { color: colors.text, borderColor: colors.border }]}/>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => review(c, 'verified')} disabled={!sources.some((s) => s.passage.trim())}><Text style={{ color: sources.some((s) => s.passage.trim()) ? colors.primary : colors.textMuted }}>Mark reviewed</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => review(c, 'disputed')}><Text style={{ color: colors.primary }}>Dispute</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => review(c, 'rejected')}><Text style={{ color: colors.error }}>Reject</Text></TouchableOpacity>
              </View>
            </View>}
          </View>
        ))}
        <ExamSection onChanged={refresh} />
        <ExportSection />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: 15, paddingBottom: 60 },
  intro: { lineHeight: 19 },
  error: { marginTop: 12 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 14 },
  stat: { minWidth: 98, padding: 11, borderWidth: 1, borderRadius: 10, margin: 3 },
  statValue: { fontSize: 21, fontWeight: '700' },
  section: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  claim: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  strong: { fontWeight: '600' },
  small: { fontSize: 12 },
  meta: { marginTop: 5 },
  showEvidence: { marginTop: 8 },
  evidence: { borderTopWidth: 1, marginTop: 10, paddingTop: 10 },
  source: { paddingVertical: 7 },
  passage: { marginTop: 4 },
  reason: { borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 9 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
});
