/**
 * Writes a lesson in pieces (see lessonParts.ts for why): the outline, then the sections two at a time, then the mistakes and key points.
 * The model call and the saving are handed in, so this holds only the order of the work. After the first piece the lesson exists and is
 * kept as it grows; a later piece that fails ends the writing with the sections already written, instead of losing the lesson.
 */
import { contentMessages, parseContent, type SquareContent, type SquareRequest } from './formats';
import { FINISH_SHAPE, OUTLINE_SHAPE, PART_SHAPE, PIECE_MAX_CHARS, finishPart, groupsOf, outlinePart, parseFinish, parseOutline, passagesFor, sectionsPart } from './lessonParts';
import logger from '../utils/logger';

type Lesson = Extract<SquareContent, { kind: 'lesson' }>;
export interface LessonIO {
  ask: <T>(prompt: { system: string; user: string }, read: (raw: string) => T | null, how: { what: string; maxChars: number }) => Promise<T>;
  save: (lesson: Lesson) => void;
  stopped: () => boolean;
}

export async function writeLessonInPieces(base: SquareRequest, io: LessonIO): Promise<Lesson> {
  const outline = await io.ask(contentMessages({ ...base, shape: OUTLINE_SHAPE, part: outlinePart, excerpts: base.excerpts?.slice(0, 3) }), parseOutline, { what: 'the outline of the lesson', maxChars: 3000 });
  logger.log(`[LESSON] in pieces: ${outline.length} sections, ${Math.ceil(outline.length / 2)} calls for them`);
  const sections: Lesson['sections'] = [];
  for (const group of groupsOf(outline)) {
    if (io.stopped()) throw new Error('Stopped.');
    try {
      const part = await io.ask(contentMessages({ ...base, shape: PART_SHAPE, part: sectionsPart(group, outline), excerpts: passagesFor(base.excerpts, group) }),
        (raw) => { const c = parseContent('lesson', raw); return c?.kind === 'lesson' ? c.sections : null; }, { what: `the sections "${group.map((g) => g.heading).join('", "')}"`, maxChars: PIECE_MAX_CHARS });
      sections.push(...part);
      io.save({ kind: 'lesson', sections: [...sections], keyPoints: [] }); // kept as soon as it is written
    } catch (e) {
      if (io.stopped() || !sections.length) throw e;
      logger.warn(`[LESSON] a later piece failed, keeping the ${sections.length} sections already written: ${String((e as Error)?.message || e).slice(0, 200)}`);
      break;
    }
  }
  let rest: ReturnType<typeof parseFinish> = null;
  if (!io.stopped()) {
    try { rest = await io.ask(contentMessages({ ...base, shape: FINISH_SHAPE, part: finishPart(outline), excerpts: undefined }), parseFinish, { what: 'the key points of the lesson', maxChars: 4000 }); }
    catch (e) { if (io.stopped()) throw e; logger.warn(`[LESSON] the key points could not be written: ${String((e as Error)?.message || e).slice(0, 200)}`); }
  }
  return { kind: 'lesson', sections, keyPoints: rest?.keyPoints ?? [], ...(rest?.commonMistakes ? { commonMistakes: rest.commonMistakes } : {}), ...(rest?.quickCheck ? { quickCheck: rest.quickCheck } : {}) };
}
