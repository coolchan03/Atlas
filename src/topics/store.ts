import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { localUniqueId } from '../utils/uniqueId';
import type { CoursePlan, CourseRequest, PlannedSquare, SquareContent } from './formats';
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
  /** The project this course belongs to: its shared documents are material for the squares, and its chats are where the tutor talks. */
  projectId?: string;
  /** Per square: the passages from the learner's own books and sources it was written from, so they can check it. */
  cited?: Record<string, { source: string; text: string }[]>;
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
  add: (request: CourseRequest, plan: CoursePlan, origin?: { sources?: CourseSource[]; projectId?: string }) => string;
  /** A course opened from a file someone sent: its squares and content, with no progress and no project. */
  addShared: (shared: SharedCourse, projectId?: string) => string;
  addSources: (id: string, sources: CourseSource[]) => void;
  removeSource: (id: string, sourceId: string) => void;
  /** Connects the course to a project (its documents are searched for each square), or disconnects it. */
  setProject: (id: string, projectId: string | undefined) => void;
  /** Adds one lesson square for each item (before the final quiz when the board ends with one). */
  addLessons: (id: string, items: { title: string; focus: string; unit: string }[]) => void;
  setCited: (id: string, key: string, passages: { source: string; text: string }[]) => void;
  clearContent: (id: string, key: string) => void;
  /** Puts a lesson that explains a square again, differently, right after it. Returns whether one was added. */
  addRemedial: (id: string, afterKey: string) => boolean;
  remove: (id: string) => void;
  setContent: (id: string, key: string, content: SquareContent) => void;
  complete: (id: string, key: string, stars: number) => void;
}

export const useTopics = create<TopicsState>()(persist((set) => ({
  courses: [],
  add: (request, plan, origin = {}) => {
    const { sources = [], projectId } = origin;
    const id = localUniqueId('course');
    const course: Course = {
      id, topic: request.topic, title: plan.title, summary: plan.summary, style: plan.style, theme: plan.theme, request,
      squares: plan.squares, content: {}, progress: {}, createdAt: Date.now(), sources, projectId,
    };
    set((s) => ({ courses: [course, ...s.courses].slice(0, 20) }));
    return id;
  },
  remove: (id) => set((s) => ({ courses: s.courses.filter((c) => c.id !== id) })),
  addShared: (shared, projectId) => {
    const id = localUniqueId('course');
    const course: Course = {
      id, topic: shared.topic, title: shared.title, summary: shared.summary, style: shared.style, theme: shared.theme, request: shared.request,
      squares: shared.squares, content: shared.content, progress: {}, createdAt: Date.now(), projectId,
      sources: shared.sources.filter((x) => x.text).map((x, i) => ({ id: `shared-${Date.now()}-${i}`, title: x.title, kind: x.kind, url: x.url, text: x.text, addedAt: Date.now() })),
    };
    set((s) => ({ courses: [course, ...s.courses].slice(0, 20) }));
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
      if (!base || base.remedial || c.squares.some((q) => q.key === key) || c.squares.filter((q) => q.remedial).length >= 6) return c;
      added = true;
      const extra: PlannedSquare = { key, format: 'lesson', title: `Another look: ${base.title}`.slice(0, 60), focus: `Explain again, differently: ${base.focus}`, unit: base.unit, remedial: true };
      return { ...c, squares: [...c.squares.slice(0, at + 1), extra, ...c.squares.slice(at + 1)] };
    }) }));
    return added;
  },
  setContent: (id, key, content) => set((s) => ({ courses: s.courses.map((c) => (c.id === id ? { ...c, content: { ...c.content, [key]: content } } : c)) })),
  complete: (id, key, stars) => set((s) => ({
    courses: s.courses.map((c) => (c.id === id
      ? { ...c, lastPlayedAt: Date.now(), progress: { ...c.progress, [key]: { stars: Math.max(stars, c.progress[key]?.stars ?? 0) } } } : c)),
  })),
}), { name: 'atlas-topics', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ courses: s.courses }) }));

/** Progress of a course: squares done, of the total. */
export const courseProgress = (c: Course) => ({ done: c.squares.filter((s) => c.progress[s.key]).length, total: c.squares.length });
