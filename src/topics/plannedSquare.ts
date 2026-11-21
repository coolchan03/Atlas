/** The shape of one square on a course board, and the kinds of square. Its own file so chapterSequence.ts can use them without importing formats.ts (which imports chapterSequence.ts: an import cycle). */

export type SquareFormat = 'lesson' | 'quiz' | 'cards' | 'match' | 'order' | 'practice' | 'fill' | 'truefalse' | 'scenario' | 'numeric' | 'worked' | 'table'
  | 'recall' | 'fix' | 'tablefill' | 'sort' | 'dictation' | 'reading' | 'predict' | 'drill' | 'periodic'
  | 'crossword' | 'wordsearch' | 'scramble' | 'memory' | 'hangman';

export interface PlannedSquare { key: string; format: SquareFormat; title: string; focus: string; unit: string; checkpoint?: boolean; remedial?: boolean; /** The textbook this square comes from, when the course goes through several books one after another. */ book?: string; /** The subject alone ("Leases"), without the words every square of a chapter shares ("chapter exam", "quiz"): what passages and textbook questions are matched on. */ topic?: string }
