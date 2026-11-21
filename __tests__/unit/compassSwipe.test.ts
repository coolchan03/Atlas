import { swipeDirection } from '../../src/screens/compass/swipe';

it('a long mostly-sideways drag is a swipe; a short one or a scroll is not', () => {
  expect(swipeDirection(-120, 10)).toBe('left');
  expect(swipeDirection(120, -20)).toBe('right');
  expect(swipeDirection(-30, 0)).toBeNull();
  expect(swipeDirection(-100, 90)).toBeNull();
  expect(swipeDirection(5, 300)).toBeNull();
});
