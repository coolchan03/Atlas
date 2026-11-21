const { unlabeledIconButtons } = require('../../scripts/a11y-icon-buttons.cjs');
import path from 'node:path';

describe('icon-only buttons are labelled for TalkBack', () => {
  it('does not grow past the few that are labelled by a parent or a prop', () => {
    const found: string[] = unlabeledIconButtons(path.join(__dirname, '..', '..', 'src'));
    // Remaining, each labelled another way (a label prop passed in, a parent card, visible text elsewhere). Do not add to this number:
    // give the new button an accessibilityLabel instead.
    expect(found.length).toBeLessThanOrEqual(5);
  });
});
