import React from 'react';
import { DeviceEventEmitter, NativeModules } from 'react-native';
import * as rtl from '@testing-library/react-native';
import { useBriefMedia, type BriefMediaState } from '../../src/study/useBriefMedia';


it('shows the briefing in the media notification, acts on presses, and removes it when it ends', () => {
  const show = jest.fn(); const hide = jest.fn(); const keepAlive = jest.fn();
  (NativeModules as any).AtlasMediaControls = { show, hide, keepAlive, addListener: jest.fn(), removeListeners: jest.fn() };
  const actions = { onPlay: jest.fn(), onPause: jest.fn(), onStop: jest.fn(), onJump: jest.fn() };
  const Probe = ({ state }: { state: BriefMediaState }) => { useBriefMedia(state, { line: 2, total: 9 }, actions); return null; };
  const view = rtl.render(<Probe state="playing" />);
  expect(show).toHaveBeenCalledWith('Daily briefing', 'Part 3 of 9', true);
  rtl.act(() => { DeviceEventEmitter.emit('AtlasMediaAction', { action: 'pause' }); });
  expect(actions.onPause).toHaveBeenCalled();
  view.rerender(<Probe state="paused" />);
  expect(show).toHaveBeenLastCalledWith('Daily briefing', 'Part 3 of 9', false);
  view.rerender(<Probe state="off" />);
  expect(hide).toHaveBeenCalled();
});
