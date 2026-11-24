import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ChatMessage } from '../../../src/components/ChatMessage';
import { createMessage } from '../../utils/factories';

const reply = createMessage({ id: 'a1', role: 'assistant', content: 'The warranty lasts 24 months from the date of purchase.' } as any);

it('offers Check against my sources on a reply, and runs it with the message', () => {
  jest.useFakeTimers();
  const onCheckSources = jest.fn();
  const view = render(<ChatMessage message={reply} onCheckSources={onCheckSources} />);
  fireEvent(view.getByTestId('assistant-message'), 'longPress');
  fireEvent.press(view.getByTestId('action-check-sources'));
  jest.advanceTimersByTime(400);
  expect(onCheckSources).toHaveBeenCalledWith(reply);
  jest.useRealTimers();
});

it('does not offer it when the screen does not provide it', () => {
  const view = render(<ChatMessage message={reply} />);
  fireEvent(view.getByTestId('assistant-message'), 'longPress');
  expect(view.queryByTestId('action-check-sources')).toBeNull();
});
