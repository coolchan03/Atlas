import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../theme';
import { useUiModeStore } from '../stores/uiModeStore';
import { audioRecorderService } from '../services/audioRecorderService';
import { useAtlasVoiceStore } from './store';
import { stop as stopSpeech, setEarpieceRoute } from './tts';

/** Silence detection for hands-free mode. */
const SILENCE_END_MS = 1500;     // this much quiet after speech = you finished talking
const NO_SPEECH_GIVE_UP_MS = 15000;
const MAX_TURN_MS = 60000;

/**
 * Voice-mode input row ("phone call" mode). Replaces the text box while voice mode is on.
 * Tap the big button to talk; in hands-free mode it stops by itself when you go quiet,
 * sends, reads the answer aloud, then listens again.
 */
export function AtlasAudioInput(props: any) {
  const {
    onStartRecording, onStopRecording, onCancelRecording, onStop,
    isRecording, isTranscribing, isModelLoading, isGenerating, voiceAvailable, partialResult, error, disabled,
  } = props;
  const { colors } = useTheme();
  const handsFree = useAtlasVoiceStore((s) => s.handsFree);
  const setHandsFree = useAtlasVoiceStore((s) => s.setHandsFree);
  const speakingKey = useAtlasVoiceStore((s) => s.speakingKey);
  const doneTick = useAtlasVoiceStore((s) => s.doneTick);
  const setMode = useUiModeStore((s) => s.setInterfaceMode);
  const earpiece = useAtlasVoiceStore((s) => s.earpiece);
  const setEarpiece = useAtlasVoiceStore((s) => s.setEarpiece);
  const [note, setNote] = useState<string | null>(null);

  // Earpiece ("phone call") output only while voice mode is open; normal speaker everywhere else.
  useEffect(() => {
    setEarpieceRoute(earpiece);
    return () => setEarpieceRoute(false);
  }, [earpiece]);

  const latest = useRef(props);
  latest.current = props;
  const vad = useRef({ heardAt: 0, startedAt: 0, lastLoud: 0, floor: 0.01, samples: 0 });

  // Mic loudness -> decide when the person has finished talking (hands-free only).
  useEffect(() => {
    if (!handsFree) { audioRecorderService.setLevelListener(null); return; }
    audioRecorderService.setLevelListener((rms) => {
      const v = vad.current;
      const now = Date.now();
      if (!latest.current.isRecording) return;
      if (v.samples < 4) { v.floor = Math.max(0.003, (v.floor * v.samples + rms) / (v.samples + 1)); v.samples++; return; }
      const loud = rms > Math.max(0.02, Math.min(v.floor, 0.05) * 3);
      if (loud) { if (!v.heardAt) v.heardAt = now; v.lastLoud = now; }
      const stopNow =
        (v.heardAt && now - v.lastLoud > SILENCE_END_MS) || now - v.startedAt > MAX_TURN_MS;
      if (stopNow) { v.heardAt = 0; v.startedAt = now + 1e9; latest.current.onStopRecording?.(); return; }
      if (!v.heardAt && now - v.startedAt > NO_SPEECH_GIVE_UP_MS) {
        v.startedAt = now + 1e9;
        latest.current.onCancelRecording?.();
        setNote('Paused - tap the button when you want to talk.');
      }
    });
    return () => audioRecorderService.setLevelListener(null);
  }, [handsFree]);

  // Reset the silence detector at the start of every recording.
  useEffect(() => {
    if (isRecording) vad.current = { heardAt: 0, startedAt: Date.now(), lastLoud: 0, floor: 0.01, samples: 0 };
  }, [isRecording]);

  // Hands-free loop: when a spoken answer finishes, open the mic again.
  const firstTick = useRef(doneTick);
  useEffect(() => {
    if (doneTick === firstTick.current) return;
    const p = latest.current;
    if (!handsFree || !p.voiceAvailable || p.isRecording || p.isGenerating || p.isTranscribing) return;
    const t = setTimeout(() => { setNote(null); latest.current.onStartRecording?.(); }, 400);
    return () => clearTimeout(t);
  }, [doneTick]); // eslint-disable-line react-hooks/exhaustive-deps

  const press = () => {
    setNote(null);
    if (speakingKey) { stopSpeech(); return; }
    if (isRecording) { onStopRecording?.(); return; }
    if (isGenerating) { onStop?.(); return; }
    if (!voiceAvailable) {
      setNote('To talk, download a speech-to-text (Whisper) model in the Models screen. Answers can still be read aloud.');
      return;
    }
    onStartRecording?.();
  };

  let status = handsFree ? 'Tap to start talking. It listens again after each answer.' : 'Tap to talk, tap again to send.';
  let icon = 'mic';
  if (isModelLoading) status = 'Loading speech model...';
  if (isRecording) { status = handsFree ? 'Listening... (stops when you go quiet)' : 'Listening... tap to send'; icon = 'square'; }
  if (isTranscribing) status = 'Writing down what you said...';
  if (isGenerating) { status = 'Thinking... tap to stop'; icon = 'pause'; }
  if (speakingKey) { status = 'Speaking... tap to stop'; icon = 'volume-x'; }
  const busy = isTranscribing || isModelLoading;

  return (
    <View style={[styles.wrap, { borderTopColor: colors.border ?? colors.surface }]}>
      {!!partialResult && isRecording && <Text style={[styles.partial, { color: colors.textSecondary }]} numberOfLines={2}>{partialResult}</Text>}
      <Text style={[styles.status, { color: colors.textSecondary }]}>{note ?? (error ? String(error) : status)}</Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => { stopSpeech(); if (isRecording) onCancelRecording?.(); setMode('chat'); }} style={styles.side} accessibilityLabel="Back to typing">
          <Icon name="type" size={20} color={colors.textSecondary} />
          <Text style={[styles.sideText, { color: colors.textSecondary }]}>Type</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={press}
          disabled={disabled && !isGenerating && !speakingKey}
          style={[styles.big, { backgroundColor: isRecording ? colors.error : colors.primary }]}
          accessibilityLabel="Talk"
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Icon name={icon} size={30} color="#fff" />}
        </TouchableOpacity>
        <View style={styles.side}>
          <Switch value={handsFree} onValueChange={setHandsFree} />
          <Text style={[styles.sideText, { color: colors.textSecondary }]}>Hands-free</Text>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => setEarpiece(!earpiece)}
        style={styles.route}
        accessibilityLabel={earpiece ? 'Playing through the earpiece. Tap for loudspeaker' : 'Playing through the loudspeaker. Tap for earpiece'}
      >
        <Icon name={earpiece ? 'phone' : 'volume-2'} size={14} color={colors.primary} />
        <Text style={[styles.routeText, { color: colors.primary }]}>
          {earpiece ? 'Earpiece: hold the phone to your ear (tap for speaker)' : 'Speaker (tap to use the earpiece, like a phone call)'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14, borderTopWidth: StyleSheet.hairlineWidth },
  partial: { fontSize: 14, textAlign: 'center', marginBottom: 4 },
  status: { fontSize: 13, textAlign: 'center', marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 84, alignItems: 'center' },
  sideText: { fontSize: 11, marginTop: 2 },
  route: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 10, paddingVertical: 4 },
  routeText: { fontSize: 12, marginLeft: 6 },
  big: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
});
