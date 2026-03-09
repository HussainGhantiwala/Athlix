import { Match } from '@/types/database';
import {
  CricketScoreData,
  FootballScoreData,
  GenericScoreData,
  MatchScoreData,
  SupportedSportKey,
  isCricketScoreData,
  isFootballScoreData,
} from '@/types/match-scoring';

const toSafeInt = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return fallback;
};

export const getSportKey = (match: Match): SupportedSportKey => {
  const raw = match.event_sport?.sport_category?.name?.toLowerCase() || '';
  if (raw.includes('cricket')) return 'cricket';
  if (raw.includes('football') || raw.includes('soccer')) return 'football';
  return 'other';
};

const getTeamScoresFromArray = (match: Match): { teamAScore: number; teamBScore: number } => {
  const teamAScore = match.scores?.find((score) => score.team_id === match.team_a_id)?.score_value ?? 0;
  const teamBScore = match.scores?.find((score) => score.team_id === match.team_b_id)?.score_value ?? 0;
  return { teamAScore, teamBScore };
};

const getTeamScoresFromMatchColumns = (match: Match): { teamAScore: number; teamBScore: number } | null => {
  const hasA = match.score_a !== undefined && match.score_a !== null;
  const hasB = match.score_b !== undefined && match.score_b !== null;
  if (!hasA && !hasB) return null;
  return {
    teamAScore: toSafeInt(match.score_a, 0),
    teamBScore: toSafeInt(match.score_b, 0),
  };
};

export const getInitialScoreData = (match: Match): MatchScoreData => {
  const sport = getSportKey(match);
  if (sport === 'cricket') {
    return {
      sport: 'cricket',
      battingTeamId: match.team_a_id ?? null,
      bowlingTeamId: match.team_b_id ?? null,
      runs: 0,
      wickets: 0,
      overs: 0,
      balls: 0,
      innings: 1,
      extras: 0,
      teamScores: {},
    };
  }

  if (sport === 'football') {
    return {
      sport: 'football',
      teamAScore: 0,
      teamBScore: 0,
      currentMinute: 0,
      half: 1,
    };
  }

  return {
    sport: 'other',
    teamAScore: 0,
    teamBScore: 0,
  };
};

export const normalizeScoreData = (match: Match): MatchScoreData => {
  const raw = match.score_data;
  if (isCricketScoreData(raw)) {
    return {
      ...raw,
      runs: toSafeInt(raw.runs),
      wickets: toSafeInt(raw.wickets),
      overs: toSafeInt(raw.overs),
      balls: toSafeInt(raw.balls),
      innings: toSafeInt(raw.innings, 1) || 1,
      extras: toSafeInt(raw.extras),
      teamScores: raw.teamScores ?? {},
    };
  }
  if (isFootballScoreData(raw)) {
    return {
      ...raw,
      teamAScore: toSafeInt(raw.teamAScore),
      teamBScore: toSafeInt(raw.teamBScore),
      currentMinute: toSafeInt(raw.currentMinute),
      half: raw.half === 2 ? 2 : 1,
    };
  }

  const sport = getSportKey(match);
  if (sport === 'other' && raw && typeof raw === 'object') {
    const generic = raw as Partial<GenericScoreData>;
    return {
      sport: 'other',
      teamAScore: toSafeInt(generic.teamAScore),
      teamBScore: toSafeInt(generic.teamBScore),
    };
  }

  return getInitialScoreData(match);
};

export const getTeamScores = (match: Match): { teamAScore: number; teamBScore: number } => {
  const fromColumns = getTeamScoresFromMatchColumns(match);
  if (fromColumns) return fromColumns;

  const sport = getSportKey(match);
  if (sport === 'cricket') {
    return {
      teamAScore: toSafeInt(match.runs_a, 0),
      teamBScore: toSafeInt(match.runs_b, 0),
    };
  }

  const normalized = normalizeScoreData(match);
  if (normalized.sport === 'football' || normalized.sport === 'other') {
    return { teamAScore: normalized.teamAScore, teamBScore: normalized.teamBScore };
  }

  const fallback = getTeamScoresFromArray(match);
  const scoreMap = { ...(normalized.teamScores || {}) };
  if (normalized.battingTeamId) {
    scoreMap[normalized.battingTeamId] = normalized.runs;
  }

  const teamAScore = match.team_a_id ? toSafeInt(scoreMap[match.team_a_id], fallback.teamAScore) : fallback.teamAScore;
  const teamBScore = match.team_b_id ? toSafeInt(scoreMap[match.team_b_id], fallback.teamBScore) : fallback.teamBScore;

  return { teamAScore, teamBScore };
};

