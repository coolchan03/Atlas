/** A question that comes up while studying is saved on the course and asked of the tutor later, in a chat in the course's project. */
import { installNativeBoundary, requireRTL } from '../harness/nativeBoundary';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }) }));

it('saves a question, keeps it per course, and starts a tutor chat in the project', () => {
  installNativeBoundary({ fs: true });
  mockNavigate.mockClear();
  const rtl = requireRTL();
  const React = require('react');
  const { AskLaterCard } = require('../../src/topics/AskLaterCard');
  const { useAskLater } = require('../../src/topics/askLater');
  const { useAppStore } = require('../../src/stores/appStore');
  useAskLater.setState({ questions: [] });
  useAppStore.setState({ activeModelId: 'm1', downloadedModels: [{ id: 'm1', name: 'Small' }] });
  const course: any = { id: 'c1', title: 'REG board', projectId: 'p1', squares: [], content: {}, progress: {}, sources: [] };
  const view = rtl.render(React.createElement(AskLaterCard, { course }));
  expect(view.getByText(/Nothing saved yet/)).toBeTruthy();
  rtl.fireEvent.changeText(view.getByTestId('ask-later-input'), '  Why is basis reduced   by depreciation?  ');
  rtl.fireEvent.press(view.getByTestId('ask-later-save'));
  expect(view.getByText('Why is basis reduced by depreciation?')).toBeTruthy();
  useAskLater.getState().add('other-course', 'not mine');
  expect(view.queryByText('not mine')).toBeNull();
  const [saved] = useAskLater.getState().questions.filter((q: any) => q.courseId === 'c1');
  rtl.fireEvent.press(view.getByTestId(`ask-later-ask-${saved.id}`));
  expect(mockNavigate).toHaveBeenCalledWith('Chat', { conversationId: expect.any(String), projectId: 'p1', starter: 'On the course "REG board": Why is basis reduced by depreciation?' });
  rtl.fireEvent.press(view.getByLabelText('Remove the question'));
  expect(view.getByText(/Nothing saved yet/)).toBeTruthy();
});
