import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { useDeepening } from '../../src/topics/BoardExtras';
import { enqueue } from '../../src/topics/generationQueue';

const Probe = ({ saved, content, adopt }: any) => { const e = useDeepening({ courseId: 'c', key: 'k', saved, content, adopt }); return <Text testID="s">{e ? 'expanding' : 'idle'}</Text>; };

it('switches the open lesson to the in-depth version once it is saved', async () => {
  const adopt = jest.fn();
  let finish!: () => void;
  const job = enqueue('c:k:deepen', () => new Promise<void>((r) => { finish = r; }), 0);
  const draft = { v: 'draft' }; const deep = { v: 'deep' };
  const { getByTestId, rerender } = render(<Probe saved={draft} content={draft} adopt={adopt} />);
  expect(getByTestId('s').props.children).toBe('expanding');
  rerender(<Probe saved={deep} content={draft} adopt={adopt} />); // saved by the background job while still "expanding"
  await act(async () => { finish(); await job; });
  expect(getByTestId('s').props.children).toBe('idle');
  expect(adopt).toHaveBeenCalledWith(deep);
});

it('does nothing when no deeper version was ever being written', () => {
  const adopt = jest.fn();
  const draft = { v: 'draft' };
  render(<Probe saved={draft} content={draft} adopt={adopt} />);
  expect(adopt).not.toHaveBeenCalled();
});
