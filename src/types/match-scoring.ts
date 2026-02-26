export type SupportedSportKey = 'cricket' | 'football' | 'other';

export interface CricketScoreData {
  sport: 'cricket';
  battingTeamId: string | null;
  bowlingTeamId: string | null;
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
  innings: number;
  extras: number;
  teamScores?: Record<string, number>;
}

export interface FootballScoreData {
  sport: 'football';
  teamAScore: number;
  teamBScore: number;
  currentMinute: number;
  half: 1 | 2;
}

export interface GenericScoreData {
  sport: 'other';
  teamAScore: number;
  teamBScore: number;
}

export type MatchScoreData = CricketScoreData | FootballScoreData | GenericScoreData;

export const isCricketScoreData = (value: unknown): value is CricketScoreData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CricketScoreData>;
  return (
    candidate.sport === 'cricket' &&
    typeof candidate.runs === 'number' &&
    typeof candidate.wickets === 'number' &&
    typeof candidate.overs === 'number' &&
    typeof candidate.balls === 'number'
  );
};

export const isFootballScoreData = (value: unknown): value is FootballScoreData => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<FootballScoreData>;
  return (
    candidate.sport === 'football' &&
    typeof candidate.teamAScore === 'number' &&
    typeof candidate.teamBScore === 'number' &&
    typeof candidate.currentMinute === 'number'
  );
};
