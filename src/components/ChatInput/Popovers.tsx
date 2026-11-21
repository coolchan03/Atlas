import { nextLevel, levelOf, LEVEL_LABEL } from '../../atlasTools/thinking';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Modal, TouchableWithoutFeedback, Dimensions, Keyboard, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useTheme } from '../../theme';
import { ImageModeState } from '../../types';
import { useAppStore } from '../../stores';
import { triggerHaptic } from '../../services/haptics';
import { FONTS } from '../../constants';
import { getSlot, SLOTS } from '../../bootstrap/slotRegistry';


// Popovers are anchored from the screen's right edge (`right: anchorX`) and
// extend leftward. When the trigger is far left (e.g. the audio-mode "+"), a
// large anchorX would push the popover off the left edge — clamp so its left
// edge stays ~8px inside the screen.
const POPOVER_WIDTH = 220;
const clampPopoverRight = (anchorX: number): number => {
  const screenW = Dimensions.get('window').width;
  return Math.max(8, Math.min(anchorX, screenW - POPOVER_WIDTH - 8));
};

// ─── Shared Styles ──────────────────────────────────────────────────────────

const SHADOW_COLOR = '#000';

const popoverStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  popover: {
    position: 'absolute',
    minWidth: 180,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
    // Nothing may draw outside the card: rows that do not fit scroll inside it instead of spilling onto the message box.
    overflow: 'hidden',
  },
  hidden: {
    opacity: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 10,
  },
  rowLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: FONTS.mono,
  },
  badge: {
    minWidth: 32,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontFamily: FONTS.mono,
    fontWeight: '700',
  },
});

// ─── Placement ──────────────────────────────────────────────────────────────

const POPOVER_GAP = 8;
const MIN_POPOVER_HEIGHT = 120;
/** How long to wait for the overlay to be measured before showing the popover with the older estimate. */
const MEASURE_TIMEOUT_MS = 200;
/** The popover's fade-out, so the Tools sheet opens after it has gone. */
const TOOLS_OPEN_DELAY_MS = 120;

export interface PopoverFrameBox { top: number; height: number }

/**
 * Where the card goes, from measurements taken in ONE coordinate space (the window): the trigger's top and the overlay's own top and height.
 * The earlier estimate (`Dimensions.get('window')` minus a guessed status-bar height) disagreed with the real overlay under edge-to-edge
 * Android, which lowered the card until its last row (Tools) sat on top of the message box. Pure, so it is tested without a device.
 */
export function popoverPlacement(input: { anchorY: number; anchorTop?: number; frame: PopoverFrameBox | null; topInset: number }): { bottom: number; maxHeight?: number; measured: boolean } {
  const { anchorY, anchorTop, frame, topInset } = input;
  if (!frame || anchorTop === undefined) return { bottom: anchorY + POPOVER_GAP, measured: false };
  // Distance from the overlay's bottom edge up to the top of the trigger, then the gap above it. Never below the screen edge or above the screen.
  const triggerFromBottom = frame.height - (anchorTop - frame.top);
  const bottom = Math.min(Math.max(POPOVER_GAP, triggerFromBottom + POPOVER_GAP), Math.max(POPOVER_GAP, frame.height - MIN_POPOVER_HEIGHT));
  const maxHeight = Math.max(MIN_POPOVER_HEIGHT, frame.height - bottom - topInset - POPOVER_GAP);
  return { bottom, maxHeight, measured: true };
}

interface PopoverFrameProps {
  onClose: () => void;
  anchorY: number;
  anchorX: number;
  /** The trigger's top edge in window coordinates (measureInWindow). Without it the older bottom-distance estimate is used. */
  anchorTop?: number;
  children: React.ReactNode;
}

