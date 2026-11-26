export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1'
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          analysis_progress: number | null
          analysis_step: string | null
          analysis_trace: Json | null
          api_cost_euros: number | null
          archived_at: string | null
          company_name: string
          contact_count: number
          created_at: string
          employees: string | null
          error_message: string | null
          headquarters: string | null
          id: string
          it_challenges: Json | null
          message_count: number
          messages_last_generated_at: string | null
          messages_last_generated_count: number
          messages_last_generated_trace: Json | null
          priority_justification: string | null
          priority_score: number | null
          raw_analysis: Json | null
          recent_signals: Json | null
          revenue: string | null
          sector: string | null
          status: string
          subsidiaries: Json | null
          updated_at: string
          user_context: string | null
          user_id: string
          website: string | null
        }
        Insert: {
          analysis_progress?: number | null
          analysis_step?: string | null
          analysis_trace?: Json | null
          api_cost_euros?: number | null
          archived_at?: string | null
          company_name: string
          contact_count?: number
          created_at?: string
          employees?: string | null
          error_message?: string | null
          headquarters?: string | null
          id?: string
          it_challenges?: Json | null
          message_count?: number
          messages_last_generated_at?: string | null
          messages_last_generated_count?: number
          messages_last_generated_trace?: Json | null
          priority_justification?: string | null
          priority_score?: number | null
          raw_analysis?: Json | null
          recent_signals?: Json | null
          revenue?: string | null
          sector?: string | null
          status?: string
          subsidiaries?: Json | null
          updated_at?: string
          user_context?: string | null
          user_id: string
          website?: string | null
        }
        Update: {
          analysis_progress?: number | null
          analysis_step?: string | null
          analysis_trace?: Json | null
          api_cost_euros?: number | null
          archived_at?: string | null
          company_name?: string
          contact_count?: number
          created_at?: string
          employees?: string | null
          error_message?: string | null
          headquarters?: string | null
          id?: string
          it_challenges?: Json | null
          message_count?: number
          messages_last_generated_at?: string | null
          messages_last_generated_count?: number
          messages_last_generated_trace?: Json | null
          priority_justification?: string | null
          priority_score?: number | null
          raw_analysis?: Json | null
          recent_signals?: Json | null
          revenue?: string | null
          sector?: string | null
          status?: string
          subsidiaries?: Json | null
          updated_at?: string
          user_context?: string | null
          user_id?: string
          website?: string | null
        }
        Relationships: []
      }
      action_plans: {
        Row: {
          account_id: string
          created_at: string
          id: string
          strategy_justification: string | null
          strategy_type: string | null
          updated_at: string
          user_id: string
          weeks: Json
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          strategy_justification?: string | null
          strategy_type?: string | null
          updated_at?: string
          user_id: string
          weeks?: Json
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          strategy_justification?: string | null
          strategy_type?: string | null
          updated_at?: string
          user_id?: string
          weeks?: Json
        }
        Relationships: [
          {
            foreignKeyName: 'action_plans_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      attack_angles: {
        Row: {
          account_id: string
          created_at: string
          description: string | null
          entry_point: string | null
          id: string
          is_recommended: boolean | null
          rank: number | null
          title: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          description?: string | null
          entry_point?: string | null
          id?: string
          is_recommended?: boolean | null
          rank?: number | null
          title: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          description?: string | null
          entry_point?: string | null
          id?: string
          is_recommended?: boolean | null
          rank?: number | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'attack_angles_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string
          created_at: string
          decision_role: string | null
          email: string | null
          email_message: Json | null
          email_verified: boolean | null
          entity: string | null
          followup_message: Json | null
          full_name: string
          id: string
          linkedin_message: string | null
          linkedin_url: string | null
          phone: string | null
          phone_script: string | null
          priority: number | null
          profile_summary: string | null
          raw_data: Json | null
          source: string | null
          title: string | null
          updated_at: string
          user_id: string
          user_status: string | null
          why_contact: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          decision_role?: string | null
          email?: string | null
          email_message?: Json | null
          email_verified?: boolean | null
          entity?: string | null
          followup_message?: Json | null
          full_name: string
          id?: string
          linkedin_message?: string | null
          linkedin_url?: string | null
          phone?: string | null
          phone_script?: string | null
          priority?: number | null
          profile_summary?: string | null
          raw_data?: Json | null
          source?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
          user_status?: string | null
          why_contact?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          decision_role?: string | null
          email?: string | null
          email_message?: Json | null
          email_verified?: boolean | null
          entity?: string | null
          followup_message?: Json | null
          full_name?: string
          id?: string
          linkedin_message?: string | null
          linkedin_url?: string | null
          phone?: string | null
          phone_script?: string | null
          priority?: number | null
          profile_summary?: string | null
          raw_data?: Json | null
          source?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
          user_status?: string | null
          why_contact?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'contacts_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          created_at: string
          full_name: string | null
          id: string
          onboarding_completed: boolean
          onboarding_data: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          onboarding_data?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rag_documents: {
        Row: {
          category: string
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json | null
          title: string
          user_id: string | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          title: string
          user_id?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          accounts_limit: number
          accounts_used: number
          contacts_enriched: number
          contacts_limit: number
          created_at: string
          id: string
          period_end: string
          period_start: string
          plan: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accounts_limit?: number
          accounts_used?: number
          contacts_enriched?: number
          contacts_limit?: number
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          plan?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accounts_limit?: number
          accounts_used?: number
          contacts_enriched?: number
          contacts_limit?: number
          created_at?: string
          id?: string
          period_end?: string
          period_start?: string
          plan?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_and_increment_accounts_used: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_max_per_hour?: number; p_user_id: string }
        Returns: boolean
      }
      increment_accounts_used: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      recompute_account_stats: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      search_rag: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          category: string
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
