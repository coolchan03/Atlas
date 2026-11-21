import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

describe('Debug Logs level filter', () => {
  it('shows only errors when Errors is chosen, and everything again on All', () => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const { useDebugLogsStore } = require('../../src/stores/debugLogsStore');
    const { DebugLogsScreen } = require('../../src/components/DebugLogsScreen');
    const add = useDebugLogsStore.getState().addLog;
    add({ timestamp: 1, level: 'log', message: 'plain note' });
    add({ timestamp: 2, level: 'warn', message: 'slow disk' });
    add({ timestamp: 3, level: 'error', message: 'model failed' });
    const view = rtl.render(React.createElement(DebugLogsScreen, { visible: true, onClose: jest.fn() }));
    expect(view.getByText('plain note')).toBeTruthy();
    rtl.fireEvent.press(view.getByLabelText('Show errors only'));
    expect(view.queryByText('plain note')).toBeNull();
    expect(view.queryByText('slow disk')).toBeNull();
    expect(view.getByText('model failed')).toBeTruthy();
    expect(view.getByText('1 entries (of 3)')).toBeTruthy();
    rtl.fireEvent.press(view.getByLabelText('Show warnings and errors'));
    expect(view.getByText('slow disk')).toBeTruthy();
    expect(view.queryByText('plain note')).toBeNull();
    rtl.fireEvent.press(view.getByLabelText('Show all logs'));
    expect(view.getByText('plain note')).toBeTruthy();
  });
});
