import React from 'react';
import { render } from '@testing-library/react-native';
import { Button } from '../../src/components/Button';

describe('UX-22 Button is usable with a screen reader and large enough to tap', () => {
  it('has a role, a label and its state', () => {
    const view = render(<Button title="Save" onPress={() => undefined} loading testID="b" />);
    const node = view.getByTestId('b');
    expect(node.props.accessibilityRole).toBe('button');
    expect(node.props.accessibilityLabel).toBe('Save');
    expect(node.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
  });
  it('keeps a 44 dp minimum height for small buttons and 48 for medium', () => {
    const flat = (id: string) => Object.assign({}, ...[render(<Button title="x" size={id === 's' ? 'small' : 'medium'} onPress={() => undefined} testID={id} />).getByTestId(id).props.style].flat(Infinity).filter(Boolean));
    expect(flat('s').minHeight).toBeGreaterThanOrEqual(44);
    expect(flat('m').minHeight).toBeGreaterThanOrEqual(48);
  });
});
