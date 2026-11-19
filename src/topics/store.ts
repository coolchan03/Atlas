import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localUniqueId } from '../utils/uniqueId';
import { MAX_SQUARES, type CoursePlan, type CourseRequest, type PlannedSquare, type SquareContent } from './formats';
import { difficultyFromLevel, type Difficulty } from '../study/difficulty';
import { MAX_SOURCES, type CourseSource } from './sources';

export interface Course {
  id: string;
  topic: string;
  title: string;
  summary: string;
  style: string;
  theme: string;
  request: CourseRequest;
  squares: PlannedSquare[];
  content: Record<string, SquareContent>;
  progress: Record<string, { stars: number }>;
  createdAt: number;
  lastPlayedAt?: number;
  /** The learner's own material (pages found online, notes, files) the squares are written from. */
  sources: CourseSource[];
  /** Every chapter of every textbook the course was planned from (book, number, title), kept whatever unit it was grouped under, so coverage by book can be shown. */
  bookChapters?: Array<{ doc: string; number: number; title: string }>;
  /** The project this course belongs to: its shared documents are material for the squares, and its chats are where the tutor talks. */
  projectId?: string;
  /** Per square: the passages from the learner's own books and sources it was written from, so they can check it. */
  cited?: Record<string, { source: string; url?: string; docId?: number; where?: string; text: string }[]>;
  /** How hard the squares, questions and tests are (beginner, moderate or hard). */
  difficulty?: Difficulty;
  /** How many of the next lessons are written ahead of time while you play (0 turns it off). Missing means the default. */
  prepareAhead?: number;
  /** How long and detailed the readings are: 'deep' (the default) writes each section as full textbook paragraphs, 'standard' keeps it short. */
  readingDepth?: 'standard' | 'deep';
}

export interface SharedCourse {
  atlasCourse: 1;
  title: string; topic: string; summary: string; style: string; theme: string;
  request: Course['request'];
  squares: PlannedSquare[];
  content: Record<string, SquareContent>;
  sources: { title: string; kind: 'web' | 'note' | 'file'; url?: string; text: string }[];
}

interface TopicsState {
  courses: Course[];
  add: (request: CourseRequest, plan: CoursePlan, origin?: { sources?: CourseSource[]; projectId?: string; bookChapters?: Course['bookChapters'] }) => string;
  /** A course opened from a file someone sent: its squares and content, with no progress and no project. */
  addShared: (shared: SharedCourse, projectId?: string) => string;
  addSources: (id: string, sources: CourseSource[]) => void;
  removeSource: (id: string, sourceId: string) => void;
  /** Connects the course to a project (its documents are searched for each square), or disconnects it. */
  setProject: (id: string, projectId: string | undefined) => void;
  /** Adds one lesson square for each item (before the final quiz when the board ends with one). */
  addLessons: (id: string, items: { title: string; focus: string; unit: string }[]) => void;
  setCited: (id: string, key: string, passages: { source: string; url?: string; docId?: number; where?: string; text: string }[]) => void;
  /** Changes the difficulty; squares not played yet are written again at the new level. */
  setDifficulty: (id: string, difficulty: Difficulty) => void;
  /** Sets how many of the next lessons are written ahead of time. */
  setPrepareAhead: (id: string, count: number) => void;
  /** Changes how detailed the readings are; readings not played yet are written again that way. */
  setReadingDepth: (id: string, depth: 'standard' | 'deep') => void;
  clearContent: (id: string, key: string) => void;
  /** Adds one square of any kind (a game, a quiz, a match...) to the board, after the given square, in the same unit. Returns its key, or null when the board is full. */
  addSquare: (id: string, afterKey: string, square: { format: PlannedSquare['format']; title: string; focus: string }) => string | null;
  /** When a square went badly: puts a lesson that explains it differently right after it, and (for a quiz, a task or the like) a second square of the same kind with new questions after that. Returns whether any were added. */
  addRemedial: (id: string, afterKey: string) => boolean;
  remove: (id: string) => void;
  /** Records every chapter of every book found in the course's project (for coverage views). */
  setBookChapters: (id: string, chapters: NonNullable<Course['bookChapters']>) => void;
  setContent: (id: string, key: string, content: SquareContent) => void;
  complete: (id: string, key: string, stars: number) => void;
}

