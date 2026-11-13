import { parseQuestionTable } from '../../../src/learning/questionTable';

it('reads a CSV question bank with choices, letter answers, quoted cells and topics, with no AI', () => {
  const csv = `Question,A,B,C,Answer,Explanation,Topic
"Under ASC 842, a lessee records, for most leases:","A right-of-use asset, and a lease liability","Rent expense only","Nothing",A,"Both go on the balance sheet",Leases
Is FIFO oldest-first?,,,,True,,Inventory
"Line one
line two?",x,y,z,2,,`;
  const items = parseQuestionTable(csv)!;
  expect(items).toHaveLength(3);
  expect(items[0]).toMatchObject({ answer: 'A right-of-use asset, and a lease liability', topic: 'Leases', explain: 'Both go on the balance sheet' });
  expect(items[0].options).toHaveLength(3);
  expect(items[1]).toMatchObject({ question: 'Is FIFO oldest-first?', answer: 'True', topic: 'Inventory' });
  expect(items[2].answer).toBe('y');
});

it('reads tab-separated text and refuses text that is not a table', () => {
  expect(parseQuestionTable('question\tanswer\nWhat is 2+2?\t4')).toEqual([{ question: 'What is 2+2?', answer: '4', alternatives: [] }]);
  expect(parseQuestionTable('1. What is the capital of France?\nAnswer: Paris')).toBeNull();
});