/** The shared shell of the chat popovers: dimmed tap-away overlay, a card placed above the trigger, and rows that stay inside the card. */
const PopoverFrame: React.FC<PopoverFrameProps> = ({ onClose, anchorY, anchorX, anchorTop, children }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const overlayRef = useRef<View>(null);
  const [frame, setFrame] = useState<PopoverFrameBox | null>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const measure = useCallback(() => {
    const node = overlayRef.current;
    // measureInWindow reports (x, y, width, height); only y and height matter here.
    if (node?.measureInWindow) node.measureInWindow((...box: number[]) => { if (box[3] > 0) setFrame({ top: box[1], height: box[3] }); });
  }, []);
  useEffect(() => {
    // If the platform never reports a measurement, show the card where the older estimate puts it rather than never showing it.
    const timer = setTimeout(() => setGaveUp(true), MEASURE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  const place = popoverPlacement({ anchorY, anchorTop, frame, topInset: insets.top });
  // Hidden (not absent) until measured, so it never flashes at a wrong position over the message box.
  const ready = place.measured || anchorTop === undefined || gaveUp;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View ref={overlayRef} style={popoverStyles.overlay} onLayout={measure} testID="popover-overlay">
          <TouchableWithoutFeedback>
            <View testID="popover-card" style={[popoverStyles.popover, !ready && popoverStyles.hidden, {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              bottom: place.bottom,
              right: clampPopoverRight(anchorX),
              ...(place.maxHeight === undefined ? {} : { maxHeight: place.maxHeight }),
            }]}>
              <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} testID="popover-scroll">
                {children}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

// ─── Quick Settings Popover ─────────────────────────────────────────────────

interface QuickSettingsPopoverProps {
  visible: boolean;
  onClose: () => void;
  anchorY: number;
  anchorX: number;
  anchorTop?: number;
  imageMode: ImageModeState;
  onImageModeToggle: () => void;
  imageModelLoaded: boolean;
  supportsThinking: boolean;
  supportsToolCalling: boolean;
  enabledToolCount: number;
  onToolsPress?: () => void;
}

function getImageModeBadge(mode: ImageModeState, colors: any) {
  if (mode === 'force') return { label: 'ON', bg: colors.primary };
  if (mode === 'disabled') return { label: 'OFF', bg: colors.textMuted };
  return { label: 'Auto', bg: `${colors.textMuted}80` };
}

function getToolsStyle(supported: boolean, count: number, colors: any) {
  let iconColor = colors.textMuted;
  let badgeBg = colors.textMuted;
  let labelColor = colors.textMuted;
  let badgeLabel = 'N/A';

  if (supported) {
    // The icon and badge stay neutral - this row is a utility count, not an
    // on/off state, so it should not read as "active/highlighted" in green.
    iconColor = colors.text;
    badgeBg = colors.textMuted;
    labelColor = colors.text;
    badgeLabel = String(count);
  }

  return { iconColor, badgeBg, labelColor, badgeLabel };
}

export const QuickSettingsPopover: React.FC<QuickSettingsPopoverProps> = ({
  visible, onClose, anchorY, anchorX, anchorTop,
  imageMode, onImageModeToggle, imageModelLoaded, supportsThinking,
  supportsToolCalling, enabledToolCount, onToolsPress,
}) => {
  const { colors } = useTheme();
  const { settings, updateSettings } = useAppStore();

  if (!visible) return null;

  const imgBadge = getImageModeBadge(imageMode, colors);
  const tools = getToolsStyle(supportsToolCalling, enabledToolCount, colors);
  // The "Voice" row is provided by the voice feature via a slot. With no
  // slot registered nothing renders here.
  const AudioRow = getSlot(SLOTS.quickSettingsAudioRow);

  const toolIconColor = tools.iconColor;
  const toolBadgeBg = tools.badgeBg;

  return (
    <PopoverFrame onClose={onClose} anchorY={anchorY} anchorX={anchorX} anchorTop={anchorTop}>
        <TouchableOpacity
          testID="quick-image-mode"
          style={popoverStyles.row}
          onPress={() => { triggerHaptic('impactLight'); onImageModeToggle(); }}
        >
          <Icon name="image" size={16} color={imageModelLoaded ? colors.text : colors.textMuted} />
          <Text style={[popoverStyles.rowLabel, { color: colors.text }]}>Image Gen</Text>
          <View testID={imageMode === 'force' ? 'image-mode-force-badge' : undefined} style={[popoverStyles.badge, { backgroundColor: imgBadge.bg }]}>
            <Text style={[popoverStyles.badgeText, { color: colors.background }]}>{imgBadge.label}</Text>
          </View>
        </TouchableOpacity>

        {supportsThinking && (
          <TouchableOpacity
            testID="quick-thinking-toggle"
            style={popoverStyles.row}
            onPress={() => {
              triggerHaptic('impactLight');
              updateSettings(nextLevel(settings));
            }}
          >
            <Icon name="zap" size={16} color={settings.thinkingEnabled ? colors.primary : colors.textMuted} />
            <Text style={[popoverStyles.rowLabel, { color: colors.text }]}>Thinking</Text>
            <View style={[popoverStyles.badge, {
              backgroundColor: settings.thinkingEnabled ? colors.primary : colors.textMuted,
            }]}>
              <Text style={[popoverStyles.badgeText, { color: colors.background }]}>
                {LEVEL_LABEL[levelOf(settings)]}
              </Text>
            </View>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          testID="quick-steps-toggle"
          style={popoverStyles.row}
          accessibilityLabel="Work through steps"
          onPress={() => { triggerHaptic('impactLight'); updateSettings({ workThroughSteps: !settings.workThroughSteps }); }}
        >
          <Icon name="list" size={16} color={settings.workThroughSteps ? colors.primary : colors.textMuted} />
          <Text style={[popoverStyles.rowLabel, { color: colors.text }]}>Work through steps</Text>
          <View style={[popoverStyles.badge, { backgroundColor: settings.workThroughSteps ? colors.primary : colors.textMuted }]}>
            <Text style={[popoverStyles.badgeText, { color: colors.background }]}>{settings.workThroughSteps ? 'On' : 'Off'}</Text>
          </View>
        </TouchableOpacity>

        {AudioRow && <AudioRow styles={popoverStyles} onClose={onClose} />}

        <TouchableOpacity
          testID="quick-tools"
          style={popoverStyles.row}
          onPress={() => {
            triggerHaptic('impactLight');
            // Close the popover first, drop the keyboard so Android does not hand focus back to the message box when the popover goes,
            // and open the Tools sheet only after the popover has left (two modals changing at once can swallow the second).
            Keyboard.dismiss();
            onClose();
            if (supportsToolCalling && onToolsPress) setTimeout(onToolsPress, TOOLS_OPEN_DELAY_MS);
          }}
        >
          <Icon name="tool" size={16} color={toolIconColor} />
          <Text style={[popoverStyles.rowLabel, { color: tools.labelColor }]}>Tools</Text>
          <View style={[popoverStyles.badge, { backgroundColor: toolBadgeBg }]}>
            <Text style={[popoverStyles.badgeText, { color: colors.background }]}>{tools.badgeLabel}</Text>
          </View>
        </TouchableOpacity>
    </PopoverFrame>
  );
};

// ─── Attach Picker Popover ──────────────────────────────────────────────────

interface AttachPickerPopoverProps {
  visible: boolean;
  onClose: () => void;
  anchorY: number;
  anchorX: number;
  anchorTop?: number;
  supportsVision: boolean;
  onPhoto: () => void;
  onDocument: () => void;
}

export const AttachPickerPopover: React.FC<AttachPickerPopoverProps> = ({
  visible, onClose, anchorY, anchorX, anchorTop,
  supportsVision, onPhoto, onDocument,
}) => {
  const { colors } = useTheme();

  if (!visible) return null;

  return (
    <PopoverFrame onClose={onClose} anchorY={anchorY} anchorX={anchorX} anchorTop={anchorTop}>
        <TouchableOpacity
          testID="attach-photo"
          style={popoverStyles.row}
          onPress={() => { onClose(); onPhoto(); }}
        >
          <Icon name="camera" size={16} color={supportsVision ? colors.primary : colors.textMuted} />
          <Text style={[popoverStyles.rowLabel, { color: colors.text }]}>Photo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="attach-document"
          style={popoverStyles.row}
          onPress={() => { onClose(); onDocument(); }}
        >
          <Icon name="file" size={16} color={colors.text} />
          <Text style={[popoverStyles.rowLabel, { color: colors.text }]}>Document</Text>
        </TouchableOpacity>
    </PopoverFrame>
  );
};
