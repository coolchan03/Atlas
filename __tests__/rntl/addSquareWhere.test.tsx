import React from 'react';
import * as rtl from '@testing-library/react-native';
import { AddSquarePanel } from '../../src/topics/BoardExtras';
import { useTopics } from '../../src/topics/store';

const sq = (key: string, unit: string, format = 'lesson', checkpoint = false) => ({ key, format, title: `${unit} ${key}`, focus: 'f', unit, ...(checkpoint ? { checkpoint } : {}) });

it('adds an activity to the end of a chosen chapter and says where it went', () => {
  const squares = [sq('s1', 'Leases'), sq('s2', 'Leases', 'quiz', true), sq('s3', 'Inventory'), sq('s4', 'Inventory', 'quiz', true)] as any;
  useTopics.setState({ courses: [{ id: 'c1', topic: 't', title: 'T', summary: '', style: '', theme: '', request: {}, squares, content: {}, progress: {}, createdAt: 1, sources: [] } as any] });
  const course = useTopics.getState().courses[0];
  const view = rtl.render(<AddSquarePanel course={course} currentKey="s1" />);
  rtl.fireEvent.press(view.getByText('Add a game or activity to the board'));
  rtl.fireEvent.press(view.getByTestId('course-add-where'));
  rtl.fireEvent.press(view.getByTestId('course-add-where-Inventory'));
  rtl.fireEvent.press(view.getByTestId('course-add-quiz'));
  expect(view.getByTestId('course-add-done').props.children).toMatch(/end of Inventory.*on the board now/);
  const keys = useTopics.getState().courses[0].squares.map((q) => `${q.unit}:${q.key}`);
  expect(keys.indexOf('Inventory:s5')).toBe(3); // before the chapter exam
});
