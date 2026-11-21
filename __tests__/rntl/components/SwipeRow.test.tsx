import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { SwipeRow } from '../../../src/components/SwipeRow';

function row() {
  const onPress = jest.fn(); const del = jest.fn(); const share = jest.fn(); const edit = jest.fn(); const more = jest.fn();
  const view = render(
    <SwipeRow title="My tune" testID="row" onPress={onPress} actions={[
      { id: 'delete', label: 'Delete', icon: 'trash-2', destructive: true, onPress: del },
      { id: 'share', label: 'Share', icon: 'share-2', onPress: share },
      { id: 'edit', label: 'Edit', icon: 'edit-2', onPress: edit },
      { id: 'more', label: 'More', icon: 'more-horizontal', onPress: more },
    ]}><Text>My tune</Text></SwipeRow>,
  );
  return { view, onPress, del, share, edit, more };
}

describe('a row you can swipe or hold', () => {
  it('a tap does what the row does, and nothing else', () => {
    const { view, onPress, del } = row();
    fireEvent.press(view.getByTestId('row'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
    expect(view.queryByTestId('sheet-action-delete')).toBeNull();
  });

  it('holding opens a sheet with every action as a button, and deletes nothing by itself', () => {
    const { view, del } = row();
    fireEvent(view.getByTestId('row'), 'longPress');
    for (const id of ['delete', 'share', 'edit', 'more']) expect(view.getByTestId(`sheet-action-${id}`)).toBeTruthy();
    expect(del).not.toHaveBeenCalled();
    fireEvent.press(view.getByTestId('sheet-action-delete'));
    expect(del).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('sheet-action-delete')).toBeNull(); // the sheet closes
  });

  it('can be cancelled from the sheet without doing anything', () => {
    const { view, del } = row();
    fireEvent(view.getByTestId('row'), 'longPress');
    fireEvent.press(view.getByTestId('sheet-cancel'));
    expect(view.queryByTestId('sheet-action-delete')).toBeNull();
    expect(del).not.toHaveBeenCalled();
  });

  it('swiping reveals the first three actions as buttons (the sheet has them all)', () => {
    const { view, share } = row();
    expect(view.getByTestId('swipe-action-delete')).toBeTruthy();
    expect(view.getByTestId('swipe-action-share')).toBeTruthy();
    expect(view.getByTestId('swipe-action-edit')).toBeTruthy();
    expect(view.queryByTestId('swipe-action-more')).toBeNull();
    fireEvent.press(view.getByTestId('swipe-action-share'));
    expect(share).toHaveBeenCalledTimes(1);
  });
});
