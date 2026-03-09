export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          performed_by: string | null
          reason: string | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
          reason?: string | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
          reason?: string | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          actual_amount: number | null
          created_at: string
          description: string | null
          estimated_amount: number
          event_id: string
          id: string
          line_items: Json | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["budget_status"]
          submitted_at: string | null
          submitted_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          created_at?: string
          description?: string | null
          estimated_amount: number
          event_id: string
          id?: string
          line_items?: Json | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["budget_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          created_at?: string
          description?: string | null
          estimated_amount?: number
          event_id?: string
          id?: string
          line_items?: Json | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["budget_status"]
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      coordinator_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          event_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          event_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          event_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coordinator_assignments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sports: {
        Row: {
          created_at: string
          eligibility_rules: string | null
          event_id: string
          form_created_by: string | null
          id: string
          match_format: string | null
          max_participants: number | null
          max_teams: number | null
          registration_deadline: string | null
          registration_form_status:
            | Database["public"]["Enums"]["registration_form_status"]
            | null
          registration_open: boolean
          rules: string | null
          sport_category_id: string
        }
        Insert: {
          created_at?: string
          eligibility_rules?: string | null
          event_id: string
          form_created_by?: string | null
          id?: string
          match_format?: string | null
          max_participants?: number | null
          max_teams?: number | null
          registration_deadline?: string | null
          registration_form_status?:
            | Database["public"]["Enums"]["registration_form_status"]
            | null
          registration_open?: boolean
          rules?: string | null
          sport_category_id: string
        }
        Update: {
          created_at?: string
          eligibility_rules?: string | null
          event_id?: string
          form_created_by?: string | null
          id?: string
          match_format?: string | null
          max_participants?: number | null
          max_teams?: number | null
          registration_deadline?: string | null
          registration_form_status?:
            | Database["public"]["Enums"]["registration_form_status"]
            | null
          registration_open?: boolean
          rules?: string | null
          sport_category_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sports_sport_category_id_fkey"
            columns: ["sport_category_id"]
            isOneToOne: false
            referencedRelation: "sports_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          banner_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          name: string
          registration_deadline: string | null
          start_date: string
          status: Database["public"]["Enums"]["event_status"]
          tournament_type: string | null
          university_id: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          name: string
          registration_deadline?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["event_status"]
          tournament_type?: string | null
          university_id: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          banner_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          name?: string
          registration_deadline?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["event_status"]
          tournament_type?: string | null
          university_id?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      match_reopen_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          match_id: string
          reason: string
          requested_by: string | null
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          match_id: string
          reason: string
          requested_by?: string | null
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          match_id?: string
          reason?: string
          requested_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_reopen_requests_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          balls_a: number
          balls_b: number
          batting_team_id: string | null
          bowling_team_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_editor_id: string | null
          editor_locked_at: string | null
          event_sport_id: string
          finalized_at: string | null
          finalized_by: string | null
          group_name: string | null
          id: string
          innings: number
          match_number: number | null
          match_phase: string | null
          next_match_id: string | null
          next_slot: string | null
          penalty_a: number | null
          penalty_b: number | null
          phase: string | null
          result_status: string | null
          round: string | null
          round_number: number | null
          runs_a: number
          runs_b: number
          scheduled_at: string
          started_at: string | null
          status: Database["public"]["Enums"]["match_status"]
          target_score: number | null
          team_a_id: string | null
          team_b_id: string | null
          toss_decision: string | null
          toss_winner_id: string | null
          updated_at: string
          venue_id: string | null
          wickets_a: number
          wickets_b: number
          winner_team_id: string | null
        }
        Insert: {
          balls_a?: number
          balls_b?: number
          batting_team_id?: string | null
          bowling_team_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_editor_id?: string | null
          editor_locked_at?: string | null
          event_sport_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          group_name?: string | null
          id?: string
          innings?: number
          match_number?: number | null
          match_phase?: string | null
          next_match_id?: string | null
          next_slot?: string | null
          penalty_a?: number | null
          penalty_b?: number | null
          phase?: string | null
          result_status?: string | null
          round?: string | null
          round_number?: number | null
          runs_a?: number
          runs_b?: number
          scheduled_at: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          target_score?: number | null
          team_a_id?: string | null
          team_b_id?: string | null
          toss_decision?: string | null
          toss_winner_id?: string | null
          updated_at?: string
          venue_id?: string | null
          wickets_a?: number
          wickets_b?: number
          winner_team_id?: string | null
        }
        Update: {
          balls_a?: number
          balls_b?: number
          batting_team_id?: string | null
          bowling_team_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_editor_id?: string | null
          editor_locked_at?: string | null
          event_sport_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          group_name?: string | null
          id?: string
          innings?: number
          match_number?: number | null
          match_phase?: string | null
          next_match_id?: string | null
          next_slot?: string | null
          penalty_a?: number | null
          penalty_b?: number | null
          phase?: string | null
          result_status?: string | null
          round?: string | null
          round_number?: number | null
          runs_a?: number
          runs_b?: number
          scheduled_at?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          target_score?: number | null
          team_a_id?: string | null
          team_b_id?: string | null
          toss_decision?: string | null
          toss_winner_id?: string | null
          updated_at?: string
          venue_id?: string | null
          wickets_a?: number
          wickets_b?: number
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_batting_team_id_fkey"
            columns: ["batting_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_bowling_team_id_fkey"
            columns: ["bowling_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_event_sport_id_fkey"
            columns: ["event_sport_id"]
            isOneToOne: false
            referencedRelation: "event_sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_next_match_id_fkey"
            columns: ["next_match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_a_id_fkey"
            columns: ["team_a_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_team_b_id_fkey"
            columns: ["team_b_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_toss_winner_id_fkey"
            columns: ["toss_winner_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      registration_forms: {
        Row: {
          created_at: string
          created_by: string | null
          deadline: string | null
          eligibility_rules: string | null
          event_id: string
          form_schema: Json
          id: string
          max_slots: number | null
          sport_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          eligibility_rules?: string | null
          event_id: string
          form_schema?: Json
          id?: string
          max_slots?: number | null
          sport_id: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          eligibility_rules?: string | null
          event_id?: string
          form_schema?: Json
          id?: string
          max_slots?: number | null
          sport_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_forms_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_forms_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_submissions: {
        Row: {
          created_at: string
          form_id: string
          id: string
          submission_data: Json
          submitted_by: string
          team_members: Json | null
          team_name: string | null
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          submission_data?: Json
          submitted_by: string
          team_members?: Json | null
          team_name?: string | null
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          submission_data?: Json
          submitted_by?: string
          team_members?: Json | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registration_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "registration_forms"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          created_at: string
          event_sport_id: string
          id: string
          registration_data: Json | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["registration_status"]
          university_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_sport_id: string
          id?: string
          registration_data?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          university_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_sport_id?: string
          id?: string
          registration_data?: Json | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          university_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_sport_id_fkey"
            columns: ["event_sport_id"]
            isOneToOne: false
            referencedRelation: "event_sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_books: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          id: string
          pdf_url: string | null
          published_at: string | null
          sport_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          published_at?: string | null
          sport_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pdf_url?: string | null
          published_at?: string | null
          sport_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_books_sport_id_fkey"
            columns: ["sport_id"]
            isOneToOne: false
            referencedRelation: "sports_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      score_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          created_at: string
          id: string
          match_id: string
          new_value: number
          old_value: number | null
          score_id: string
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          match_id: string
          new_value: number
          old_value?: number | null
          score_id: string
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          id?: string
          match_id?: string
          new_value?: number
          old_value?: number | null
          score_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_history_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "scores"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          created_at: string
          id: string
          is_winner: boolean | null
          match_id: string
          score_details: Json | null
          score_value: number
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_winner?: boolean | null
          match_id: string
          score_details?: Json | null
          score_value?: number
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_winner?: boolean | null
          match_id?: string
          score_details?: Json | null
          score_value?: number
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      sports_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_team_sport: boolean
          max_team_size: number | null
          min_team_size: number | null
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_team_sport?: boolean
          max_team_size?: number | null
          min_team_size?: number | null
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_team_sport?: boolean
          max_team_size?: number | null
          min_team_size?: number | null
          name?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          id: string
          is_captain: boolean
          jersey_number: number | null
          position: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_captain?: boolean
          jersey_number?: number | null
          position?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_captain?: boolean
          jersey_number?: number | null
          position?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_standings: {
        Row: {
          created_at: string
          draw: number
          event_id: string
          event_sport_id: string
          goal_difference: number
          group_name: string | null
          id: string
          lost: number
          played: number
          points: number
          team_id: string
          team_name: string
          updated_at: string
          won: number
        }
        Insert: {
          created_at?: string
          draw?: number
          event_id: string
          event_sport_id: string
          goal_difference?: number
          group_name?: string | null
          id?: string
          lost?: number
          played?: number
          points?: number
          team_id: string
          team_name: string
          updated_at?: string
          won?: number
        }
        Update: {
          created_at?: string
          draw?: number
          event_id?: string
          event_sport_id?: string
          goal_difference?: number
          group_name?: string | null
          id?: string
          lost?: number
          played?: number
          points?: number
          team_id?: string
          team_name?: string
          updated_at?: string
          won?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_standings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_standings_event_sport_id_fkey"
            columns: ["event_sport_id"]
            isOneToOne: false
            referencedRelation: "event_sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          captain_id: string | null
          created_at: string
          created_by: string | null
          event_sport_id: string
          id: string
          name: string
          status: Database["public"]["Enums"]["team_status"]
          university_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          captain_id?: string | null
          created_at?: string
          created_by?: string | null
          event_sport_id: string
          id?: string
          name: string
          status?: Database["public"]["Enums"]["team_status"]
          university_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          captain_id?: string | null
          created_at?: string
          created_by?: string | null
          event_sport_id?: string
          id?: string
          name?: string
          status?: Database["public"]["Enums"]["team_status"]
          university_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_event_sport_id_fkey"
            columns: ["event_sport_id"]
            isOneToOne: false
            referencedRelation: "event_sports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
      universities: {
        Row: {
          address: string | null
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          short_name: string
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          short_name: string
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          short_name?: string
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venues: {
        Row: {
          capacity: number | null
          created_at: string
          facilities: string[] | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          university_id: string | null
        }
        Insert: {
          capacity?: number | null
          created_at?: string
          facilities?: string[] | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          university_id?: string | null
        }
        Update: {
          capacity?: number | null
          created_at?: string
          facilities?: string[] | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          university_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venues_university_id_fkey"
            columns: ["university_id"]
            isOneToOne: false
            referencedRelation: "universities"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_cricket_score_action: {
        Args: { _action: string; _match_id: string }
        Returns: {
          out_balls_a: number
          out_balls_b: number
          out_innings: number
          out_match_phase: string
          out_runs_a: number
          out_runs_b: number
          out_target_score: number
          out_wickets_a: number
          out_wickets_b: number
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_event_coordinator: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      is_form_creator: {
        Args: { _form_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "faculty" | "student_coordinator" | "student"
      budget_status: "draft" | "submitted" | "approved" | "rejected"
      event_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "active"
        | "completed"
        | "cancelled"
      match_status:
        | "scheduled"
        | "live"
        | "completed_provisional"
        | "finalized"
        | "cancelled"
      registration_form_status:
        | "draft"
        | "pending_faculty_review"
        | "pending_admin_approval"
        | "published"
        | "closed"
        | "rejected"
      registration_status: "pending" | "approved" | "rejected"
      team_status: "forming" | "pending_approval" | "approved" | "locked"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "faculty", "student_coordinator", "student"],
      budget_status: ["draft", "submitted", "approved", "rejected"],
      event_status: [
        "draft",
        "pending_approval",
        "approved",
        "active",
        "completed",
        "cancelled",
      ],
      match_status: [
        "scheduled",
        "live",
        "completed_provisional",
        "finalized",
        "cancelled",
      ],
      registration_form_status: [
        "draft",
        "pending_faculty_review",
        "pending_admin_approval",
        "published",
        "closed",
        "rejected",
      ],
      registration_status: ["pending", "approved", "rejected"],
      team_status: ["forming", "pending_approval", "approved", "locked"],
    },
  },
} as const
