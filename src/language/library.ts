/**
 * Pre-made stories and podcasts for the course: simplified fairy tales and fables, funny
 * everyday moments, friends talking, and news (made-up, historical, and today's real
 * headlines). Each piece has an English outline; some are written out in full for Spanish,
 * and the rest are written once by the AI on the phone at the learner's level, then kept.
 * Story and podcast squares on the board land on these, in order. Pure data and lookups.
 */
import { boardFor } from './board';
import type { Listening } from './listening';
import type { LevelId } from './teaching';

export type Genre = 'fairy' | 'fable' | 'daily' | 'chat' | 'travel' | 'news-fake' | 'news-history' | 'news-real';

export interface Premade {
  id: string;
  kind: Listening['kind'];
  genre: Genre;
  title: string;
  level: LevelId;
  /** What happens, in English: the AI retells this at the learner's level. */
  outline: string;
}

export const GENRES: { genre: Genre; kind: Listening['kind']; title: string; icon: string }[] = [
  { genre: 'fairy', kind: 'story', title: 'Fairy tales', icon: 'feather' },
  { genre: 'fable', kind: 'story', title: 'Fables', icon: 'sunrise' },
  { genre: 'daily', kind: 'story', title: 'Funny everyday moments', icon: 'smile' },
  { genre: 'chat', kind: 'podcast', title: 'Friends talking', icon: 'message-circle' },
  { genre: 'travel', kind: 'podcast', title: 'Places and culture', icon: 'map' },
  { genre: 'news-real', kind: 'podcast', title: 'Today\'s real news', icon: 'radio' },
  { genre: 'news-fake', kind: 'podcast', title: 'Made-up news', icon: 'coffee' },
  { genre: 'news-history', kind: 'podcast', title: 'News from history', icon: 'clock' },
];

type Entry = [id: string, title: string, outline: string];
const story = (genre: Genre, level: LevelId, [id, title, outline]: Entry): Premade => ({ id, kind: 'story', genre, level, title, outline });
const pod = (genre: Genre, level: LevelId, [id, title, outline]: Entry): Premade => ({ id, kind: 'podcast', genre, level, title, outline });

/** The id of the one live piece: today's real headlines, read as a short bulletin. */
export const REAL_NEWS = 'news-real-today';

