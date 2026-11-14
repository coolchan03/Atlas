/** Realistic app state for exploring screens: models, a project with saved study results, chats, an agent. Call after installNativeBoundary. */
import { createDownloadedModel, createONNXImageModel, createConversationWithMessages } from '../utils/factories';

const src = [{ n: 1, doc: 'Book', part: 1, text: 'Assets equal liabilities plus equity.' }, { n: 2, doc: 'Book', part: 2, text: 'A lease is a contract to use an asset.' }];
export const studyResults = (): unknown[] => [
  { kind: 'guide', createdAt: 1, topic: 'Leases', title: 'Study guide', sources: src, text: '# Guide\n\nA lease is a contract [2].' },
  { kind: 'cards', createdAt: 2, topic: 'Leases', title: 'Cards', sources: src, cards: [{ q: 'What is a lease?', a: 'A contract', src: [2] }, { q: 'Assets?', a: 'What you own', src: [1] }] },
  { kind: 'quiz', createdAt: 3, topic: 'Leases', title: 'Quiz', sources: src, quiz: [{ q: 'Which is a lease?', options: ['a', 'b', 'c'], answer: 1, why: 'because', src: [2] }] },
  { kind: 'podcast', createdAt: 4, topic: 'Leases', title: 'Episode', sources: src, hosts: 2, minutes: 3, podcast: [{ host: 'A', text: 'Welcome to leases.' }, { host: 'B', text: 'A lease is a contract.' }] },
  { kind: 'slides', createdAt: 5, topic: 'Leases', title: 'Deck', sources: src, slides: [{ title: 'Leases', bullets: ['Contract', 'Asset'], narration: 'Leases are contracts.', src: [2] }] },
  { kind: 'game', createdAt: 6, topic: 'Leases', title: 'Memory pairs', sources: src, game: { type: 'pairs', data: { terms: [{ answer: 'Lease', clue: 'Contract to use an asset', src: [2] }, { answer: 'Equity', clue: 'Owner claim', src: [1] }, { answer: 'Assets', clue: 'What you own', src: [1] }, { answer: 'Debt', clue: 'What you owe', src: [1] }], cards: [] } } },
  { kind: 'answer', createdAt: 7, topic: 'Q', title: 'Answer', sources: src, text: 'It is a contract [2].' },
];

export interface Seeded { project: string; model: string; image: string; agent: string; chat: string }

export function seedApp(): Seeded {
  const { useAppStore, useChatStore } = require('../../src/stores');
  const { useProjectStore } = require('../../src/stores/projectStore');
  const { useStudyStore } = require('../../src/study/store');
  const { useAgentStore } = require('../../src/stores/agentStore');
  const model = createDownloadedModel({ id: 'm1', name: 'Test model', filePath: '/models/m1.gguf', fileSize: 800 * 1024 * 1024 });
  useAppStore.setState({
    downloadedModels: [model, createDownloadedModel({ id: 'm2', name: 'Second', filePath: '/models/m2.gguf', fileSize: 2 * 1024 ** 3 })],
    activeModelId: 'm1', downloadedImageModels: [createONNXImageModel({ id: 'img1', name: 'Test image model' })], modelNicknames: { m2: 'Big one' },
  });
  const project = useProjectStore.getState().createProject({ name: 'FAR prep', description: 'Notes', systemPrompt: 'Tutor', icon: '#1D4ED8' });
  for (const r of studyResults()) useStudyStore.getState().add(project.id, r);
  const chats = [createConversationWithMessages({ title: 'Lease questions', projectId: project.id }), createConversationWithMessages({ title: 'Taxes' }), createConversationWithMessages({ title: 'Archived', isArchived: true } as never)];
  useChatStore.setState({ conversations: chats, activeConversationId: chats[0].id });
  return { project: project.id, model: 'm1', image: 'img1', agent: useAgentStore.getState().agents[0].id, chat: chats[0].id };
}
