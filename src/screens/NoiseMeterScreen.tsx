import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  PermissionsAndroid,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Feather';
import { AudioRecorder } from 'react-native-audio-api';
import { useTheme } from '../theme';
import { useEmergencyColors, useOffGrid } from '../atlasTools/offGrid';
import { audioSessionManager } from '../services/audioSessionManager';
import { ScreenBackground } from '../components/ScreenBackground';
import { TYPOGRAPHY, SPACING } from '../constants';

const DB_MIN = 0;
const DB_MAX = 120;
const SPL_OFFSET = 90;

function dbLabel(db: number): string {
  if (db < 40) return 'Quiet';
  if (db < 60) return 'Moderate';
  if (db < 80) return 'Loud';
  if (db < 100) return 'Very loud';
  return 'Dangerous';
}

const literalStyles = StyleSheet.create({
  s1: { flex: 1 },
  s2: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  s3: { marginRight: 12 },
  s4: { fontSize: 20 },
  s5: { flex: 1, alignItems: 'center', paddingVertical: 24, paddingHorizontal: 16 },
  s6: { width: 32, height: 240, borderRadius: 6, overflow: 'hidden', marginBottom: 20 },
  s7: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  s8: { fontSize: 64 },
  s9: { marginTop: 4 },
  s10: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  s11: { fontSize: 16 },
  s12: { marginTop: 8, fontSize: 12, textAlign: 'center' },
  s13: { flexDirection: 'row', marginTop: 24, gap: 32 },
  s14: { alignItems: 'center' },
  s15: { fontSize: 11, marginTop: 2 },
});

export const NoiseMeterScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { colors: base } = useTheme();
  const colors = useEmergencyColors(base);
  const night = useOffGrid((s) => s.nightRed);
  const [running, setRunning] = useState(false);
  const [db, setDb] = useState<number | null>(null);
  const barAnim = useRef(new Animated.Value(0)).current;
  const recorderRef = useRef<AudioRecorder | null>(null);
  const accent = night ? '#FF3B3B' : '#16A34A';

  const barColor = db === null ? colors.border
    : db >= 100 ? '#DC2626'
    : db >= 80 ? '#D97706'
    : accent;

  useEffect(() => {
    return () => { stopMeter(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopMeter = useCallback(() => {
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
    audioSessionManager.restorePlaybackAfterRecording().catch(() => {});
  }, []);

  const startMeter = useCallback(async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        { title: 'Microphone', message: 'The noise meter needs the microphone.', buttonPositive: 'Allow' },
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
    }
    await audioSessionManager.ensureRecording();
    const rec = new AudioRecorder();
    recorderRef.current = rec;
    (rec as any).onAudioReady(
      { sampleRate: 16000, bufferLength: 1600, channelCount: 1 },
      (event: any) => {
        const data: Float32Array = event.buffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / Math.max(1, data.length));
        const dbfs = 20 * Math.log10(Math.max(rms, 1e-9));
        const spl = Math.max(0, Math.min(DB_MAX, dbfs + SPL_OFFSET));
        setDb(Math.round(spl));
        const fraction = (spl - DB_MIN) / (DB_MAX - DB_MIN);
        Animated.timing(barAnim, { toValue: fraction, duration: 80, useNativeDriver: false }).start();
      },
    );
    try { (rec as any).start(); } catch { stopMeter(); return; }
  }, [barAnim, stopMeter]);

  const toggle = useCallback(async () => {
    if (running) {
      stopMeter();
      setRunning(false);
      setDb(null);
      barAnim.setValue(0);
    } else {
      await startMeter();
      setRunning(true);
    }
  }, [running, startMeter, stopMeter, barAnim]);

  const barHeight = barAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <SafeAreaView style={[literalStyles.s1, { backgroundColor: colors.background }]}>
      <ScreenBackground screenKey="NoiseMeter" />
      <View style={literalStyles.s2}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={literalStyles.s3}>
          <Icon name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[{ color: colors.text }, literalStyles.s4]}>Noise Meter</Text>
      </View>
      <ScrollView contentContainerStyle={literalStyles.s5}>
        <View style={[literalStyles.s6, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
          <Animated.View style={[literalStyles.s7, { height: barHeight, backgroundColor: barColor }]} />
        </View>
        <Text style={[{ color: colors.text, ...TYPOGRAPHY.body }, literalStyles.s8]}>
          {db !== null ? `${db}` : '--'}
        </Text>
        <Text style={[{ color: colors.textSecondary, ...TYPOGRAPHY.bodySmall }, literalStyles.s9]}>
          {db !== null ? `dB SPL - ${dbLabel(db)}` : 'dB SPL'}
        </Text>
        <TouchableOpacity
          onPress={toggle}
          style={[literalStyles.s10, { backgroundColor: running ? colors.surface : accent, borderWidth: running ? 1 : 0, borderColor: colors.border }]}>
          <Icon name={running ? 'square' : 'mic'} size={20} color={running ? colors.text : '#fff'} />
          <Text style={[{ color: running ? colors.text : '#fff', marginTop: SPACING.xs }, literalStyles.s11]}>
            {running ? 'Stop' : 'Start'}
          </Text>
        </TouchableOpacity>
        <Text style={[{ color: colors.textMuted }, literalStyles.s12]}>
          Readings are approximate. Phone microphones vary by device.
        </Text>
        <View style={literalStyles.s13}>
          {[
            { label: 'Quiet', value: '< 40 dB' },
            { label: 'Moderate', value: '40-60 dB' },
            { label: 'Loud', value: '60-80 dB' },
            { label: 'Dangerous', value: '> 100 dB' },
          ].map((r) => (
            <View key={r.label} style={literalStyles.s14}>
              <Text style={{ color: colors.text, ...TYPOGRAPHY.bodySmall }}>{r.label}</Text>
              <Text style={[{ color: colors.textSecondary }, literalStyles.s15]}>{r.value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};