export const LIBRARY: Premade[] = [
  // Fairy tales, simplified.
  story('fairy', 1, ['three-pigs', 'The three little pigs', 'Three pigs build houses of straw, sticks and bricks. A wolf blows down the straw and stick houses. He cannot blow down the brick house. The pigs are safe together.']),
  story('fairy', 1, ['goldilocks', 'Goldilocks and the three bears', 'A girl finds a house in the woods. She tries three bowls of soup, three chairs and three beds: too hot, too cold, just right. The bears come home and she runs away.']),
  story('fairy', 1, ['red-riding-hood', 'Little Red Riding Hood', 'A girl in a red hood takes food to her grandmother. A wolf gets there first and wears grandmother\'s clothes. "What big eyes you have." A woodcutter helps and everyone is fine.']),
  story('fairy', 1, ['gingerbread', 'The gingerbread man', 'A woman bakes a gingerbread man. He jumps up and runs away: "You cannot catch me." Many animals chase him. A clever fox offers to carry him over the river.']),
  story('fairy', 2, ['cinderella', 'Cinderella', 'A kind girl works for her stepmother. A fairy gives her a dress and a coach for the prince\'s party, until midnight. She runs and loses a shoe. The prince finds her with the shoe.']),
  story('fairy', 2, ['hansel-gretel', 'Hansel and Gretel', 'A brother and sister get lost in the forest. They find a house made of sweets. A witch lives there. Gretel tricks the witch and they find their way home.']),
  story('fairy', 2, ['jack-beanstalk', 'Jack and the beanstalk', 'Jack sells the cow for magic beans. A giant beanstalk grows. At the top lives a giant with a goose that lays golden eggs. Jack takes the goose and cuts down the beanstalk.']),
  story('fairy', 2, ['ugly-duckling', 'The ugly duckling', 'A strange grey bird is born with ducklings. The others laugh at him. He is alone all winter. In spring he sees his face in the water: he is a beautiful swan.']),
  story('fairy', 3, ['snow-white', 'Snow White', 'A queen asks her mirror who is the most beautiful. The answer is Snow White, so she must hide. She lives with seven small miners. The queen brings a poisoned apple.']),
  story('fairy', 3, ['emperors-clothes', 'The emperor\'s new clothes', 'Two tricksters sell an emperor "magic" cloth that foolish people cannot see. Nobody wants to look foolish. In the parade, a child says: he has no clothes.']),
  story('fairy', 3, ['sleeping-beauty', 'Sleeping Beauty', 'A princess is cursed to sleep for a hundred years when she touches a spindle. A forest grows around the castle. A prince finds the way in and the whole castle wakes.']),
  story('fairy', 4, ['pied-piper', 'The piper of Hamelin', 'A town full of rats hires a piper. His music leads the rats away. The town refuses to pay. He plays again and the children follow him. A story about keeping promises.']),
  // Fables.
  story('fable', 1, ['tortoise-hare', 'The tortoise and the hare', 'A fast hare laughs at a slow tortoise. They race. The hare sleeps under a tree. The tortoise keeps walking and wins. Slow and steady wins.']),
  story('fable', 1, ['lion-mouse', 'The lion and the mouse', 'A lion catches a mouse and lets it go. Later the lion is caught in a net. The mouse bites the net and frees him. Small friends can help.']),
  story('fable', 2, ['boy-wolf', 'The boy who cried wolf', 'A bored shepherd boy shouts "Wolf." The villagers run to help, but there is no wolf. He does it again. When a real wolf comes, nobody believes him.']),
  story('fable', 2, ['ant-grasshopper', 'The ant and the grasshopper', 'All summer the ant works and stores food. The grasshopper sings and plays. In winter the grasshopper is hungry and asks the ant for help.']),
  story('fable', 3, ['fox-grapes', 'The fox and the grapes', 'A fox sees grapes high on a vine. He jumps and jumps but cannot reach them. He walks away saying they are sour anyway.']),
  story('fable', 3, ['milkmaid', 'The milkmaid and her pail', 'A girl carries milk to market and dreams: milk, then eggs, then chickens, then a new dress. She tosses her head and the milk falls. Do not count your chickens.']),
  // Funny everyday moments.
  story('daily', 1, ['wrong-coffee', 'The wrong coffee', 'Sam orders a small black coffee. The waiter brings a huge hot chocolate with cream. Sam is too shy to say anything, drinks it all, and orders a coffee again.']),
  story('daily', 1, ['lost-keys', 'Where are my keys?', 'Ana is late for work. She looks for her keys in the kitchen, the bedroom, the bathroom and the car. Her daughter laughs: the keys are in her hand.']),
  story('daily', 1, ['dog-sandwich', 'The dog and the sandwich', 'Leo makes a big sandwich and goes to answer the phone. When he comes back the plate is empty. The dog looks at him with big innocent eyes and bread on its nose.']),
  story('daily', 1, ['wrong-bus', 'The wrong bus', 'Maria takes bus 15 to the beach. After an hour she sees mountains, not the sea. She took bus 51. She has a lovely day in the mountains instead.']),
  story('daily', 2, ['haircut', 'The haircut', 'Tom asks for "just a little shorter". He looks at his phone during the haircut. When he looks up, he has almost no hair. His friends say he looks younger.']),
  story('daily', 2, ['gps', 'The GPS knows best', 'A family follows the car GPS on holiday. It sends them down a farm road, into a field and to a river. A farmer with a tractor helps them and invites them to lunch.']),
  story('daily', 2, ['cooking-show', 'Cooking for the in-laws', 'Paula cooks dinner for her partner\'s parents for the first time. Everything burns. She orders pizza and serves it on her best plates. They ask for the recipe.']),
  story('daily', 2, ['video-call', 'The video call', 'Marco has a work video call from home. He wears a shirt and tie, and pyjama shorts. The doorbell rings, he stands up, and everyone sees.']),
  story('daily', 3, ['language-mixup', 'A small mix-up', 'A tourist tries to say "I am embarrassed" in Spanish and says "I am pregnant" (embarazada). The shopkeeper congratulates him. A lesson about false friends.']),
  story('daily', 3, ['neighbours-parcel', 'The neighbour\'s parcel', 'Clara takes in a parcel for a neighbour she has never met. It starts to move and make noises. It is a puppy. The neighbour and Clara become friends.']),
  story('daily', 4, ['job-interview', 'The job interview', 'Javier rushes to an interview and argues with a man about a parking space. He arrives at the interview. The man from the car park is the boss.']),
  story('daily', 4, ['smart-home', 'The smart house', 'Elena buys a smart speaker that controls the house. It misunderstands everything: it orders forty bananas, plays opera at 3 a.m. and locks her out. She goes back to light switches.']),
  // Friends talking.
  pod('chat', 1, ['weekend', 'What are you doing this weekend?', 'Ana and Leo talk about their weekend plans: the market, a film, visiting family, and the weather.']),
  pod('chat', 1, ['favourite-food', 'Favourite food', 'Ana and Leo talk about what they like to eat and drink, and what they do not like at all.']),
  pod('chat', 1, ['family', 'My family', 'Ana and Leo talk about their families: brothers, sisters, parents and a very old cat.']),
  pod('chat', 1, ['pets', 'Cats or dogs?', 'Ana has a cat, Leo has a dog. They argue, kindly, about which pet is better.']),
  pod('chat', 2, ['holidays', 'The last holiday', 'Ana tells Leo about her last holiday: the trip, the hotel, the food and one thing that went wrong.']),
  pod('chat', 2, ['hobbies', 'New hobbies', 'Leo started learning guitar and Ana started running. They talk about how hard it is to start something new.']),
  pod('chat', 2, ['school-days', 'When we were at school', 'Ana and Leo remember school: favourite teachers, subjects they hated, and a funny story.']),
  pod('chat', 3, ['moving-city', 'Moving to a new city', 'Leo is thinking about moving to a big city for work. Ana gives advice about costs, friends and what he would miss.']),
  pod('chat', 3, ['screen-time', 'Too much phone?', 'Ana and Leo talk about how much they use their phones, and whether to try a week without social media.']),
  pod('chat', 4, ['dream-job', 'The dream job', 'Ana and Leo discuss what makes a good job: money, free time, meaning. They disagree and give reasons.']),
  // Places and culture.
  pod('travel', 1, ['at-the-market', 'At the market', 'Ana shows Leo around a food market: fruit, cheese, bread, prices and how to ask for things.']),
  pod('travel', 2, ['festivals', 'Festivals', 'Ana and Leo talk about famous festivals: a tomato fight, a festival of lights, and a local party in their town.']),
  pod('travel', 2, ['train-trip', 'A trip by train', 'Leo plans a train trip and Ana helps: tickets, times, changing trains, and what to bring.']),
  pod('travel', 3, ['meal-times', 'Meal times around the world', 'Ana and Leo compare when people eat in different countries: late dinners, long lunches, and small snacks.']),
  pod('travel', 4, ['cities-change', 'How cities change', 'Ana and Leo talk about how their city has changed: new shops, tourists, prices, and what has been lost.']),
  // Made-up news (clearly made up, for fun).
  pod('news-fake', 1, ['cat-mayor', 'Cat becomes mayor', 'Made-up news: a small town chooses a cat as mayor. The cat sleeps in meetings. People are happy. The cat\'s first law: more fish.']),
  pod('news-fake', 1, ['giant-carrot', 'The giant carrot', 'Made-up news: a farmer grows a carrot as big as a car. The whole village helps to pull it out. They make soup for everyone.']),
  pod('news-fake', 2, ['robot-waiter', 'Robot waiter is too polite', 'Made-up news: a cafe buys a robot waiter. It says "thank you" so many times that nobody gets their food. The owner gives it a new job: saying hello.']),
  pod('news-fake', 2, ['penguin-bus', 'Penguin takes the bus', 'Made-up news: a penguin from the zoo gets on a city bus every morning and gets off at the fish market. The driver gives it a free ticket.']),
  pod('news-fake', 3, ['silent-city', 'The city of silence', 'Made-up news: a city bans car horns, loud music and shouting for one day. People hear birds for the first time. Some love it, some find it strange.']),
  pod('news-fake', 4, ['four-day-week', 'Everyone gets Friday off', 'Made-up news: a country tries a four-day working week. Reporters talk to a happy worker, a worried shop owner and an expert.']),
  // News from history.
  pod('news-history', 2, ['moon-landing', '1969: people walk on the Moon', 'A news report from July 1969: Apollo 11 lands on the Moon. Neil Armstrong and Buzz Aldrin walk on it. Millions watch on television.']),
  pod('news-history', 2, ['first-flight', '1903: the first aeroplane flight', 'A news report from December 1903: the Wright brothers fly a plane for 12 seconds at Kitty Hawk.']),
  pod('news-history', 2, ['penicillin', '1928: a mould that kills germs', 'A news report: Alexander Fleming comes back from holiday and finds mould killing bacteria in his lab. This becomes penicillin.']),
  pod('news-history', 3, ['berlin-wall', '1989: the Berlin Wall opens', 'A news report from November 1989: the border in Berlin opens. People cross, climb the wall and celebrate together.']),
  pod('news-history', 3, ['titanic', '1912: the Titanic sinks', 'A news report from April 1912: the new ship Titanic hits an iceberg on its first trip. Many people die; there are not enough lifeboats.']),
  pod('news-history', 3, ['printing-press', 'Around 1450: books for everyone', 'A news report as if from the 1450s: Gutenberg prints books with moving metal letters. Books become cheaper and more people learn to read.']),
  pod('news-history', 4, ['everest', '1953: the top of Everest', 'A news report from May 1953: Edmund Hillary and Tenzing Norgay reach the top of Mount Everest for the first time.']),
  pod('news-history', 4, ['world-wide-web', '1991: the World Wide Web', 'A news report from 1991: Tim Berners-Lee puts the first website online, at CERN, and offers the idea to everyone for free.']),
  // Today's real headlines, written as a short bulletin when opened.
  pod('news-real', 1, [REAL_NEWS, 'Today\'s real news', 'A short, simple news bulletin about today\'s real headlines.']),
];

export const pieceById = (id: string) => LIBRARY.find((x) => x.id === id);

/** The library for one kind, in the order of its genres. */
export const libraryFor = (kind: Listening['kind']) =>
  GENRES.filter((g) => g.kind === kind).map((g) => ({ ...g, pieces: LIBRARY.filter((x) => x.genre === g.genre) }));

/**
 * The pre-made piece a story or podcast square lands on: pieces at that level first (then
 * easier ones), in turn, so each square has its own piece. Real news is never on the board,
 * since a square should be the same piece every time it is played.
 */
export function pieceForSpace(level: LevelId, spaceKey: string): Premade | undefined {
  const spaces = boardFor(level);
  const space = spaces.find((s) => s.key === spaceKey);
  if (!space) return undefined;
  const ordinal = spaces.filter((s) => s.kind === space.kind).findIndex((s) => s.key === spaceKey);
  const fits = LIBRARY.filter((x) => x.kind === space.kind && x.id !== REAL_NEWS);
  const pool = [...fits.filter((x) => x.level === level), ...fits.filter((x) => x.level < level).reverse()];
  return pool.length ? pool[ordinal % pool.length] : undefined;
}
