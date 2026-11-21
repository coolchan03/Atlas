import React from 'react';
import { render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { MarkdownText } from '../../../src/components/MarkdownText';
import { useTablePrefs } from '../../../src/components/tablePrefs';

describe('wide content stays inside the chat', () => {
  it('scrolls a code block sideways', () => {
    const view = render(<MarkdownText>{'```js\nconst aVeryLongLine = someFunction(argumentOne, argumentTwo, argumentThree, argumentFour);\n```'}</MarkdownText>);
    expect(view.UNSAFE_getAllByType(ScrollView).some((s) => s.props.horizontal)).toBe(true);
  });
  it('fits a wide table to the screen by default, with no sideways scroll', () => {
    useTablePrefs.setState({ fit: true });
    const view = render(<MarkdownText>{'| a | b | c | d | e | f |\n|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 |'}</MarkdownText>);
    expect(view.UNSAFE_queryAllByType(ScrollView).some((s) => s.props.horizontal)).toBe(false);
  });
  it('scrolls a wide table sideways in the wide view', () => {
    useTablePrefs.setState({ fit: false });
    const view = render(<MarkdownText>{'| a | b | c | d | e | f |\n|---|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 | 6 |'}</MarkdownText>);
    expect(view.UNSAFE_getAllByType(ScrollView).some((s) => s.props.horizontal)).toBe(true);
  });
  afterEach(() => useTablePrefs.setState({ fit: true }));
});
