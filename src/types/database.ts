export type AppRole = 'super_admin' | 'admin' | 'faculty' | 'student_coordinator' | 'student';
export type EventStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'completed' | 'cancelled';
export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled' | 'completed_provisional' | 'finalized' | 'paused';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export type TeamStatus = 'forming' | 'pending_approval' | 'approved' | 'locked';
export type BudgetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type InviteStatus = 'pending' | 'accepted' | 'rejected';
export type TournamentType = 'knockout' | 'group' | 'league';
export type ResultStatus = 'pending' | 'completed' | 'advanced' | 'eliminated' | 'draw' | 'final';

export const MatchStatusEnum = {
  Scheduled: 'scheduled' as MatchStatus,
  Live: 'live' as MatchStatus,
  Completed: 'completed' as MatchStatus,
  Cancelled: 'cancelled' as MatchStatus,
  Provisional: 'completed_provisional' as MatchStatus,
  Finalized: 'finalized' as MatchStatus,
  Paused: 'paused' as MatchStatus,
} as const;

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  university_id?: string | null;
  avatar_url?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  university?: University | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  university_id?: string | null;
  role: AppRole;
  created_at: string;
}

export interface University {
  id: string;
  name: string;
  domain?: string | null;
  short_name: string;
  logo_url?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Invite {
  id: string;
  email: string;
  role: AppRole;
  university_id: string;
  status: InviteStatus;
  created_at: string;
  university?: University | null;
}

export interface Event {
  id: string;
  university_id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  venue?: string;
  status: EventStatus;
  tournament_type?: TournamentType;
  banner_url?: string;
  registration_deadline?: string;
  created_by?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  updated_at: string;
  university?: University;
}

export interface SportsCategory {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  is_team_sport: boolean;
  min_team_size: number;
  max_team_size: number;
  created_at: string;
}

export interface EventSport {
  id: string;
  event_id: string;
  sport_category_id: string;
  match_format?: string;
  rules?: string;
  max_teams: number;
  registration_open: boolean;
  created_at: string;
  sport_category?: SportsCategory;
  event?: Event;
}

export interface TeamPlayer {
  id: string;
  event_id: string;
  event_sport_id: string;
  team_id: string;
  name: string;
  jersey_number?: number;
  is_dummy: boolean;
  created_by?: string;
  created_at: string;
}

export interface CoordinatorAssignment {
  id: string;
  event_id: string;
  user_id: string;
  role: AppRole;
  assigned_by?: string;
  created_at: string;
  profile?: Profile;
  event?: Event;
}

export interface Registration {
  id: string;
  event_sport_id: string;
  user_id: string;
  university_id?: string;
  status: RegistrationStatus;
  registration_data?: Record<string, any>;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  profile?: Profile;
  event_sport?: EventSport;
}

export interface Team {
  id: string;
  event_sport_id: string;
  event_id?: string;
  sport_id?: string;
  name: string;
  university_id?: string;
  captain_id?: string;
  status: TeamStatus;
  approved_by?: string;
  approved_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  source?: 'registered' | 'demo' | 'manual' | 'imported';
  registration_submission_id?: string;
  university?: University;
  members?: TeamMember[];
  players?: TeamPlayer[];
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  jersey_number?: number;
  position?: string;
  is_captain: boolean;
  created_at: string;
  profile?: Profile;
}

export interface Venue {
  id: string;
  university_id?: string;
  name: string;
  capacity?: number;
  location?: string;
  facilities?: string[];
  is_active: boolean;
  created_at: string;
}

export interface Match {
  id: string;
  university_id?: string | null;
  event_id?: string | null;
  sport_id?: string | null;
  event_sport_id: string;
  venue_id?: string;
  team_a_id?: string;
  team_b_id?: string;
  scheduled_at: string;
  round?: string;
  match_number?: number;
  is_bye_match?: boolean;
  is_placeholder?: boolean;
  status: MatchStatus;
  current_editor_id?: string;
  editor_locked_at?: string;
  started_at?: string;
  completed_at?: string;
  finalized_by?: string;
  finalized_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  // Tournament fields
  next_match_id?: string;
  group_name?: string;
  phase?: string;
  match_phase?: string;
  result_status?: ResultStatus;
  winner_id?: string;
  winner_team_id?: string;
  score_a?: number;
  score_b?: number;
  // Toss fields
  toss_winner_id?: string;
  toss_decision?: string;
  batting_team_id?: string;
  bowling_team_id?: string;
  // Cricket live scoring fields
  runs_a?: number;
  wickets_a?: number;
  balls_a?: number;
  runs_b?: number;
  wickets_b?: number;
  balls_b?: number;
  innings?: number;
  target_score?: number;
  team_a?: Team;
  team_b?: Team;
  venue?: Venue;
  event_sport?: EventSport;
  scores?: Score[];
  // Participant fields (individual/non-team matches)
  participant_a_id?: string;
  participant_b_id?: string;
  participant_a_name?: string;
  participant_b_name?: string;
  participant_a?: { id?: string; name?: string } | null;
  participant_b?: { id?: string; name?: string } | null;
  // Score & result fields
  score_data?: Record<string, any> | null;
  winner_name?: string | null;
  winner_participant_id?: string;
  round_number?: number;
}

export interface Score {
  id: string;
  match_id: string;
  team_id: string;
  score_value: number;
  score_details?: Record<string, any>;
  is_winner?: boolean;
  updated_by?: string;
  created_at: string;
  updated_at: string;
  team?: Team;
}

export interface Budget {
  id: string;
  event_id: string;
  title: string;
  description?: string;
  estimated_amount: number;
  actual_amount?: number;
  status: BudgetStatus;
  line_items?: Record<string, any>[];
  submitted_by?: string;
  submitted_at?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
  event?: Event;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data?: Record<string, any>;
  new_data?: Record<string, any>;
  reason?: string;
  performed_by?: string;
  ip_address?: string;
  created_at: string;
}

export interface ScoreHistory {
  id: string;
  score_id: string;
  match_id: string;
  old_value?: number;
  new_value: number;
  change_reason?: string;
  changed_by?: string;
  created_at: string;
}

export interface TeamStanding {
  id: string;
  event_id: string;
  event_sport_id: string;
  group_name?: string;
  team_id: string;
  team_name: string;
  played: number;
  won: number;
  lost: number;
  draw: number;
  points: number;
  goal_difference: number;
  created_at: string;
  updated_at: string;
}
