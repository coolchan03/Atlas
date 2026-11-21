/** Renders a saved project learning game (StudyResult kind === 'game'). */
import React from 'react';
import { Text } from 'react-native';
import type { GameProps } from './kit';
import { ClozeGame, HangmanGame, PairsGame } from './WordGames';
import { SortGame, TimelineGame, TrueFalseGame } from './OrderGames';
import { BossGame, DailyGame, ExamGame, JeopardyGame, PodcastQuizGame, ReviewGame } from './BoardGames';
import { ConceptMapGame, FeynmanGame, LevelsGame, MnemonicGame, PalaceGame, TutorGame } from './TutorGames';
import { LadderGame, MistakeGame, ScrambleGame } from './QuickGames';
import { useGameColors } from './kit';

const GAMES: Record<string, React.ComponentType<GameProps>> = {
  review: ReviewGame, daily: DailyGame, pairs: PairsGame, hangman: HangmanGame, cloze: ClozeGame,
  truefalse: TrueFalseGame, timeline: TimelineGame, sort: SortGame, jeopardy: JeopardyGame, boss: BossGame,
  exam: ExamGame, conceptmap: ConceptMapGame, palace: PalaceGame, feynman: FeynmanGame, tutor: TutorGame,
  levels: LevelsGame, mnemonic: MnemonicGame, podcastquiz: PodcastQuizGame,
  scramble: ScrambleGame, ladder: LadderGame, mistake: MistakeGame,
};

export function ProjectGame(props: GameProps) {
  const colors = useGameColors();
  const Game = GAMES[props.result.game?.type ?? ''];
  if (!Game) return <Text style={{ color: colors.textSecondary }}>This game is not available in this version.</Text>;
  return <Game {...props} />;
}
