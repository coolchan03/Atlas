/**
 * QuickSettingsPopover Tests
 *
 * Atlas uses one unified Tools row.
 */
import React from 'react';
import { Keyboard } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { QuickSettingsPopover, popoverPlacement } from '../../../src/components/ChatInput/Popovers';

const COLORS = {
  text: '#000000', textMuted: '#999999', primary: '#00FF00',
  background: '#FFFFFF', surface: '#F5F5F5', border: '#E0E0E0',
};

jest.mock('react-native-vector-icons/Feather', () => {
  const { Text } = require('react-native');
  return ({ name, color }: any) => <Text testID={`feather-${name}`} style={{ color }}>{name}</Text>;
});
jest.mock('../../../src/theme', () => ({
  useTheme: () => ({ colors: COLORS }),
}));
jest.mock('../../../src/services/haptics', () => ({ triggerHaptic: jest.fn() }));
jest.mock('../../../src/bootstrap/slotRegistry', () => ({
  getSlot: () => null,
  SLOTS: { quickSettingsAudioRow: 'quickSettingsAudioRow' },
}));
jest.mock('../../../src/stores', () => ({
  useAppStore: () => ({
    settings: { thinkingEnabled: false },
    updateSettings: jest.fn(),
    toolCountHintDismissed: false,
  }),
}));

const baseProps = {
  visible: true,
  onClose: jest.fn(),
  anchorY: 0,
  anchorX: 0,
  imageMode: 'auto' as const,
  onImageModeToggle: jest.fn(),
  imageModelLoaded: false,
  supportsThinking: false,
  supportsToolCalling: true,
  enabledToolCount: 2,
};

describe('QuickSettingsPopover', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders the unified Tools row', () => {
    const { getByText, getByTestId } = render(<QuickSettingsPopover {...baseProps} />);
    expect(getByText('Tools')).toBeTruthy();
    expect(getByTestId('quick-tools')).toBeTruthy();
  });

  it('keeps the Tools icon neutral when below the warning threshold', () => {
    const { getByTestId } = render(<QuickSettingsPopover {...baseProps} enabledToolCount={2} />);
    expect(getByTestId('feather-tool').props.style.color).toBe(COLORS.text);
  });

  it('shows the enabled tool count badge', () => {
    const { getByText } = render(<QuickSettingsPopover {...baseProps} enabledToolCount={2} />);
    expect(getByText('2')).toBeTruthy();
  });

  it('closes the popover, drops the keyboard, then opens Tools (never on top of the message box)', () => {
    jest.useFakeTimers();
    try {
      const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
      const onClose = jest.fn();
      const onToolsPress = jest.fn();
      const { getByTestId } = render(<QuickSettingsPopover {...baseProps} onClose={onClose} onToolsPress={onToolsPress} />);
      fireEvent.press(getByTestId('quick-tools'));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(dismiss).toHaveBeenCalled();
      expect(onToolsPress).not.toHaveBeenCalled(); // not while the popover is still on screen
      act(() => { jest.advanceTimersByTime(300); });
      expect(onToolsPress).toHaveBeenCalledTimes(1);
      dismiss.mockRestore();
    } finally { jest.useRealTimers(); }
  });

  it('does not open Tools for a model that cannot use them, but still closes cleanly', () => {
    jest.useFakeTimers();
    try {
      const onClose = jest.fn();
      const onToolsPress = jest.fn();
      const { getByTestId } = render(<QuickSettingsPopover {...baseProps} supportsToolCalling={false} onClose={onClose} onToolsPress={onToolsPress} />);
      fireEvent.press(getByTestId('quick-tools'));
      act(() => { jest.advanceTimersByTime(300); });
      expect(onClose).toHaveBeenCalled();
      expect(onToolsPress).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });

  it('keeps every row, Tools included, inside a card that clips and scrolls', () => {
    const { getByTestId } = render(<QuickSettingsPopover {...baseProps} supportsThinking />);
    const card = getByTestId('popover-card');
    const flat = Object.assign({}, ...[card.props.style].flat(3).filter(Boolean));
    expect(flat.overflow).toBe('hidden');
    const scroll = getByTestId('popover-scroll');
    expect(scroll.type).toBe('RCTScrollView');
    expect(scroll.findByProps({ testID: 'quick-tools' })).toBeTruthy(); // Tools is a child of the scrolling area inside the card
  });

  it('is not left invisible when the platform never reports a measurement', () => {
    jest.useFakeTimers();
    try {
      const { getByTestId } = render(<QuickSettingsPopover {...baseProps} anchorTop={600} />);
      const opacityOf = () => Object.assign({}, ...[getByTestId('popover-card').props.style].flat(3).filter(Boolean)).opacity;
      act(() => { jest.advanceTimersByTime(500); });
      expect(opacityOf()).not.toBe(0);
    } finally { jest.useRealTimers(); }
  });
});

describe('popoverPlacement', () => {
  const frame = { top: 0, height: 800 };

  it('sits just above the trigger, measured in the overlay\'s own coordinates', () => {
    // trigger top at 700 of 800 -> 100 above the bottom edge, plus the 8 gap
    expect(popoverPlacement({ anchorY: 0, anchorTop: 700, frame, topInset: 0 })).toMatchObject({ bottom: 108, measured: true });
  });

  it('stays correct when the overlay starts below the status bar (its top offset is part of the measurement)', () => {
    // overlay begins 24px down and is 776 tall; the trigger is at window y 700 -> 100 above the overlay bottom
    expect(popoverPlacement({ anchorY: 0, anchorTop: 700, frame: { top: 24, height: 776 }, topInset: 0 }).bottom).toBe(108);
  });

  it('does not depend on the window height the old estimate used', () => {
    // same trigger, an overlay 48px taller than Dimensions would say (edge-to-edge navigation bar): the card moves with the overlay
    const a = popoverPlacement({ anchorY: 0, anchorTop: 700, frame: { top: 0, height: 800 }, topInset: 0 });
    const b = popoverPlacement({ anchorY: 0, anchorTop: 700, frame: { top: 0, height: 848 }, topInset: 0 });
    expect(b.bottom - a.bottom).toBe(48);
  });

  it('limits the card to the space above the trigger so it can scroll instead of running off the top', () => {
    const p = popoverPlacement({ anchorY: 0, anchorTop: 300, frame: { top: 0, height: 800 }, topInset: 40 });
    // bottom = 800-300+8 = 508; room above = 800 - 508 - 40 inset - 8 margin
    expect(p).toMatchObject({ bottom: 508, maxHeight: 244 });
  });

  it('never goes below the screen edge or leaves no room at all', () => {
    expect(popoverPlacement({ anchorY: 0, anchorTop: 900, frame, topInset: 0 }).bottom).toBe(8);
    const tiny = popoverPlacement({ anchorY: 0, anchorTop: 10, frame, topInset: 0 });
    expect(tiny.maxHeight).toBeGreaterThanOrEqual(120);
  });

  it('falls back to the older estimate until the overlay has been measured', () => {
    expect(popoverPlacement({ anchorY: 50, anchorTop: 700, frame: null, topInset: 0 })).toEqual({ bottom: 58, measured: false });
    expect(popoverPlacement({ anchorY: 50, frame, topInset: 0 })).toEqual({ bottom: 58, measured: false });
  });
});
