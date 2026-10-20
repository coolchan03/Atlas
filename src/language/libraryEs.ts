/**
 * Pre-made pieces written out in full in Spanish, so they open instantly with no model. The
 * rest of the library is written by the AI on the phone from its outline (library.ts).
 */
import type { Line, Listening, Part, Question, Word } from './listening';

const q = (question: string, options: string[], answer: number): Question => ({ q: question, options, answer });
const part = (lines: [string, string, string?][], question?: Question): Part =>
  ({ lines: lines.map(([t, en, speaker]): Line => (speaker ? { speaker, t, en } : { t, en })), ...(question ? { question } : {}) });
const words = (list: [string, string][]): Word[] => list.map(([t, en]) => ({ t, en }));
const piece = ([kind, title]: [Listening['kind'], string], parts: Part[], vocab: Word[]): Omit<Listening, 'createdAt'> => ({ kind, title, parts, vocab });

export const WRITTEN_ES: Record<string, Omit<Listening, 'createdAt'>> = {
  'three-pigs': piece(['story', 'Los tres cerditos'], [
    part([
      ['Hay tres cerditos.', 'There are three little pigs.'],
      ['El primer cerdito hace una casa de paja.', 'The first little pig makes a house of straw.'],
      ['El segundo hace una casa de palos.', 'The second makes a house of sticks.'],
      ['El tercero hace una casa de ladrillos. Es lento, pero la casa es fuerte.', 'The third makes a house of bricks. He is slow, but the house is strong.'],
    ], q('What is the third house made of?', ['Straw', 'Sticks', 'Bricks'], 2)),
    part([
      ['Un lobo llega a la casa de paja.', 'A wolf arrives at the straw house.'],
      ['"Soplo y soplo", dice el lobo. La casa cae.', '"I blow and I blow," says the wolf. The house falls.'],
      ['El cerdito corre a la casa de palos. El lobo sopla otra vez y la casa cae.', 'The little pig runs to the stick house. The wolf blows again and the house falls.'],
    ], q('What does the wolf do to the houses?', ['He blows them down', 'He buys them', 'He paints them'], 0)),
    part([
      ['Los dos cerditos corren a la casa de ladrillos.', 'The two little pigs run to the brick house.'],
      ['El lobo sopla y sopla, pero la casa no cae.', 'The wolf blows and blows, but the house does not fall.'],
      ['El lobo está cansado y se va. Los tres cerditos están contentos.', 'The wolf is tired and leaves. The three little pigs are happy.'],
    ], q('How do the pigs feel at the end?', ['Sad', 'Happy', 'Angry'], 1)),
  ], words([['cerdito', 'little pig'], ['casa', 'house'], ['paja', 'straw'], ['palo', 'stick'], ['ladrillo', 'brick'], ['lobo', 'wolf'], ['soplar', 'to blow'], ['fuerte', 'strong'], ['cansado', 'tired']])),

  'wrong-coffee': piece(['story', 'El café equivocado'], [
    part([
      ['Sam entra en un café.', 'Sam goes into a cafe.'],
      ['"Un café solo, pequeño, por favor", dice Sam.', '"A small black coffee, please," says Sam.'],
      ['El camarero dice: "Muy bien."', 'The waiter says: "Very good."'],
    ], q('What does Sam order?', ['A small black coffee', 'A big tea', 'A cake'], 0)),
    part([
      ['El camarero trae un chocolate caliente enorme, con nata.', 'The waiter brings a huge hot chocolate, with cream.'],
      ['Sam mira el chocolate. No dice nada. Es tímido.', 'Sam looks at the chocolate. He says nothing. He is shy.'],
      ['Sam bebe todo el chocolate, despacio.', 'Sam drinks all the chocolate, slowly.'],
    ], q('Why does Sam say nothing?', ['He is shy', 'He is angry', 'He is asleep'], 0)),
    part([
      ['Después, Sam llama al camarero.', 'Afterwards, Sam calls the waiter.'],
      ['"Y ahora... un café solo, pequeño, por favor."', '"And now... a small black coffee, please."'],
      ['El camarero sonríe y trae un té.', 'The waiter smiles and brings a tea.'],
    ], q('What does the waiter bring the second time?', ['A coffee', 'A tea', 'Water'], 1)),
  ], words([['camarero', 'waiter'], ['café solo', 'black coffee'], ['pequeño', 'small'], ['enorme', 'huge'], ['nata', 'cream'], ['tímido', 'shy'], ['despacio', 'slowly'], ['sonreír', 'to smile']])),

  'weekend': piece(['podcast', '¿Qué haces este fin de semana?'], [
    part([
      ['Hola, Leo. ¿Qué haces este fin de semana?', 'Hi, Leo. What are you doing this weekend?', 'Ana'],
      ['Hola, Ana. El sábado voy al mercado por la mañana.', 'Hi, Ana. On Saturday I am going to the market in the morning.', 'Leo'],
      ['¿Qué compras en el mercado?', 'What do you buy at the market?', 'Ana'],
      ['Fruta, pan y queso. Me gusta mucho el queso.', 'Fruit, bread and cheese. I like cheese a lot.', 'Leo'],
    ], q('When does Leo go to the market?', ['Saturday morning', 'Sunday night', 'Friday'], 0)),
    part([
      ['¿Y tú, Ana?', 'And you, Ana?', 'Leo'],
      ['El sábado por la tarde voy al cine con mi hermana.', 'On Saturday afternoon I am going to the cinema with my sister.', 'Ana'],
      ['¿Qué película?', 'Which film?', 'Leo'],
      ['Una comedia. Necesito reír.', 'A comedy. I need to laugh.', 'Ana'],
    ], q('Who does Ana go to the cinema with?', ['Her mother', 'Her sister', 'Leo'], 1)),
    part([
      ['¿Y el domingo?', 'And on Sunday?', 'Ana'],
      ['El domingo como con mis padres. ¿Hace buen tiempo?', 'On Sunday I have lunch with my parents. Is the weather good?', 'Leo'],
      ['Sí, hace sol. Perfecto para un paseo.', 'Yes, it is sunny. Perfect for a walk.', 'Ana'],
    ], q('What is the weather like on Sunday?', ['Rainy', 'Sunny', 'Cold'], 1)),
  ], words([['fin de semana', 'weekend'], ['mercado', 'market'], ['queso', 'cheese'], ['cine', 'cinema'], ['película', 'film'], ['reír', 'to laugh'], ['padres', 'parents'], ['hace sol', 'it is sunny'], ['paseo', 'walk']])),

  'cat-mayor': piece(['podcast', 'Un gato es alcalde'], [
    part([
      ['Buenos días. Hoy tenemos una noticia inventada y divertida.', 'Good morning. Today we have a made-up, funny news story.', 'Ana'],
      ['En un pueblo pequeño, la gente elige a un gato como alcalde.', 'In a small town, the people choose a cat as mayor.', 'Leo'],
      ['¿Un gato? ¿De verdad?', 'A cat? Really?', 'Ana'],
      ['Sí. Se llama Bigotes y es negro y blanco.', 'Yes. His name is Whiskers and he is black and white.', 'Leo'],
    ], q('Who is the new mayor?', ['A dog', 'A cat', 'A child'], 1)),
    part([
      ['¿Y qué hace el alcalde Bigotes?', 'And what does Mayor Whiskers do?', 'Ana'],
      ['Duerme en todas las reuniones.', 'He sleeps in every meeting.', 'Leo'],
      ['Pero la gente está contenta. El pueblo está tranquilo.', 'But the people are happy. The town is calm.', 'Ana'],
    ], q('What does the mayor do in meetings?', ['He sleeps', 'He sings', 'He eats'], 0)),
    part([
      ['¿Tiene una ley nueva?', 'Does he have a new law?', 'Ana'],
      ['Sí, su primera ley: más pescado para todos.', 'Yes, his first law: more fish for everyone.', 'Leo'],
      ['Me gusta este alcalde. Hasta mañana.', 'I like this mayor. See you tomorrow.', 'Ana'],
    ], q('What is the first law?', ['More fish', 'No cars', 'Longer holidays'], 0)),
  ], words([['noticia', 'news story'], ['inventada', 'made up'], ['pueblo', 'town'], ['elegir', 'to choose'], ['alcalde', 'mayor'], ['bigotes', 'whiskers'], ['reunión', 'meeting'], ['ley', 'law'], ['pescado', 'fish (to eat)']])),
};

/** A written-out piece for a language, if there is one (Spanish only for now). */
export const writtenPiece = (id: string, code: string): Omit<Listening, 'createdAt'> | undefined =>
  (code.startsWith('es') ? WRITTEN_ES[id] : undefined);