export const formatCricketScoreLine = (scoreData: CricketScoreData): string => {
  return `${scoreData.runs}/${scoreData.wickets} (${scoreData.overs}.${scoreData.balls})`;
};

export const applyCricketRun = (scoreData: CricketScoreData, runs: number): CricketScoreData => {
  return {
    ...scoreData,
    runs: scoreData.runs + Math.max(0, runs),
  };
};

export const applyCricketWicket = (scoreData: CricketScoreData): CricketScoreData => {
  return {
    ...scoreData,
    wickets: scoreData.wickets + 1,
  };
};

export const applyCricketBall = (scoreData: CricketScoreData): CricketScoreData => {
  const nextBalls = scoreData.balls + 1;
  if (nextBalls >= 6) {
    return {
      ...scoreData,
      overs: scoreData.overs + 1,
      balls: 0,
    };
  }
  return {
    ...scoreData,
    balls: nextBalls,
  };
};

export const switchCricketInnings = (scoreData: CricketScoreData): CricketScoreData => {
  const nextTeamScores: Record<string, number> = { ...(scoreData.teamScores || {}) };
  if (scoreData.battingTeamId) {
    nextTeamScores[scoreData.battingTeamId] = scoreData.runs;
  }

  return {
    ...scoreData,
    battingTeamId: scoreData.bowlingTeamId,
    bowlingTeamId: scoreData.battingTeamId,
    runs: 0,
    wickets: 0,
    overs: 0,
    balls: 0,
    extras: 0,
    innings: scoreData.innings + 1,
    teamScores: nextTeamScores,
  };
};

export const incrementFootballScore = (
  scoreData: FootballScoreData,
  team: 'A' | 'B'
): FootballScoreData => {
  if (team === 'A') {
    return { ...scoreData, teamAScore: scoreData.teamAScore + 1 };
  }
  return { ...scoreData, teamBScore: scoreData.teamBScore + 1 };
};

export const setFootballMinute = (scoreData: FootballScoreData, minute: number): FootballScoreData => {
  return {
    ...scoreData,
    currentMinute: Math.max(0, minute),
  };
};

export const switchFootballHalf = (scoreData: FootballScoreData): FootballScoreData => {
  return {
    ...scoreData,
    half: scoreData.half === 1 ? 2 : 1,
  };
};

export const determineWinnerId = (match: Match): string | null => {
  if (!match.team_a_id || !match.team_b_id) return null;
  const { teamAScore, teamBScore } = getTeamScores(match);
  if (teamAScore === teamBScore) return null;
  return teamAScore > teamBScore ? match.team_a_id : match.team_b_id;
};

export const getScoreRowsForUpsert = (
  match: Match,
  scoreData: MatchScoreData,
  updatedBy?: string | null
): Array<{ match_id: string; team_id: string; score_value: number; updated_by?: string | null }> => {
  if (!match.team_a_id || !match.team_b_id) return [];

  let teamAScore = 0;
  let teamBScore = 0;

  if (scoreData.sport === 'football' || scoreData.sport === 'other') {
    teamAScore = scoreData.teamAScore;
    teamBScore = scoreData.teamBScore;
  } else {
    const scoreMap: Record<string, number> = { ...(scoreData.teamScores || {}) };
    if (scoreData.battingTeamId) scoreMap[scoreData.battingTeamId] = scoreData.runs;
    teamAScore = toSafeInt(scoreMap[match.team_a_id], 0);
    teamBScore = toSafeInt(scoreMap[match.team_b_id], 0);
  }

  return [
    { match_id: match.id, team_id: match.team_a_id, score_value: teamAScore, updated_by: updatedBy },
    { match_id: match.id, team_id: match.team_b_id, score_value: teamBScore, updated_by: updatedBy },
  ];
};
