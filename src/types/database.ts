export type AppRole = 'admin' | 'faculty' | 'student_coordinator' | 'student';
export type EventStatus = 'draft' | 'pending_approval' | 'approved' | 'active' | 'completed' | 'cancelled';
export enum MatchStatusEnum {
  Scheduled = 'scheduled',
  Live = 'live',
  Paused = 'paused',
  Completed = 'completed',
  CompletedProvisional = 'completed_provisional',
  Finalized = 'finalized',
  Cancelled = 'cancelled',
}

export type MatchStatus = 'scheduled' | 'live' | 'paused' | 'completed' | 'completed_provisional' | 'finalized' | 'cancelled';
export type MatchPhase = 'group' | 'knockout';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export type TeamStatus = 'forming' | 'pending_approval' | 'approved' | 'locked';
export type BudgetStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface University {
  id: string;
  name: string;
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

export interface Event {
  id: string;
  university_id: string;
  name: string;
  description?: string;
  start_date: string;
  end_date: string;
  venue?: string;
  status: EventStatus;
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
  event_id?: string | null;
  sport_id?: string | null;
  name: string;
  university_id?: string;
  captain_id?: string;
  status: TeamStatus;
  approved_by?: string;
  approved_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  university?: University;
  members?: TeamMember[];
}

export interface Participant {
  id: string;
  event_id: string;
  sport_id: string;
  name: string;
  type: 'team' | 'individual';
  created_at: string;
}

export interface RegistrationSubmission {
  id: string;
  form_id: string;
  event_id: string;
  sport_id: string;
  user_id: string;
  submitted_by: string;
  team_id?: string | null;
  team_name?: string | null;
  team_members?: { name: string }[] | null;
  submission_data?: Record<string, any>;
  status: RegistrationStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  event?: Event;
  sport?: SportsCategory;
  team?: Team | null;
  profile?: Profile | null;
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
  event_sport_id: string;
  event_id?: string | null;
  sport_id?: string | null;
  participant_a_name?: string | null;
  participant_b_name?: string | null;
  venue_id?: string;
  team_a_id?: string;
  team_b_id?: string;
  participant_a_id?: string | null;
  participant_b_id?: string | null;
  winner_participant_id?: string | null;
  next_match_id?: string | null;
  winner_name?: string | null;
  scheduled_at: string;
  phase?: MatchPhase;
  group_name?: string | null;
  round?: string | number | null;
  round_number?: number | null;
  bracket_position?: number;
  match_number?: number;
  status: MatchStatus;
  score_data?: Record<string, any> | null;
  winner_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  current_editor_id?: string;
  editor_locked_at?: string;
  // Legacy columns retained for backwards compatibility with existing screens.
  started_at?: string;
  completed_at?: string;
  finalized_by?: string;
  finalized_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  team_a?: Team;
  team_b?: Team;
  participant_a?: Participant | null;
  participant_b?: Participant | null;
  venue?: Venue;
  event_sport?: EventSport;
  scores?: Score[];
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

export interface GroupStanding {
  id: string;
  event_id: string;
  group_name: string;
  team_id: string;
  played: number;
  won: number;
  lost: number;
  draw: number;
  points: number;
  goal_difference: number;
  net_run_rate: number;
  created_at: string;
  updated_at: string;
  team?: Team;
}
