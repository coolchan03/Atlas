/** The steps of a big job, live under the chat's tool call, and a plain label on its result. The AI is the boundary (two functions). */
import React from 'react';
import { act, render } from '@testing-library/react-native';
import { ChatMessage } from '../../../src/components/ChatMessage';
import { createMessage } from '../../utils/factories';
import { workInSteps } from '../../../src/workflows/autoSteps';
import { useStepProgress } from '../../../src/workflows/stepProgress';

const mockShaped = jest.fn();
jest.mock('../../../src/study/engine', () => ({ askShaped: (...a: unknown[]) => mockShaped(...a), askModel: jest.fn() }));

const call = createMessage({ id: 'm1', role: 'assistant', content: '', toolCalls: [{ id: 'tc1', name: 'work_in_steps', arguments: '{"job":"turn my notes into an email"}' }] } as any);

it('shows each step of the job waiting, running and done under the tool call while it works, and a label for the result', async () => {
  const view = render(<ChatMessage message={call} />);
  expect(view.queryByTestId('chat-step-progress')).toBeNull(); // nothing running: nothing shown

  // Each model call waits until the test lets it go, so the list can be read between steps.
  const release: Array<(reply: string) => void> = [];
  mockShaped.mockImplementation(() => new Promise<string>((resolve) => { release.push(resolve); }));
  let finished: Promise<string> = Promise.resolve('');
  await act(async () => { finished = workInSteps('turn my notes into an email', 'Short notes.'); });

  expect(view.getByTestId('chat-step-progress-0').props.accessibilityLabel).toBe('Plan the steps: in progress');
  await act(async () => { release[0]('1. List the decisions made.\n2. Write a short email with them.'); });
  expect(view.getByTestId('chat-step-progress-0').props.accessibilityLabel).toBe('List the decisions made.: in progress');
  expect(view.getByTestId('chat-step-progress-1').props.accessibilityLabel).toBe('Write a short email with them.: waiting');
  expect(view.getByText('Step 1 of 2')).toBeTruthy();

  await act(async () => { release[1]('the decisions'); });
  expect(view.getByTestId('chat-step-progress-0').props.accessibilityLabel).toBe('List the decisions made.: done');
  expect(view.getByTestId('chat-step-progress-1').props.accessibilityLabel).toBe('Write a short email with them.: in progress');
  await act(async () => { release[2]('the email'); });
  await act(async () => { await finished; });
  expect(useStepProgress.getState().active).toBe(false);
  expect(view.queryByTestId('chat-step-progress')).toBeNull(); // done: the result bubble takes over

  const result = createMessage({ id: 'm2', role: 'tool', toolName: 'work_in_steps', content: 'Done in 2 steps:\n1. List the decisions made.\n2. Write a short email with them.\n\nFinal result:\nthe email' } as any);
  const bubble = render(<ChatMessage message={result} />);
  expect(bubble.getByTestId('tool-result-label-work_in_steps').props.children.join('')).toMatch(/Did the job in 2 steps/);
});

it('reading a long text in parts is the first item of the list, with the part being read', async () => {
  const view = render(<ChatMessage message={call} />);
  const release: Array<(reply: string) => void> = [];
  mockShaped.mockReset();
  mockShaped.mockImplementation(() => new Promise<string>((resolve) => { release.push(resolve); }));
  const long = `${'We talked about the plan and the budget. '.repeat(400)}`;
  let finished: Promise<string> = Promise.resolve('');
  await act(async () => { finished = workInSteps('summarise and list actions', long); });
  await act(async () => { release[0]('1. Summarise the text.\n2. List the actions.'); });
  expect(view.getByTestId('chat-step-progress-0').props.accessibilityLabel).toBe('Read the text in parts: in progress');
  expect(view.getByText(/^Reading part 1 of \d+$/)).toBeTruthy();
  expect(view.getByTestId('chat-step-progress-1').props.accessibilityLabel).toBe('Summarise the text.: waiting');
  // Let the rest run to the end with short answers.
  mockShaped.mockImplementation(async () => 'The part is about the plan.');
  await act(async () => { release[1]('The part is about the plan.'); });
  await act(async () => { await finished; });
  expect(useStepProgress.getState().active).toBe(false);
});
