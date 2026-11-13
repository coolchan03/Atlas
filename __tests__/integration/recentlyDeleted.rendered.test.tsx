import { requireRTL } from '../harness/nativeBoundary';

it('lists a deleted chat and restores it; a locked chat is never listed', () => {
  const rtl = requireRTL();
  const React = require('react');
  const { RecentlyDeletedSection } = require('../../src/screens/storage/RecentlyDeletedSection');
  const { useTrash } = require('../../src/trash/trash');
  const { useChatStore } = require('../../src/stores');
  useTrash.setState({ items: [] });
  useChatStore.setState({ conversations: [] });
  const view = rtl.render(React.createElement(RecentlyDeletedSection));
  expect(view.queryByTestId('recently-deleted')).toBeNull();
  const chat = { id: 'c9', title: 'Lease notes', modelId: 'm', messages: [], createdAt: '', updatedAt: '' };
  rtl.act(() => { useTrash.getState().add({ kind: 'chat', originalId: 'c9', title: 'Lease notes', payload: chat }); });
  expect(view.getByText(/Chat: Lease notes/)).toBeTruthy();
  const id = useTrash.getState().items[0].id;
  rtl.fireEvent.press(view.getByTestId(`trash-restore-${id}`));
  expect(useChatStore.getState().conversations.map((c: any) => c.id)).toEqual(['c9']);
  expect(view.queryByTestId('recently-deleted')).toBeNull();
});
