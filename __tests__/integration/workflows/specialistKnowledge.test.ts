/** A built-in multi-step helper works with its specialist's built-in knowledge: every step's system prompt starts with it. */
import { installNativeBoundary } from '../../harness/nativeBoundary';

const mockSystems: string[] = [];
jest.mock('../../../src/study/engine', () => ({
  askModel: async (system: string) => { mockSystems.push(system); return '{"questions":["Is it plugged in?"]}'; },
}));

it('gives the repair job the Repair Helper\'s safety facts, the dinner job the Home Chef\'s temperatures, and leaves other jobs alone', async () => {
  installNativeBoundary({ fs: true });
  const { beginWorkflow } = require('../../../src/workflows/service');

  mockSystems.length = 0;
  await beginWorkflow('repair', 'front-loading washer stops mid-cycle and shows E21').done;
  expect(mockSystems[0]).toContain('BUILT-IN REPAIR BASICS');
  expect(mockSystems[0]).toContain('Set a water heater to 120 F (49 C)');
  expect(mockSystems[0]).toMatch(/You help people fix household things\./); // the step's own instruction still follows the facts

  mockSystems.length = 0;
  await beginWorkflow('cook', 'eggs, rice, chicken thighs, onions', { diners: '2', time: '30 minutes' }).done;
  expect(mockSystems[0]).toContain('cook poultry (chicken, turkey) to 165 F (74 C)');

  mockSystems.length = 0;
  await beginWorkflow('budget', 'Salary 3000. Rent 1200.').done.catch(() => undefined);
  for (const s of mockSystems) expect(s).not.toContain('BUILT-IN');
});
