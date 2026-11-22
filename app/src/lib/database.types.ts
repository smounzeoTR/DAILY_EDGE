export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: { extensions?: Json; operationName?: string; query?: string; variables?: Json };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      assistant_actions: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          params: NonNullable<Json>;
          resolved_at: string | null;
          result: Json | null;
          status: string;
          thread_id: string;
          type: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          params?: NonNullable<Json>;
          resolved_at?: string | null;
          result?: Json | null;
          status?: string;
          thread_id: string;
          type: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          params?: NonNullable<Json>;
          resolved_at?: string | null;
          result?: Json | null;
          status?: string;
          thread_id?: string;
          type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assistant_actions_thread_id_user_id_fkey';
            columns: ['thread_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'assistant_threads';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      assistant_messages: {
        Row: {
          action_id: string | null;
          content: string;
          created_at: string;
          distress: boolean;
          id: string;
          role: string;
          thread_id: string;
          tool_calls: Json | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          action_id?: string | null;
          content?: string;
          created_at?: string;
          distress?: boolean;
          id?: string;
          role: string;
          thread_id: string;
          tool_calls?: Json | null;
          user_id: string;
        };
        Update: {
          action_id?: string | null;
          content?: string;
          created_at?: string;
          distress?: boolean;
          id?: string;
          role?: string;
          thread_id?: string;
          tool_calls?: Json | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'assistant_messages_thread_id_user_id_fkey';
            columns: ['thread_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'assistant_threads';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      assistant_threads: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string;
          summarized_until: string | null;
          summary: string | null;
          title: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
          summarized_until?: string | null;
          summary?: string | null;
          title?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
          summarized_until?: string | null;
          summary?: string | null;
          title?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      checkins: {
        Row: {
          created_at: string;
          date: string;
          energy: number | null;
          minutes_tomorrow: number | null;
          mood: number | null;
          note: string | null;
          reflection: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          date: string;
          energy?: number | null;
          minutes_tomorrow?: number | null;
          mood?: number | null;
          note?: string | null;
          reflection?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          energy?: number | null;
          minutes_tomorrow?: number | null;
          mood?: number | null;
          note?: string | null;
          reflection?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      daily_plans: {
        Row: {
          ai_status: string | null;
          created_at: string;
          date: string;
          generated_at: string | null;
          id: string;
          introduced_habit_id: string | null;
          mode: Database['public']['Enums']['plan_mode'];
          principle_id: string | null;
          principle_read_at: string | null;
          program_day: number | null;
          program_id: string | null;
          user_adjusted_at: string | null;
          user_id: string;
          why_today: string | null;
        };
        ComputedFields: never;
        Insert: {
          ai_status?: string | null;
          created_at?: string;
          date: string;
          generated_at?: string | null;
          id?: string;
          introduced_habit_id?: string | null;
          mode: Database['public']['Enums']['plan_mode'];
          principle_id?: string | null;
          principle_read_at?: string | null;
          program_day?: number | null;
          program_id?: string | null;
          user_adjusted_at?: string | null;
          user_id: string;
          why_today?: string | null;
        };
        Update: {
          ai_status?: string | null;
          created_at?: string;
          date?: string;
          generated_at?: string | null;
          id?: string;
          introduced_habit_id?: string | null;
          mode?: Database['public']['Enums']['plan_mode'];
          principle_id?: string | null;
          principle_read_at?: string | null;
          program_day?: number | null;
          program_id?: string | null;
          user_adjusted_at?: string | null;
          user_id?: string;
          why_today?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'daily_plans_introduced_habit_id_fkey';
            columns: ['introduced_habit_id'];
            isOneToOne: false;
            referencedRelation: 'habit_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_plans_principle_id_fkey';
            columns: ['principle_id'];
            isOneToOne: false;
            referencedRelation: 'principles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'daily_plans_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      engine_decisions: {
        Row: {
          candidates: NonNullable<Json>;
          created_at: string;
          fallback_used: boolean;
          id: string;
          latency_ms: number | null;
          llm_input_hash: string | null;
          llm_model: string | null;
          llm_output: Json | null;
          plan_id: string | null;
          rules_fired: string[];
          user_id: string;
          why: Json | null;
        };
        ComputedFields: never;
        Insert: {
          candidates?: NonNullable<Json>;
          created_at?: string;
          fallback_used?: boolean;
          id?: string;
          latency_ms?: number | null;
          llm_input_hash?: string | null;
          llm_model?: string | null;
          llm_output?: Json | null;
          plan_id?: string | null;
          rules_fired?: string[];
          user_id: string;
          why?: Json | null;
        };
        Update: {
          candidates?: NonNullable<Json>;
          created_at?: string;
          fallback_used?: boolean;
          id?: string;
          latency_ms?: number | null;
          llm_input_hash?: string | null;
          llm_model?: string | null;
          llm_output?: Json | null;
          plan_id?: string | null;
          rules_fired?: string[];
          user_id?: string;
          why?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'engine_decisions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'daily_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_prerequisites: {
        Row: {
          exercise_id: string;
          prerequisite_id: string;
        };
        ComputedFields: never;
        Insert: {
          exercise_id: string;
          prerequisite_id: string;
        };
        Update: {
          exercise_id?: string;
          prerequisite_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_prerequisites_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_prerequisites_prerequisite_id_fkey';
            columns: ['prerequisite_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_principles: {
        Row: {
          exercise_id: string;
          position: number;
          principle_id: string;
        };
        ComputedFields: never;
        Insert: {
          exercise_id: string;
          position: number;
          principle_id: string;
        };
        Update: {
          exercise_id?: string;
          position?: number;
          principle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_principles_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_principles_principle_id_fkey';
            columns: ['principle_id'];
            isOneToOne: false;
            referencedRelation: 'principles';
            referencedColumns: ['id'];
          },
        ];
      };
      exercises: {
        Row: {
          blockers: Database['public']['Enums']['blocker'][];
          created_at: string;
          difficulty: number;
          domain: Database['public']['Enums']['domain'];
          duration_min: number;
          energy: Database['public']['Enums']['energy_level'];
          id: string;
          instructions_en: string;
          instructions_fr: string;
          personas: Database['public']['Enums']['persona'][];
          proof_type: Database['public']['Enums']['proof_type'];
          repeat_after_days: number | null;
          status: Database['public']['Enums']['content_status'];
          time_of_day: Database['public']['Enums']['time_of_day'];
          title_en: string;
          title_fr: string;
          type: Database['public']['Enums']['exercise_type'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          blockers?: Database['public']['Enums']['blocker'][];
          created_at?: string;
          difficulty: number;
          domain: Database['public']['Enums']['domain'];
          duration_min: number;
          energy: Database['public']['Enums']['energy_level'];
          id: string;
          instructions_en: string;
          instructions_fr: string;
          personas?: Database['public']['Enums']['persona'][];
          proof_type: Database['public']['Enums']['proof_type'];
          repeat_after_days?: number | null;
          status?: Database['public']['Enums']['content_status'];
          time_of_day: Database['public']['Enums']['time_of_day'];
          title_en: string;
          title_fr: string;
          type: Database['public']['Enums']['exercise_type'];
          updated_at?: string;
        };
        Update: {
          blockers?: Database['public']['Enums']['blocker'][];
          created_at?: string;
          difficulty?: number;
          domain?: Database['public']['Enums']['domain'];
          duration_min?: number;
          energy?: Database['public']['Enums']['energy_level'];
          id?: string;
          instructions_en?: string;
          instructions_fr?: string;
          personas?: Database['public']['Enums']['persona'][];
          proof_type?: Database['public']['Enums']['proof_type'];
          repeat_after_days?: number | null;
          status?: Database['public']['Enums']['content_status'];
          time_of_day?: Database['public']['Enums']['time_of_day'];
          title_en?: string;
          title_fr?: string;
          type?: Database['public']['Enums']['exercise_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: Database['public']['Enums']['favorite_entity'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: Database['public']['Enums']['favorite_entity'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: Database['public']['Enums']['favorite_entity'];
          user_id?: string;
        };
        Relationships: [];
      };
      goals: {
        Row: {
          achieved_at: string | null;
          created_at: string;
          current_value: number | null;
          current_value_updated_at: string | null;
          deadline: string | null;
          id: string;
          status: Database['public']['Enums']['goal_status'];
          target_value: number | null;
          title: string;
          unit: string | null;
          updated_at: string;
          user_id: string;
          why: string | null;
        };
        ComputedFields: never;
        Insert: {
          achieved_at?: string | null;
          created_at?: string;
          current_value?: number | null;
          current_value_updated_at?: string | null;
          deadline?: string | null;
          id?: string;
          status?: Database['public']['Enums']['goal_status'];
          target_value?: number | null;
          title: string;
          unit?: string | null;
          updated_at?: string;
          user_id: string;
          why?: string | null;
        };
        Update: {
          achieved_at?: string | null;
          created_at?: string;
          current_value?: number | null;
          current_value_updated_at?: string | null;
          deadline?: string | null;
          id?: string;
          status?: Database['public']['Enums']['goal_status'];
          target_value?: number | null;
          title?: string;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
          why?: string | null;
        };
        Relationships: [];
      };
      habit_logs: {
        Row: {
          created_at: string;
          date: string;
          done: boolean;
          minimal: boolean;
          user_habit_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          date: string;
          done?: boolean;
          minimal?: boolean;
          user_habit_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          done?: boolean;
          minimal?: boolean;
          user_habit_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_logs_user_habit_id_user_id_fkey';
            columns: ['user_habit_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'user_habits';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      habit_template_principles: {
        Row: {
          habit_template_id: string;
          position: number;
          principle_id: string;
        };
        ComputedFields: never;
        Insert: {
          habit_template_id: string;
          position: number;
          principle_id: string;
        };
        Update: {
          habit_template_id?: string;
          position?: number;
          principle_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_template_principles_habit_template_id_fkey';
            columns: ['habit_template_id'];
            isOneToOne: false;
            referencedRelation: 'habit_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'habit_template_principles_principle_id_fkey';
            columns: ['principle_id'];
            isOneToOne: false;
            referencedRelation: 'principles';
            referencedColumns: ['id'];
          },
        ];
      };
      habit_templates: {
        Row: {
          created_at: string;
          default_cue_en: string;
          default_cue_fr: string;
          description_en: string;
          description_fr: string;
          domain: Database['public']['Enums']['domain'];
          frequency: Database['public']['Enums']['habit_frequency'];
          id: string;
          minimal_version_en: string;
          minimal_version_fr: string;
          personas: Database['public']['Enums']['persona'][];
          status: Database['public']['Enums']['content_status'];
          time_of_day: Database['public']['Enums']['time_of_day'];
          title_en: string;
          title_fr: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          default_cue_en: string;
          default_cue_fr: string;
          description_en: string;
          description_fr: string;
          domain: Database['public']['Enums']['domain'];
          frequency: Database['public']['Enums']['habit_frequency'];
          id: string;
          minimal_version_en: string;
          minimal_version_fr: string;
          personas?: Database['public']['Enums']['persona'][];
          status?: Database['public']['Enums']['content_status'];
          time_of_day: Database['public']['Enums']['time_of_day'];
          title_en: string;
          title_fr: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          default_cue_en?: string;
          default_cue_fr?: string;
          description_en?: string;
          description_fr?: string;
          domain?: Database['public']['Enums']['domain'];
          frequency?: Database['public']['Enums']['habit_frequency'];
          id?: string;
          minimal_version_en?: string;
          minimal_version_fr?: string;
          personas?: Database['public']['Enums']['persona'][];
          status?: Database['public']['Enums']['content_status'];
          time_of_day?: Database['public']['Enums']['time_of_day'];
          title_en?: string;
          title_fr?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      llm_calls: {
        Row: {
          attempts: number;
          cache_read_tokens: number;
          cache_write_tokens: number;
          cost_eur: number;
          created_at: string;
          decision_id: string | null;
          detail: string | null;
          fallback_reason: string | null;
          feature: Database['public']['Enums']['llm_feature'];
          id: string;
          input_hash: string | null;
          input_tokens: number;
          latency_ms: number | null;
          local_date: string;
          model: string | null;
          outcome: Database['public']['Enums']['llm_outcome'];
          output: Json | null;
          output_tokens: number;
          provider: string | null;
          review_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_eur?: number;
          created_at?: string;
          decision_id?: string | null;
          detail?: string | null;
          fallback_reason?: string | null;
          feature: Database['public']['Enums']['llm_feature'];
          id?: string;
          input_hash?: string | null;
          input_tokens?: number;
          latency_ms?: number | null;
          local_date: string;
          model?: string | null;
          outcome: Database['public']['Enums']['llm_outcome'];
          output?: Json | null;
          output_tokens?: number;
          provider?: string | null;
          review_id?: string | null;
          user_id: string;
        };
        Update: {
          attempts?: number;
          cache_read_tokens?: number;
          cache_write_tokens?: number;
          cost_eur?: number;
          created_at?: string;
          decision_id?: string | null;
          detail?: string | null;
          fallback_reason?: string | null;
          feature?: Database['public']['Enums']['llm_feature'];
          id?: string;
          input_hash?: string | null;
          input_tokens?: number;
          latency_ms?: number | null;
          local_date?: string;
          model?: string | null;
          outcome?: Database['public']['Enums']['llm_outcome'];
          output?: Json | null;
          output_tokens?: number;
          provider?: string | null;
          review_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'llm_calls_decision_id_fkey';
            columns: ['decision_id'];
            isOneToOne: false;
            referencedRelation: 'engine_decisions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'llm_calls_review_id_fkey';
            columns: ['review_id'];
            isOneToOne: false;
            referencedRelation: 'weekly_reviews';
            referencedColumns: ['id'];
          },
        ];
      };
      notes: {
        Row: {
          body: string;
          created_at: string;
          entity_id: string;
          entity_type: Database['public']['Enums']['favorite_entity'];
          id: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          entity_id: string;
          entity_type: Database['public']['Enums']['favorite_entity'];
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          entity_id?: string;
          entity_type?: Database['public']['Enums']['favorite_entity'];
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      plan_items: {
        Row: {
          adopted: boolean;
          completed_at: string | null;
          created_at: string;
          exercise_id: string;
          id: string;
          origin: Database['public']['Enums']['plan_item_origin'];
          personalized_instructions: string | null;
          plan_id: string;
          position: number;
          proof_value: string | null;
          rating: number | null;
          status: Database['public']['Enums']['plan_item_status'];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          adopted?: boolean;
          completed_at?: string | null;
          created_at?: string;
          exercise_id: string;
          id?: string;
          origin?: Database['public']['Enums']['plan_item_origin'];
          personalized_instructions?: string | null;
          plan_id: string;
          position?: number;
          proof_value?: string | null;
          rating?: number | null;
          status?: Database['public']['Enums']['plan_item_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          adopted?: boolean;
          completed_at?: string | null;
          created_at?: string;
          exercise_id?: string;
          id?: string;
          origin?: Database['public']['Enums']['plan_item_origin'];
          personalized_instructions?: string | null;
          plan_id?: string;
          position?: number;
          proof_value?: string | null;
          rating?: number | null;
          status?: Database['public']['Enums']['plan_item_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_items_exercise_id_fkey';
            columns: ['exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_items_plan_id_user_id_fkey';
            columns: ['plan_id', 'user_id'];
            isOneToOne: false;
            referencedRelation: 'daily_plans';
            referencedColumns: ['id', 'user_id'];
          },
        ];
      };
      principle_sources: {
        Row: {
          position: number;
          principle_id: string;
          source_id: string;
        };
        ComputedFields: never;
        Insert: {
          position: number;
          principle_id: string;
          source_id: string;
        };
        Update: {
          position?: number;
          principle_id?: string;
          source_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'principle_sources_principle_id_fkey';
            columns: ['principle_id'];
            isOneToOne: false;
            referencedRelation: 'principles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'principle_sources_source_id_fkey';
            columns: ['source_id'];
            isOneToOne: false;
            referencedRelation: 'sources';
            referencedColumns: ['id'];
          },
        ];
      };
      principles: {
        Row: {
          created_at: string;
          domain: Database['public']['Enums']['domain'];
          id: string;
          status: Database['public']['Enums']['content_status'];
          summary_en: string;
          summary_fr: string;
          title_en: string;
          title_fr: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          domain: Database['public']['Enums']['domain'];
          id: string;
          status?: Database['public']['Enums']['content_status'];
          summary_en: string;
          summary_fr: string;
          title_en: string;
          title_fr: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          domain?: Database['public']['Enums']['domain'];
          id?: string;
          status?: Database['public']['Enums']['content_status'];
          summary_en?: string;
          summary_fr?: string;
          title_en?: string;
          title_fr?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profile_stats: {
        Row: {
          avg_minutes: number | null;
          completion_7d: number | null;
          completion_by_domain: NonNullable<Json>;
          energy_trend: number | null;
          level: Database['public']['Enums']['user_level'] | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          avg_minutes?: number | null;
          completion_7d?: number | null;
          completion_by_domain?: NonNullable<Json>;
          energy_trend?: number | null;
          level?: Database['public']['Enums']['user_level'] | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avg_minutes?: number | null;
          completion_7d?: number | null;
          completion_by_domain?: NonNullable<Json>;
          energy_trend?: number | null;
          level?: Database['public']['Enums']['user_level'] | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          blockers: Database['public']['Enums']['blocker'][];
          chronotype: Database['public']['Enums']['chronotype'] | null;
          consent_ai: boolean;
          consent_at: string | null;
          consent_checkin: boolean;
          created_at: string;
          daily_minutes: number | null;
          deletion_requested_at: string | null;
          display_name: string | null;
          level: Database['public']['Enums']['user_level'];
          locale: string;
          motivation_style: Database['public']['Enums']['motivation_style'] | null;
          notify_evening: string | null;
          notify_morning: string | null;
          onboarded_at: string | null;
          persona: Database['public']['Enums']['persona'] | null;
          priority_domains: Database['public']['Enums']['domain'][];
          program_day: number;
          program_id: string | null;
          program_start_date: string | null;
          role: Database['public']['Enums']['user_role'];
          situation: Database['public']['Enums']['situation'] | null;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          blockers?: Database['public']['Enums']['blocker'][];
          chronotype?: Database['public']['Enums']['chronotype'] | null;
          consent_ai?: boolean;
          consent_at?: string | null;
          consent_checkin?: boolean;
          created_at?: string;
          daily_minutes?: number | null;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          level?: Database['public']['Enums']['user_level'];
          locale?: string;
          motivation_style?: Database['public']['Enums']['motivation_style'] | null;
          notify_evening?: string | null;
          notify_morning?: string | null;
          onboarded_at?: string | null;
          persona?: Database['public']['Enums']['persona'] | null;
          priority_domains?: Database['public']['Enums']['domain'][];
          program_day?: number;
          program_id?: string | null;
          program_start_date?: string | null;
          role?: Database['public']['Enums']['user_role'];
          situation?: Database['public']['Enums']['situation'] | null;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          blockers?: Database['public']['Enums']['blocker'][];
          chronotype?: Database['public']['Enums']['chronotype'] | null;
          consent_ai?: boolean;
          consent_at?: string | null;
          consent_checkin?: boolean;
          created_at?: string;
          daily_minutes?: number | null;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          level?: Database['public']['Enums']['user_level'];
          locale?: string;
          motivation_style?: Database['public']['Enums']['motivation_style'] | null;
          notify_evening?: string | null;
          notify_morning?: string | null;
          onboarded_at?: string | null;
          persona?: Database['public']['Enums']['persona'] | null;
          priority_domains?: Database['public']['Enums']['domain'][];
          program_day?: number;
          program_id?: string | null;
          program_start_date?: string | null;
          role?: Database['public']['Enums']['user_role'];
          situation?: Database['public']['Enums']['situation'] | null;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      program_steps: {
        Row: {
          day_index: number;
          introduced_habit_id: string | null;
          main_exercise_id: string;
          minimal_exercise_id: string;
          principle_id: string;
          program_id: string;
          theme_en: string;
          theme_fr: string;
        };
        ComputedFields: never;
        Insert: {
          day_index: number;
          introduced_habit_id?: string | null;
          main_exercise_id: string;
          minimal_exercise_id: string;
          principle_id: string;
          program_id: string;
          theme_en: string;
          theme_fr: string;
        };
        Update: {
          day_index?: number;
          introduced_habit_id?: string | null;
          main_exercise_id?: string;
          minimal_exercise_id?: string;
          principle_id?: string;
          program_id?: string;
          theme_en?: string;
          theme_fr?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'program_steps_introduced_habit_id_fkey';
            columns: ['introduced_habit_id'];
            isOneToOne: false;
            referencedRelation: 'habit_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_steps_main_exercise_id_fkey';
            columns: ['main_exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_steps_minimal_exercise_id_fkey';
            columns: ['minimal_exercise_id'];
            isOneToOne: false;
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_steps_principle_id_fkey';
            columns: ['principle_id'];
            isOneToOne: false;
            referencedRelation: 'principles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_steps_program_id_fkey';
            columns: ['program_id'];
            isOneToOne: false;
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      programs: {
        Row: {
          created_at: string;
          description_en: string;
          description_fr: string;
          duration_days: number;
          id: string;
          name_en: string;
          name_fr: string;
          persona: Database['public']['Enums']['persona'];
          status: Database['public']['Enums']['content_status'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description_en: string;
          description_fr: string;
          duration_days: number;
          id: string;
          name_en: string;
          name_fr: string;
          persona: Database['public']['Enums']['persona'];
          status?: Database['public']['Enums']['content_status'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description_en?: string;
          description_fr?: string;
          duration_days?: number;
          id?: string;
          name_en?: string;
          name_fr?: string;
          persona?: Database['public']['Enums']['persona'];
          status?: Database['public']['Enums']['content_status'];
          updated_at?: string;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          author: string;
          created_at: string;
          id: string;
          title_fr: string;
          title_original: string;
          updated_at: string;
          year: number | null;
        };
        ComputedFields: never;
        Insert: {
          author: string;
          created_at?: string;
          id: string;
          title_fr: string;
          title_original: string;
          updated_at?: string;
          year?: number | null;
        };
        Update: {
          author?: string;
          created_at?: string;
          id?: string;
          title_fr?: string;
          title_original?: string;
          updated_at?: string;
          year?: number | null;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          plan: Database['public']['Enums']['subscription_plan'];
          provider: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          plan?: Database['public']['Enums']['subscription_plan'];
          provider?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          plan?: Database['public']['Enums']['subscription_plan'];
          provider?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_guide_state: {
        Row: {
          milestones: NonNullable<Json>;
          tips_seen: NonNullable<Json>;
          tour_finished_at: string | null;
          tour_skipped: boolean;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          milestones?: NonNullable<Json>;
          tips_seen?: NonNullable<Json>;
          tour_finished_at?: string | null;
          tour_skipped?: boolean;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          milestones?: NonNullable<Json>;
          tips_seen?: NonNullable<Json>;
          tour_finished_at?: string | null;
          tour_skipped?: boolean;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_habits: {
        Row: {
          active: boolean;
          created_at: string;
          cue: string | null;
          frequency: Database['public']['Enums']['habit_frequency'];
          id: string;
          minimal_version: string | null;
          simplified: boolean;
          template_id: string | null;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          cue?: string | null;
          frequency?: Database['public']['Enums']['habit_frequency'];
          id?: string;
          minimal_version?: string | null;
          simplified?: boolean;
          template_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          cue?: string | null;
          frequency?: Database['public']['Enums']['habit_frequency'];
          id?: string;
          minimal_version?: string | null;
          simplified?: boolean;
          template_id?: string | null;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_habits_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'habit_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      weekly_reviews: {
        Row: {
          accepted: NonNullable<Json>;
          ai_status: string | null;
          created_at: string;
          generated_at: string;
          id: string;
          proposals: NonNullable<Json>;
          stats: NonNullable<Json>;
          summary: string | null;
          updated_at: string;
          user_id: string;
          week_start: string;
        };
        ComputedFields: never;
        Insert: {
          accepted?: NonNullable<Json>;
          ai_status?: string | null;
          created_at?: string;
          generated_at?: string;
          id?: string;
          proposals?: NonNullable<Json>;
          stats?: NonNullable<Json>;
          summary?: string | null;
          updated_at?: string;
          user_id: string;
          week_start: string;
        };
        Update: {
          accepted?: NonNullable<Json>;
          ai_status?: string | null;
          created_at?: string;
          generated_at?: string;
          id?: string;
          proposals?: NonNullable<Json>;
          stats?: NonNullable<Json>;
          summary?: string | null;
          updated_at?: string;
          user_id?: string;
          week_start?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      add_exercise_to_today: { Args: { p_exercise_id: string }; Returns: Json };
      add_habit_from_template: { Args: { p_template_id: string }; Returns: string };
      admin_ai_cost_daily: {
        Args: { p_days?: number };
        Returns: {
          avg_latency_ms: number;
          cache_hits: number;
          calls: number;
          cost_eur: number;
          day: string;
          fallbacks: number;
          feature: Database['public']['Enums']['llm_feature'];
          input_tokens: number;
          output_tokens: number;
          quota_refusals: number;
        }[];
      };
      admin_engine_log: {
        Args: { p_email: string; p_limit?: number };
        Returns: {
          ai_status: string;
          candidates: Json;
          created_at: string;
          decision_id: string;
          items: Json;
          llm_calls: Json;
          mode: Database['public']['Enums']['plan_mode'];
          plan_date: string;
          program_day: number;
          rules_fired: string[];
          why: Json;
        }[];
      };
      admin_exercise_stats: {
        Args: { p_from: string; p_to: string };
        Returns: {
          added: number;
          avg_rating: number;
          domain: Database['public']['Enums']['domain'];
          done: number;
          done_rate: number;
          exercise_id: string;
          proposed: number;
          skip_rate: number;
          status: Database['public']['Enums']['content_status'];
          title_en: string;
          title_fr: string;
          too_hard_rate: number;
        }[];
      };
      answer_review_proposal: {
        Args: { p_accept: boolean; p_index: number; p_review_id: string };
        Returns: Json;
      };
      app_setting_enabled: { Args: { p_key: string }; Returns: boolean };
      apply_plan_enrichment: {
        Args: { p_generated_at: string; p_plan_id: string; p_result: Json };
        Returns: string;
      };
      apply_review_enrichment: { Args: { p_result: Json; p_review_id: string }; Returns: string };
      assistant_daily_limit: { Args: Record<PropertyKey, never>; Returns: number };
      assistant_month_cost: { Args: { p_user_id: string }; Returns: number };
      assistant_monthly_cap: { Args: Record<PropertyKey, never>; Returns: number };
      assistant_quota: { Args: Record<PropertyKey, never>; Returns: Json };
      cancel_account_deletion: { Args: Record<PropertyKey, never>; Returns: undefined };
      cancel_assistant_action: { Args: { p_action_id: string }; Returns: undefined };
      change_program: { Args: { p_program_id: string }; Returns: undefined };
      complete_onboarding: {
        Args: {
          p_blockers?: Database['public']['Enums']['blocker'][];
          p_chronotype?: Database['public']['Enums']['chronotype'];
          p_consent_ai?: boolean;
          p_consent_checkin?: boolean;
          p_daily_minutes?: number;
          p_goal_deadline?: string;
          p_goal_target_value?: number;
          p_goal_title: string;
          p_goal_unit?: string;
          p_goal_why?: string;
          p_habits: Json;
          p_level?: Database['public']['Enums']['user_level'];
          p_locale?: string;
          p_motivation_style?: Database['public']['Enums']['motivation_style'];
          p_notify_evening?: string;
          p_notify_morning?: string;
          p_priority_domains?: Database['public']['Enums']['domain'][];
          p_program_id: string;
          p_situation?: Database['public']['Enums']['situation'];
          p_timezone?: string;
        };
        Returns: undefined;
      };
      confirm_assistant_action: { Args: { p_action_id: string }; Returns: Json };
      current_user_local_date: { Args: Record<PropertyKey, never>; Returns: string };
      delete_assistant_history: { Args: Record<PropertyKey, never>; Returns: undefined };
      delete_assistant_thread: { Args: { p_thread_id: string }; Returns: undefined };
      dev_set_plan: {
        Args: { p_plan: Database['public']['Enums']['subscription_plan'] };
        Returns: undefined;
      };
      engine_exercise_history: {
        Args: { p_user_id: string };
        Returns: {
          exercise_id: string;
          last_done_on: string;
          last_rating1_on: string;
          skips: number;
        }[];
      };
      erase_mood_energy: { Args: Record<PropertyKey, never>; Returns: number };
      finish_guided_tour: { Args: { p_skipped: boolean }; Returns: undefined };
      get_app_flags: { Args: Record<PropertyKey, never>; Returns: Json };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_premium: { Args: { p_user_id: string }; Returns: boolean };
      lock_untouched_today_plan: {
        Args: Record<PropertyKey, never>;
        Returns: {
          ai_status: string | null;
          created_at: string;
          date: string;
          generated_at: string | null;
          id: string;
          introduced_habit_id: string | null;
          mode: Database['public']['Enums']['plan_mode'];
          principle_id: string | null;
          principle_read_at: string | null;
          program_day: number | null;
          program_id: string | null;
          user_adjusted_at: string | null;
          user_id: string;
          why_today: string | null;
        };
        SetofOptions: {
          from: '*';
          to: 'daily_plans';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      mark_milestone_celebrated: { Args: { p_milestone: string }; Returns: undefined };
      mark_principle_read: { Args: { p_plan_id: string }; Returns: undefined };
      mark_tip_seen: { Args: { p_tip: string }; Returns: undefined };
      my_done_days: { Args: Record<PropertyKey, never>; Returns: string[] };
      purge_assistant_history: { Args: { p_now?: string }; Returns: number };
      purge_deleted_accounts: { Args: { p_now: string }; Returns: number };
      replace_active_goal: {
        Args: {
          p_deadline?: string;
          p_target_value?: number;
          p_title: string;
          p_unit?: string;
          p_why?: string;
        };
        Returns: string;
      };
      request_account_deletion: { Args: Record<PropertyKey, never>; Returns: string };
      require_admin: { Args: Record<PropertyKey, never>; Returns: undefined };
      save_daily_plan: {
        Args: { p_date: string; p_decision: Json; p_plan: Json; p_user_id: string };
        Returns: Json;
      };
      save_weekly_review: {
        Args: { p_proposals: Json; p_stats: Json; p_user_id: string; p_week_start: string };
        Returns: Json;
      };
      set_plan_item_result: {
        Args: {
          p_item_id: string;
          p_proof_value?: string;
          p_rating?: number;
          p_status: Database['public']['Enums']['plan_item_status'];
        };
        Returns: Json;
      };
      shorten_today_plan: { Args: { p_minutes?: number }; Returns: Json };
      swap_candidates: {
        Args: { p_date: string; p_user_id: string };
        Returns: {
          exercise_id: string;
        }[];
      };
      swap_today_exercise: { Args: { p_exercise_id: string }; Returns: Json };
      today_available_minutes: { Args: { p_date: string; p_user_id: string }; Returns: number };
      trigger_plans_batch: { Args: Record<PropertyKey, never>; Returns: number };
      upsert_checkin: {
        Args: {
          p_energy?: number;
          p_minutes_tomorrow: number;
          p_mood?: number;
          p_note?: string;
          p_reflection?: string;
        };
        Returns: string;
      };
      users_due_for_plan: {
        Args: { p_limit?: number; p_now: string };
        Returns: {
          local_date: string;
          user_id: string;
        }[];
      };
      users_due_for_review: {
        Args: { p_limit?: number; p_now: string };
        Returns: {
          user_id: string;
          week_start: string;
        }[];
      };
    };
    Enums: {
      blocker:
        'procrastination' | 'fear' | 'finances' | 'confidence' | 'organisation' | 'motivation';
      chronotype: 'morning' | 'midday' | 'evening';
      content_status: 'draft' | 'review' | 'published' | 'retired';
      domain:
        | 'clarity_goals'
        | 'discipline_habits'
        | 'money_wealth'
        | 'business_career'
        | 'mindset_beliefs'
        | 'relationships_network'
        | 'energy_health';
      energy_level: 'low' | 'medium' | 'high';
      exercise_type: 'writing' | 'reflection' | 'action' | 'visualisation' | 'learning' | 'social';
      favorite_entity: 'principle' | 'exercise';
      goal_status: 'active' | 'achieved' | 'abandoned';
      habit_frequency: 'daily' | 'weekdays' | 'weekly' | 'biweekly' | 'monthly' | 'occasional';
      llm_feature: 'plan' | 'review' | 'assistant';
      llm_outcome: 'success' | 'fallback' | 'cache_hit' | 'quota_exceeded';
      motivation_style: 'challenge' | 'consistency' | 'meaning' | 'recognition';
      persona: 'entrepreneur' | 'employee' | 'career_changer' | 'financial_beginner';
      plan_item_origin: 'engine' | 'user';
      plan_item_status: 'todo' | 'done' | 'skipped' | 'too_hard';
      plan_mode: 'normal' | 'minimal' | 'recovery';
      proof_type: 'checkbox' | 'free_text' | 'numeric';
      situation: 'employee' | 'entrepreneur' | 'freelancer' | 'student' | 'in_transition';
      subscription_plan: 'free' | 'premium';
      time_of_day: 'morning' | 'daytime' | 'evening' | 'any';
      user_level: 'beginner' | 'intermediate' | 'advanced';
      user_role: 'user' | 'admin';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      blocker: ['procrastination', 'fear', 'finances', 'confidence', 'organisation', 'motivation'],
      chronotype: ['morning', 'midday', 'evening'],
      content_status: ['draft', 'review', 'published', 'retired'],
      domain: [
        'clarity_goals',
        'discipline_habits',
        'money_wealth',
        'business_career',
        'mindset_beliefs',
        'relationships_network',
        'energy_health',
      ],
      energy_level: ['low', 'medium', 'high'],
      exercise_type: ['writing', 'reflection', 'action', 'visualisation', 'learning', 'social'],
      favorite_entity: ['principle', 'exercise'],
      goal_status: ['active', 'achieved', 'abandoned'],
      habit_frequency: ['daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'occasional'],
      llm_feature: ['plan', 'review', 'assistant'],
      llm_outcome: ['success', 'fallback', 'cache_hit', 'quota_exceeded'],
      motivation_style: ['challenge', 'consistency', 'meaning', 'recognition'],
      persona: ['entrepreneur', 'employee', 'career_changer', 'financial_beginner'],
      plan_item_origin: ['engine', 'user'],
      plan_item_status: ['todo', 'done', 'skipped', 'too_hard'],
      plan_mode: ['normal', 'minimal', 'recovery'],
      proof_type: ['checkbox', 'free_text', 'numeric'],
      situation: ['employee', 'entrepreneur', 'freelancer', 'student', 'in_transition'],
      subscription_plan: ['free', 'premium'],
      time_of_day: ['morning', 'daytime', 'evening', 'any'],
      user_level: ['beginner', 'intermediate', 'advanced'],
      user_role: ['user', 'admin'],
    },
  },
} as const;
