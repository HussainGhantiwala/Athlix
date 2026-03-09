/**
 * Centralized sport rules configuration.
 * Single source of truth for sport-specific match behavior.
 * To add a new sport, simply add an entry here — no match logic changes needed.
 */

export type TieBreaker = 'penalties' | 'super_over' | 'overtime' | 'none';

export type MatchPhaseFlow = string[];

export interface SportRules {
  /** Display name */
  name: string;
  /** Whether draws are allowed (if false, tieBreaker is used) */
  allowDraw: boolean;
  /** What happens on a tie when draws aren't allowed */
  tieBreaker: TieBreaker;
  /** Ordered list of phases for this sport */
  phases: MatchPhaseFlow;
  /** Initial phase when match starts */
  initialPhase: string;
  /** Whether a pre-match toss is required */
  requiresToss: boolean;
  /** Number of innings (cricket-style sports) */
  innings?: number;
  /** Whether scoring uses the cricket RPC engine */
  usesCricketEngine?: boolean;
  /** Number of periods/halves */
  periods?: number;
  /** Fields to reset when starting a match */
  resetFields?: Record<string, any>;
}

export type SportKey = 'cricket' | 'football' | 'futsal' | 'basketball' | 'badminton' | 'table_tennis' | 'tennis' | 'volleyball' | 'kabaddi' | 'hockey' | 'generic';

export const sportRules: Record<SportKey, SportRules> = {
  cricket: {
    name: 'Cricket',
    allowDraw: false,
    tieBreaker: 'super_over',
    phases: ['not_started', 'first_innings', 'innings_break', 'second_innings', 'super_over', 'completed'],
    initialPhase: 'first_innings',
    requiresToss: true,
    innings: 2,
    usesCricketEngine: true,
    resetFields: {
      runs_a: 0, wickets_a: 0, balls_a: 0,
      runs_b: 0, wickets_b: 0, balls_b: 0,
      innings: 1, target_score: null,
    },
  },

  football: {
    name: 'Football',
    allowDraw: false,
    tieBreaker: 'penalties',
    phases: ['not_started', 'first_half', 'halftime', 'second_half', 'penalties', 'completed'],
    initialPhase: 'first_half',
    requiresToss: false,
    periods: 2,
  },

  futsal: {
    name: 'Futsal',
    allowDraw: false,
    tieBreaker: 'penalties',
    phases: ['not_started', 'first_half', 'halftime', 'second_half', 'penalties', 'completed'],
    initialPhase: 'first_half',
    requiresToss: false,
    periods: 2,
  },

  basketball: {
    name: 'Basketball',
    allowDraw: false,
    tieBreaker: 'overtime',
    phases: ['not_started', 'first_half', 'halftime', 'second_half', 'overtime', 'completed'],
    initialPhase: 'first_half',
    requiresToss: false,
    periods: 4,
  },

  badminton: {
    name: 'Badminton',
    allowDraw: false,
    tieBreaker: 'none',
    phases: ['not_started', 'in_progress', 'completed'],
    initialPhase: 'in_progress',
    requiresToss: false,
  },

  table_tennis: {
    name: 'Table Tennis',
    allowDraw: false,
    tieBreaker: 'none',
    phases: ['not_started', 'in_progress', 'completed'],
    initialPhase: 'in_progress',
    requiresToss: false,
  },

  tennis: {
    name: 'Tennis',
    allowDraw: false,
    tieBreaker: 'none',
    phases: ['not_started', 'in_progress', 'completed'],
    initialPhase: 'in_progress',
    requiresToss: false,
  },

  volleyball: {
    name: 'Volleyball',
    allowDraw: false,
    tieBreaker: 'none',
    phases: ['not_started', 'in_progress', 'completed'],
    initialPhase: 'in_progress',
    requiresToss: false,
  },

  kabaddi: {
    name: 'Kabaddi',
    allowDraw: false,
    tieBreaker: 'none',
    phases: ['not_started', 'first_half', 'halftime', 'second_half', 'completed'],
    initialPhase: 'first_half',
    requiresToss: false,
    periods: 2,
  },

  hockey: {
    name: 'Hockey',
    allowDraw: false,
    tieBreaker: 'penalties',
    phases: ['not_started', 'first_half', 'halftime', 'second_half', 'penalties', 'completed'],
    initialPhase: 'first_half',
    requiresToss: false,
    periods: 2,
  },

  generic: {
    name: 'Generic',
    allowDraw: true,
    tieBreaker: 'none',
    phases: ['not_started', 'in_progress', 'completed'],
    initialPhase: 'in_progress',
    requiresToss: false,
  },
};

/**
 * Detect sport key from a sport category name string.
 */
export function detectSportKey(sportName?: string): SportKey {
  if (!sportName) return 'generic';
  const lower = sportName.toLowerCase();
  if (lower.includes('cricket')) return 'cricket';
  if (lower.includes('futsal')) return 'futsal';
  if (lower.includes('football') || lower.includes('soccer')) return 'football';
  if (lower.includes('basketball')) return 'basketball';
  if (lower.includes('table tennis')) return 'table_tennis';
  if (lower.includes('badminton')) return 'badminton';
  if (lower.includes('tennis')) return 'tennis';
  if (lower.includes('volleyball')) return 'volleyball';
  if (lower.includes('kabaddi')) return 'kabaddi';
  if (lower.includes('hockey')) return 'hockey';
  return 'generic';
}

/**
 * Get rules for a sport name string.
 */
export function getRulesForSport(sportName?: string): SportRules {
  return sportRules[detectSportKey(sportName)];
}

/**
 * Resolve what should happen when a match ends with the given scores.
 * Returns the next match_phase to transition to.
 */
export function resolveMatchOutcome(
  sportName: string | undefined,
  scoreA: number,
  scoreB: number,
): 'completed' | TieBreaker {
  const rules = getRulesForSport(sportName);
  const isTied = scoreA === scoreB;

  if (!isTied) return 'completed';

  // Tied — check if sport allows draws
  if (rules.allowDraw) return 'completed';

  // Sport doesn't allow draws — trigger tie breaker
  if (rules.tieBreaker !== 'none') return rules.tieBreaker;

  // Fallback for sports with no tie-breaker mechanism (e.g. badminton — score-based win)
  return 'completed';
}

/**
 * Get the initial phase for starting a match of this sport.
 */
export function getInitialPhase(sportName?: string): string {
  return getRulesForSport(sportName).initialPhase;
}

/**
 * Get any fields that should be reset when starting a match.
 */
export function getResetFields(sportName?: string): Record<string, any> {
  return getRulesForSport(sportName).resetFields || {};
}

/**
 * Check if a sport requires a pre-match toss.
 */
export function requiresToss(sportName?: string): boolean {
  return getRulesForSport(sportName).requiresToss;
}

/**
 * Check if a sport uses the cricket scoring RPC engine.
 */
export function usesCricketEngine(sportName?: string): boolean {
  return getRulesForSport(sportName).usesCricketEngine === true;
}
