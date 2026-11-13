import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EXAMS, type ExamCode } from './blueprints';
import type { OutlineArea } from './outline';

export interface CpaTopic { id: string; area: string; name: string; /** The person's own tick: "I have covered this". Understanding is shown separately, from quiz results. */ covered: boolean }
export interface CpaExam { projectId: string; topics: CpaTopic[]; /** The day of the exam, YYYY-MM-DD, set by the person. */ examDate?: string; /** The board-game course that teaches this exam, one square per topic. */ courseId?: string }

interface State {
  exams: Partial<Record<ExamCode, CpaExam>>;
  setExam: (code: ExamCode, exam: CpaExam) => void;
  setExamDate: (code: ExamCode, date: string | undefined) => void;
  setCourse: (code: ExamCode, courseId: string | undefined) => void;
  toggleCovered: (code: ExamCode, topicId: string) => void;
  addTopic: (code: ExamCode, area: string, name: string) => void;
  removeTopic: (code: ExamCode, topicId: string) => void;
  /** Replaces the outline, keeping the tick on topics that keep the same name. */
  replaceOutline: (code: ExamCode, areas: OutlineArea[]) => void;
}

const idFor = (area: string, name: string) => `${area}::${name}`.toLowerCase();
export const topicsFrom = (areas: OutlineArea[], keep: CpaTopic[] = []): CpaTopic[] =>
  areas.flatMap((a) => a.topics.map((name) => ({ id: idFor(a.area, name), area: a.area, name, covered: keep.some((k) => k.name.toLowerCase() === name.toLowerCase() && k.covered) })));

export const useCpa = create<State>()(persist((set) => {
  const change = (code: ExamCode, fn: (e: CpaExam) => CpaExam) => set((s) => (s.exams[code] ? { exams: { ...s.exams, [code]: fn(s.exams[code]!) } } : s));
  return {
    exams: {},
    setExam: (code, exam) => set((s) => ({ exams: { ...s.exams, [code]: exam } })),
    setExamDate: (code, examDate) => change(code, (e) => ({ ...e, examDate })),
    setCourse: (code, courseId) => change(code, (e) => ({ ...e, courseId })),
    toggleCovered: (code, topicId) => change(code, (e) => ({ ...e, topics: e.topics.map((t) => (t.id === topicId ? { ...t, covered: !t.covered } : t)) })),
    addTopic: (code, area, name) => change(code, (e) => (name.trim() && !e.topics.some((t) => t.id === idFor(area, name.trim())) ? { ...e, topics: [...e.topics, { id: idFor(area, name.trim()), area, name: name.trim(), covered: false }] } : e)),
    removeTopic: (code, topicId) => change(code, (e) => ({ ...e, topics: e.topics.filter((t) => t.id !== topicId) })),
    replaceOutline: (code, areas) => change(code, (e) => ({ ...e, topics: topicsFrom(areas, e.topics) })),
  };
}, { name: 'atlas-cpa-prep', storage: createJSONStorage(() => AsyncStorage), partialize: (s) => ({ exams: s.exams }) }));

export const defaultTopics = (code: ExamCode): CpaTopic[] => topicsFrom(EXAMS.find((e) => e.code === code)!.areas);
