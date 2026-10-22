jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
}));
jest.mock('../../../../src/stores/appStore', () => ({
  useAppStore: { getState: jest.fn() },
}));
import { Alert } from 'react-native';
import { useAppStore } from '../../../../src/stores/appStore';
import {
  confirmToolEnable, requestToolAccess,
} from '../../../../src/services/tools/toolAccess';

const run = jest.fn().mockResolvedValue('performed requested action');
const updateSettings = jest.fn();
const settings = { enabledTools: ['request_tool_access'] };
beforeEach(() => {
  jest.clearAllMocks();
  settings.enabledTools = ['request_tool_access'];
  (useAppStore.getState as jest.Mock).mockReturnValue({ settings, updateSettings });
  run.mockResolvedValue('performed requested action');
});
function choose(label: string) {
  const [, , buttons] = (Alert.alert as jest.Mock).mock.calls[0];
  const button = buttons.find((b: { text: string }) => b.text === label);
  button.onPress();
}
describe('disabled-tool enable and execute flow', () => {
  it('shows distinct allow once / always / deny choices', async () => {
    const promise = confirmToolEnable('Calculator', 'Evaluate math expressions');
    const [, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0];
    expect(body).toContain('Calculator');
    expect(buttons.map((x: { text: string }) => x.text)).toEqual(['Not now', 'Once', 'Always']);
    choose('Once');
    await expect(promise).resolves.toBe('once');
  });
  it('denies execution without approval', async () => {
    const action = requestToolAccess({ toolName: 'calculator', json: '{"expression":"1+1"}' }, run);
    choose('Not now');
    await expect(action).resolves.toContain('declined');
    expect(run).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
  });
  it('allows once and executes exactly the selected built-in tool', async () => {
    const action = requestToolAccess({ toolName: 'calculator', json: '{"expression":"1+1"}' }, run);
    choose('Once');
    expect(await action).toContain('approved for this request only');
    expect(run).toHaveBeenCalledWith('calculator', { expression: '1+1' });
    expect(updateSettings).not.toHaveBeenCalled();
  });
  it('always enables and executes once', async () => {
    const action = requestToolAccess({ toolName: 'calculator', json: '{"expression":"3+3"}' }, run);
    choose('Always');
    await action;
    expect(updateSettings).toHaveBeenCalledWith({ enabledTools: ['request_tool_access', 'calculator'] });
    expect(run).toHaveBeenCalledTimes(1);
  });
  it('blocks arbitrary plugin names, malformed JSON and self-invocation', async () => {
    await expect(requestToolAccess({ toolName: 'evil_script', json: '{}' }, run)).rejects.toThrow();
    await expect(requestToolAccess({ toolName: 'request_tool_access', json: '{}' }, run)).rejects.toThrow();
    await expect(requestToolAccess({ toolName: 'calculator', json: '[2]' }, run)).rejects.toThrow();
    await expect(requestToolAccess({ toolName: 'calculator', json: '{"__proto__":{}}' }, run)).rejects.toThrow();
    expect(run).not.toHaveBeenCalled();
  });
  it('runs already-enabled tools without altering settings', async () => {
    settings.enabledTools = ['request_tool_access', 'calculator'];
    expect(await requestToolAccess({ toolName: 'calculator', json: '{"expression":"4"}' }, run)).toContain('approved for this request only');
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