export const useTopics = create<TopicsState>()(persist((set) => ({
  courses: [],
  add: (request, plan, origin = {}) => {
    const { sources = [], projectId, bookChapters } = origin;
    const id = localUniqueId('course');
    const course: Course = {
      id, topic: request.topic, title: plan.title, summary: plan.summary, style: plan.style, theme: plan.theme, request,
      squares: plan.squares, content: {}, progress: {}, createdAt: Date.now(), sources, projectId, difficulty: difficultyFromLevel(request.level),
      ...(bookChapters?.length ? { bookChapters } : {}),
    };
    set((s) => ({ courses: [course, ...s.courses] }));
    return id;
  },
  remove: (id) => set((s) => ({ courses: s.courses.filter((c) => c.id !== id) })),
  setBookChapters: (id, chapters) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, bookChapters: chapters } : c)) })),
  addShared: (shared, projectId) => {
    const id = localUniqueId('course');
    const course: Course = {
      id, topic: shared.topic, title: shared.title, summary: shared.summary, style: shared.style, theme: shared.theme, request: shared.request,
      squares: shared.squares, content: shared.content, progress: {}, createdAt: Date.now(), projectId,
      sources: shared.sources.filter((x) => x.text).map((x, i) => ({ id: `shared-${Date.now()}-${i}`, title: x.title, kind: x.kind, url: x.url, text: x.text, addedAt: Date.now() })),
    };
    set((s) => ({ courses: [course, ...s.courses] }));
    return id;
  },
  addSources: (id, sources) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, sources: [...(c.sources ?? []), ...sources].slice(-MAX_SOURCES) } : c)) })),
  setProject: (id, projectId) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, projectId } : c)) })),
  removeSource: (id, sourceId) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, sources: (c.sources ?? []).filter((x) => x.id !== sourceId) } : c)) })),
  addLessons: (id, items) => set((s) => ({ courses: s.courses.map((c) => {
    if (c.id !== id || !items.length) return c;
    let n = c.squares.reduce((m, q) => Math.max(m, Number(q.key.replace(/\D/g, '')) || 0), 0);
    const added = items.map((it) => ({ key: `s${++n}`, format: 'lesson' as const, title: it.title.slice(0, 60), focus: it.focus, unit: it.unit }));
    const last = c.squares[c.squares.length - 1];
    const squares = last?.checkpoint && last.format === 'quiz' ? [...c.squares.slice(0, -1), ...added, last] : [...c.squares, ...added];
    return { ...c, squares: squares.slice(0, 80) };
  }) })),
  setDifficulty: (id, difficulty) => set((s) => ({ courses: s.courses.map((c) => (c.id !== id || c.difficulty === difficulty ? c : {
    ...c, difficulty, content: Object.fromEntries(Object.entries(c.content).filter(([key]) => !!c.progress[key])),
  })) })),
  setCited: (id, key, passages) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, cited: { ...(c.cited ?? {}), [key]: passages.slice(0, 6) } } : c)) })),
  clearContent: (id, key) => set((s) => ({ courses: s.courses.map((c) => {
    if (c.id !== id) return c;
    const { [key]: _gone, ...rest } = c.content;
    return { ...c, content: rest };
  }) })),
  addRemedial: (id, afterKey) => {
    let added = false;
    set((s) => ({ courses: s.courses.map((c) => {
      if (c.id !== id) return c;
      const at = c.squares.findIndex((q) => q.key === afterKey);
      const base = c.squares[at];
      const key = `${afterKey}r`;
      if (!base || base.remedial || c.squares.some((q) => q.key === key) || c.squares.filter((q) => q.remedial).length >= 12) return c;
      added = true;
      const lesson: PlannedSquare = { key, format: 'lesson', title: `Another look: ${base.title}`.slice(0, 60), focus: `Explain again, differently: ${base.focus}`, unit: base.unit, remedial: true, ...(base.topic ? { topic: base.topic } : {}) };
      // The same kind of square again, with new questions, so what was explained is tried straight away.
      const again: PlannedSquare[] = base.format === 'lesson' || base.format === 'cards' ? [] : [{ key: `${afterKey}p`, format: base.format, title: `Extra practice: ${base.title}`.slice(0, 60), focus: `New questions, different from the first time, on: ${base.focus}`, unit: base.unit, remedial: true, ...(base.topic ? { topic: base.topic } : {}) }];
      return { ...c, squares: [...c.squares.slice(0, at + 1), lesson, ...again, ...c.squares.slice(at + 1)] };
    }) }));
    return added;
  },
  addSquare: (id, afterKey, square) => {
    let added: string | null = null;
    set((s) => ({ courses: s.courses.map((c) => {
      if (c.id !== id || c.squares.length >= MAX_SQUARES) return c;
      const at = Math.max(0, c.squares.findIndex((q) => q.key === afterKey));
      const base = c.squares[at];
      if (!base) return c;
      let n = c.squares.reduce((m, q) => Math.max(m, Number(q.key.replace(/\D/g, '')) || 0), 0);
      let key = `s${++n}`;
      while (c.squares.some((q) => q.key === key)) key = `s${++n}`;
      added = key;
      const sq: PlannedSquare = { key, format: square.format, title: square.title.slice(0, 60), focus: square.focus, unit: base.unit, ...(base.topic ? { topic: base.topic } : {}) };
      return { ...c, squares: [...c.squares.slice(0, at + 1), sq, ...c.squares.slice(at + 1)] };
    }) }));
    return added;
  },
  setReadingDepth: (id, depth) => set((s) => ({ courses: s.courses.map((c) => (c.id !== id || (c.readingDepth ?? 'deep') === depth ? c : {
    ...c, readingDepth: depth, content: Object.fromEntries(Object.entries(c.content).filter(([key]) => !!c.progress[key] || c.squares.find((q) => q.key === key)?.format !== 'lesson')),
  })) })),
  setPrepareAhead: (id, count) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, prepareAhead: Math.max(0, Math.min(20, Math.round(count))) } : c)) })),
  setContent: (id, key, content) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, content: { ...c.content, [key]: content } } : c)) })),
  complete: (id, key, stars) => set((s) => ({
    courses: s.courses.map((c) => (c.id === id
      ? { ...c, lastPlayedAt: Date.now(), progress: { ...c.progress, [key]: { stars: Math.max(stars, c.progress[key]?.stars ?? 0) } } } : c)),
  })),
}), { name: 'atlas-topics', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ courses: s.courses }) }));

/** Progress of a course: squares done, of the total. */
export const courseProgress = (c: Course) => ({ done: c.squares.filter((s) => c.progress[s.key]).length, total: c.squares.length });
