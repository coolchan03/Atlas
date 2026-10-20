/**
 * Language course: units in order, each a topic with the English words and phrases it teaches.
 * Translations come from the phone's phrase cards where they exist (Health & help), and are
 * otherwise written once by the on-device model and kept (see languageService).
 */
import { PHRASES_EN } from '../phrases/data';

export interface Unit { id: string; title: string; icon: string; items: string[]; builtIn?: boolean }

export const UNITS: Unit[] = [
  { id: 'basics', title: 'Basics', icon: 'smile', items: ['hello', 'goodbye', 'please', 'thank you', 'yes', 'no', 'sorry', 'excuse me'] },
  { id: 'intro', title: 'Meeting people', icon: 'users', items: ['What is your name?', 'My name is Sam.', 'Nice to meet you.', 'How are you?', 'I am fine.', 'Where are you from?', 'I speak a little.', 'I do not understand.'] },
  { id: 'numbers', title: 'Numbers', icon: 'hash', items: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] },
  { id: 'food', title: 'Food and drink', icon: 'coffee', items: ['water', 'bread', 'coffee', 'tea', 'I am hungry.', 'The bill, please.', 'I would like a coffee.', 'It is delicious.'] },
  { id: 'directions', title: 'Directions', icon: 'compass', items: ['left', 'right', 'straight ahead', 'near', 'far', 'Where is the station?', 'Where is the bathroom?', 'Turn left here.'] },
  { id: 'shopping', title: 'Shopping', icon: 'shopping-bag', items: ['How much is it?', 'too expensive', 'I will take it.', 'cash', 'card', 'open', 'closed', 'the market'] },
  { id: 'time', title: 'Time and days', icon: 'clock', items: ['today', 'tomorrow', 'yesterday', 'morning', 'night', 'What time is it?', 'Monday', 'the weekend'] },
  { id: 'family', title: 'Family', icon: 'heart', items: ['mother', 'father', 'friend', 'child', 'brother', 'sister', 'my family', 'I have two children.'] },
  { id: 'travel', title: 'Travel', icon: 'map', items: ['hotel', 'ticket', 'airport', 'bus', 'train', 'passport', 'Where is the bus stop?', 'I have a reservation.'] },
  // Translations already on the phone (phrase cards), so this unit works with no model at all.
  { id: 'help', title: 'Health and help', icon: 'life-buoy', items: PHRASES_EN.slice(0, 12), builtIn: true },
];

export const unitById = (id: string) => UNITS.find((u) => u.id === id);
