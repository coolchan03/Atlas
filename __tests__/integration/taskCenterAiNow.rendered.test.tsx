import { requireRTL } from '../harness/nativeBoundary';

jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }), useRoute: () => ({ params: {} }) }));

it('says which model is loaded, how it runs and what the AI is doing, and which model an AI job started with', async () => {
  const rtl = requireRTL();
  const React = require('react');
  const { useAppStore } = require('../../src/stores/appStore');
  const { llmService } = require('../../src/services/llm');
  const { TaskCenterScreen } = require('../../src/tasks/TaskCenterScreen');
  const { useTasks } = require('../../src/tasks/taskRegistry');
  const { runBackgroundJob } = require('../../src/services/llmJobQueue');
  useTasks.setState({ tasks: [] });

  const view = rtl.render(React.createElement(TaskCenterScreen));
  expect(view.getByTestId('ai-now-model').props.children.join('')).toMatch(/No model selected/);
  expect(view.getByTestId('ai-now-doing').props.children.join('')).toMatch(/Idle/);

  useAppStore.setState({ downloadedModels: [{ id: 'm1', name: 'Qwen3.5-9B', fileName: 'q.gguf', filePath: '/m/q.gguf', fileSize: 5 * 1024 ** 3, quantization: 'Q4_0' }], activeModelId: 'm1'});
  jest.spyOn(llmService, 'isModelLoaded').mockReturnValue(true);
  jest.spyOn(llmService, 'getGpuInfo').mockReturnValue({ gpu: false, gpuBackend: 'CPU', gpuLayers: 0, reasonNoGPU: '' });
  rtl.act(() => { useTasks.getState().start({ type: 'other', title: 'Working through steps' }); });
  expect(useTasks.getState().tasks[0].model).toBe('Qwen3.5-9B');

  await rtl.act(async () => { await new Promise((r) => setTimeout(r, 20)); }); // the saved settings finish loading first
  useAppStore.getState().updateSettings({ nThreads: 6, contextLength: 8192 });
  // A background job shows with its label while it runs, and the card is idle again after.
  let finish!: () => void;
  const job = runBackgroundJob(() => new Promise<void>((r) => { finish = r; }), { label: 'Writing a script or lesson' });
  await rtl.waitFor(() => expect(view.getByTestId('ai-now-doing').props.children.join('')).toMatch(/Writing a script or lesson/));
  expect(view.getByTestId('ai-now-model').props.children.join('')).toMatch(/Qwen3\.5-9B \(Q4_0, 5\.0 GB\)/);
  expect(view.getByTestId('ai-now-running-on').props.children.join('')).toMatch(/CPU, 6 threads, context 8192/);
  await rtl.act(async () => { finish(); await job; });
  await rtl.waitFor(() => expect(view.getByTestId('ai-now-doing').props.children.join('')).toMatch(/Idle/));
});
