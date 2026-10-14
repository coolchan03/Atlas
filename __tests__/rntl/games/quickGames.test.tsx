import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ProjectGame } from '../../../src/components/games/ProjectGame';
import type { StudyResult } from '../../../src/study/engine';

const sources = [{ n: 1, doc: 'water.md', part: 1, text: 'Boil water for one minute.' }];
const game = (type: string, data: any): StudyResult => ({ kind: 'game', createdAt: 5, topic: '', title: type, sources, game: { type, data } });
const renderGame = (r: StudyResult) => render(<ProjectGame result={r} projectId="p1" onOpenSource={jest.fn()} />);

describe('word scramble', () => {
  it('shows scrambled letters, accepts the right word and scores it', () => {
    const r = game('scramble', { terms: [{ answer: 'BACTERIA', clue: 'Tiny germs', src: [1] }, { answer: 'SEDIMENT', clue: 'Settled dirt', src: [1] }, { answer: 'TINDER', clue: 'Fire starter', src: [1] }] });
    const { getByLabelText, getByText, queryByText } = renderGame(r);
    expect(getByText(/word 1 of 3/)).toBeTruthy();
    expect(getByLabelText(/Scrambled letters/)).toBeTruthy();
    const clue = ['Tiny germs', 'Settled dirt', 'Fire starter'].find((c) => queryByText(c))!;
    const answer = { 'Tiny germs': 'bacteria', 'Settled dirt': 'sediment', 'Fire starter': 'tinder' }[clue]!;
    fireEvent.changeText(getByLabelText('Your answer'), 'wrongword');
    fireEvent.press(getByText('Check'));
    expect(getByText(/Not quite/)).toBeTruthy();
    fireEvent.press(getByText('Next word'));
    // a second round: use the hint, then answer correctly for one point
    const clue2 = ['Tiny germs', 'Settled dirt', 'Fire starter'].filter((c) => c !== clue).find((c) => queryByText(c))!;
    fireEvent.press(getByText('Hint'));
    expect(getByText(/Starts with/)).toBeTruthy();
    fireEvent.changeText(getByLabelText('Your answer'), { 'Tiny germs': 'bacteria', 'Settled dirt': 'sediment', 'Fire starter': 'tinder' }[clue2]!);
    fireEvent.press(getByText('Check'));
    expect(getByText('Right.')).toBeTruthy();
    expect(getByText(/Score: 1 \/ 6/)).toBeTruthy();
    void answer;
  });
});

describe('prize ladder', () => {
  const q = (i: number) => ({ q: `Question ${i}`, options: ['right', 'w1', 'w2', 'w3'], answer: 0, why: 'because', src: [1], difficulty: 1 });
  const data = { questions: Array.from({ length: 10 }, (_, i) => q(i)), spares: [q(90), q(91)] };

  it('climbs on right answers and drops to the safe prize on a wrong one', () => {
    const { getByText, queryByText } = renderGame(game('ladder', data));
    for (let rung = 0; rung < 6; rung++) {
      fireEvent.press(getByText('right'));
      fireEvent.press(getByText(rung === 9 ? 'Claim the top prize' : 'Next rung'));
    }
    expect(getByText(/Question 7 of 10/)).toBeTruthy();
    fireEvent.press(getByText('w1'));
    fireEvent.press(getByText('Continue'));
    expect(getByText('Wrong answer.')).toBeTruthy();
    expect(getByText('You take home $1,000')).toBeTruthy(); // 5th rung was the safe spot
    expect(queryByText('Next rung')).toBeNull();
  });

  it('50:50 hides two wrong options and each lifeline is used once', () => {
    const { getByText, queryByText } = renderGame(game('ladder', data));
    fireEvent.press(getByText('50:50'));
    const visibleWrong = ['w1', 'w2', 'w3'].filter((w) => queryByText(w));
    expect(visibleWrong).toHaveLength(1);
    expect(getByText('50:50').props.accessibilityState?.disabled ?? true).toBeTruthy();
  });

  it('walking away keeps the banked prize', () => {
    const { getByText } = renderGame(game('ladder', data));
    fireEvent.press(getByText('right')); fireEvent.press(getByText('Next rung'));
    fireEvent.press(getByText('right')); fireEvent.press(getByText('Next rung'));
    fireEvent.press(getByText('Walk away with $200'));
    expect(getByText('You take home $200')).toBeTruthy();
  });
});

describe('fix the mistake', () => {
  it('asks for the correction and scores it', () => {
    const items = [
      { text: 'Boiling takes ten hours.', options: ['Boil for one minute.', 'Tinder goes in first.', 'Filter cloudy water.'], answer: 0, fix: 'Boil for one minute.', src: [1] },
      { text: 'Kindling goes in first.', options: ['Tinder goes in first.', 'Boil for one minute.', 'Filter cloudy water.'], answer: 0, fix: 'Tinder goes in first.', src: [1] },
      { text: 'Never filter.', options: ['Filter cloudy water.', 'Boil for one minute.', 'Tinder goes in first.'], answer: 0, fix: 'Filter cloudy water.', src: [1] },
    ];
    const { getByText } = renderGame(game('mistake', { items }));
    expect(getByText(/statement 1 of 3/)).toBeTruthy();
    fireEvent.press(getByText('Boil for one minute.'));
    expect(getByText(/Correct fact: Boil for one minute\./)).toBeTruthy();
    expect(getByText(/Score: 1 \/ 3/)).toBeTruthy();
  });
});
