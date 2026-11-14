import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';
import { seedApp } from '../../harness/monkeySeed';

describe('the voice panel survives being pressed everywhere', () => {
  it.each(['full', 'empty'] as const)('%s', async (profile) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    seedApp(profile);
    const { AtlasVoicePanel } = require('../../../src/atlasVoice/VoicePanel');
    const view = rtl.render(React.createElement(AtlasVoicePanel));
    for (const seed of [2, 8, 30]) await explore(view as never, { seed, presses: 80 });
    view.unmount();
  }, 60000);
});
