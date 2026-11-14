import { installNativeBoundary, requireRTL } from '../../harness/nativeBoundary';
import { explore } from '../../harness/monkey';

const MENU = ['Tic-Tac-Toe', 'Number Guess', 'Math Sprint', 'Rock Paper Scissors', 'Memory Match', '2048', 'Minesweeper', 'Snake', 'Word Guess', 'Trivia', 'Sudoku', 'Wilderness Survival', 'Civilization Tech Tree', 'Chess Puzzles'];

describe('the offline arcade', () => {
  it.each(MENU)('plays %s through many moves', async (title) => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const { AtlasGames } = require('../../../src/components/AtlasGames');
    const onClose = jest.fn();
    const view = rtl.render(React.createElement(AtlasGames, { visible: true, onClose }));
    await rtl.act(async () => { rtl.fireEvent.press(view.getByText(new RegExp(`^${title}`))); });
    for (const seed of [1, 5, 9, 14, 22, 31]) {
      await explore(view as never, { seed, presses: 80, skip: /All games|Close/ });
    }
    view.unmount();
  }, 120000);

  it('closes from the menu', async () => {
    jest.resetModules();
    installNativeBoundary({ fs: true });
    const rtl = requireRTL();
    const React = require('react');
    const { AtlasGames } = require('../../../src/components/AtlasGames');
    const onClose = jest.fn();
    const view = rtl.render(React.createElement(AtlasGames, { visible: true, onClose }));
    await rtl.act(async () => { rtl.fireEvent.press(view.getByText(/Close/)); });
    expect(onClose).toHaveBeenCalled();
  });
});
