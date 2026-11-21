import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

const mockSave = jest.fn(async () => ({ id: 't', title: 'x', path: '/p.wav', scorePath: '/p.json', mood: 'focus', sound: 'band', seconds: 20, createdAt: '' }));
jest.mock('../../src/music/saveTrack', () => ({ saveInstrumental: (...a: unknown[]) => (mockSave as any)(...a) }));
const mockPlay = jest.fn();
jest.mock('../../src/music/backgroundPlayer', () => ({ instrumentalPlayer: { play: (...a: unknown[]) => mockPlay(...a) } }));
jest.mock('../../src/utils/shareItem', () => ({ shareItem: jest.fn(async () => true) }));

import { ScoreEditorScreen } from '../../src/screens/ScoreEditorScreen';

const score = { title: 'My tune', bpm: 100, notes: [{ pitch: 72, beat: 0, length: 0.25, gain: 0.8, role: 'melody' as const }] };
const open = () => render(<ScoreEditorScreen route={{ params: { score } }} />);

describe('editing a tune by hand', () => {
  it('adds a note by tapping a square and removes it by tapping again; undo brings it back', () => {
    const { getByTestId, getByText } = open();
    expect(getByText('1 notes. Tap a square', { exact: false })).toBeTruthy();
    fireEvent.press(getByTestId('cell-76-4'));
    expect(getByText('2 notes. Tap a square', { exact: false })).toBeTruthy();
    fireEvent.press(getByTestId('cell-76-4'));
    expect(getByText('1 notes. Tap a square', { exact: false })).toBeTruthy();
    fireEvent.press(getByTestId('undo'));
    expect(getByText('2 notes. Tap a square', { exact: false })).toBeTruthy();
  });

  it('gives a part its instrument, switches to drums and adds a hit', () => {
    const { getByTestId, getByText } = open();
    fireEvent.press(getByTestId('voice-flute'));
    expect(getByText('Instrument for the melody: flute')).toBeTruthy();
    fireEvent.press(getByTestId('tab-drums'));
    fireEvent.press(getByTestId('drum-kick-0'));
    expect(getByText('2 notes. Tap a square', { exact: false })).toBeTruthy();
  });

  it('changes the tempo and saves a new track without touching the original, then plays it', async () => {
    const { getByTestId, getByText } = open();
    fireEvent.press(getByTestId('tempo-up'));
    expect(getByText('Tempo − (105)')).toBeTruthy();
    fireEvent.press(getByTestId('play'));
    await new Promise((r) => setImmediate(r));
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect((mockSave.mock.calls[0] as any)[0].bpm).toBe(105);
    expect(score.bpm).toBe(100);
    expect(mockPlay).toHaveBeenCalled();
  });
});
