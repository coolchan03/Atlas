import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { SessionReviewSheet } from '../../../src/components/SessionReviewSheet';

const proposal = { lessons: ['Check numbers', 'Be brief'], answers: [{ index: 0, q: 'How long?', answer: 'One minute' }, { index: 3, q: 'Cool?', answer: 'Yes' }] };
const setup = (over: Record<string, unknown> = {}) => {
  const props = { visible: true, proposal, canSaveAnswers: true, onKeep: jest.fn(), onDiscard: jest.fn(), onClose: jest.fn(), ...over };
  return { props, view: render(<SessionReviewSheet {...(props as any)} />) };
};

describe('reviewing what a session learned', () => {
  it('lists every proposed lesson and answer, with nothing switched on to begin with', () => {
    const { view } = setup();
    expect(view.getByText('Check numbers')).toBeTruthy();
    expect(view.getByText(/How long\?/)).toBeTruthy();
    for (const id of ['review-lesson-0', 'review-lesson-1', 'review-answer-0', 'review-answer-3']) expect(view.getByTestId(id).props.value).toBe(false);
    expect(view.getByTestId('review-keep').props.accessibilityState?.disabled).toBe(true);
  });

  it('keeps only what is switched on, counting it on the button', () => {
    const { view, props } = setup();
    fireEvent(view.getByTestId('review-lesson-1'), 'valueChange', true);
    fireEvent(view.getByTestId('review-answer-3'), 'valueChange', true);
    expect(view.getByText('Keep 2 selected')).toBeTruthy();
    fireEvent.press(view.getByTestId('review-keep'));
    expect(props.onKeep).toHaveBeenCalledWith({ lessons: ['Be brief'], answers: [3] }); // the answer's own index, not its position
  });

  it('can switch a choice back off', () => {
    const { view, props } = setup();
    fireEvent(view.getByTestId('review-lesson-0'), 'valueChange', true);
    fireEvent(view.getByTestId('review-lesson-0'), 'valueChange', false);
    fireEvent.press(view.getByTestId('review-keep'));
    expect(props.onKeep).not.toHaveBeenCalled(); // nothing chosen: the button does nothing
  });

  it('throw it all away and not now each do only that', () => {
    const { view, props } = setup();
    fireEvent.press(view.getByTestId('review-discard'));
    expect(props.onDiscard).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByTestId('review-close'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onKeep).not.toHaveBeenCalled();
  });

  it('says answers need a project when the agent has none', () => {
    expect(setup({ canSaveAnswers: false }).view.getByText(/Give this agent a project to keep them/)).toBeTruthy();
    expect(setup({ canSaveAnswers: true }).view.queryByText(/Give this agent a project/)).toBeNull();
  });

  it('starts clean each time it opens, so an old choice is never kept by accident', () => {
    const { view, props } = setup();
    fireEvent(view.getByTestId('review-lesson-0'), 'valueChange', true);
    view.rerender(<SessionReviewSheet {...(props as any)} visible={false} />);
    view.rerender(<SessionReviewSheet {...(props as any)} visible />);
    expect(view.getByTestId('review-lesson-0').props.value).toBe(false);
  });
});
