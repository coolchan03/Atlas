import { phaseOf } from '../../../src/learning/phase';

it('says whether the learner is learning, reviewing, testing, blocked, paused or idle', () => {
  expect(phaseOf('Learner is researching: water...', true).phase).toBe('learning');
  expect(phaseOf('Judge is checking the reports...', true).phase).toBe('reviewing');
  expect(phaseOf('Manager is reviewing the learner and the judge...', true).phase).toBe('reviewing');
  expect(phaseOf('Practicing from memory: boil...', true).phase).toBe('testing');
  expect(phaseOf('Exam: baseline...', true).phase).toBe('testing');
  expect(phaseOf('Waiting for the chat to finish...', true).phase).toBe('blocked');
  expect(phaseOf('Loading the model...', true).phase).toBe('blocked');
  expect(phaseOf('Pausing after a problem...', true).phase).toBe('paused');
  expect(phaseOf('Stopping after this step...', true).phase).toBe('paused');
  expect(phaseOf('Idle', false).phase).toBe('idle');
});
