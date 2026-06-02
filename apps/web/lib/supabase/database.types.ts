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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      brand_members: {
        Row: {
          brand_id: string
          created_at: string
          display_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          display_name?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          display_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          contact_email: string | null
          created_at: string
          event_balance: number
          id: string
          mp_access_token_enc: string | null
          mp_public_key_enc: string | null
          mp_webhook_secret: string | null
          name: string
          slug: string
          theme_json: Json
          updated_at: string
          whatsapp_e164: string | null
          yape_holder: string | null
          yape_number: string | null
        }
        Insert: {
          contact_email?: string | null
          created_at?: string
          event_balance?: number
          id?: string
          mp_access_token_enc?: string | null
          mp_public_key_enc?: string | null
          mp_webhook_secret?: string | null
          name: string
          slug: string
          theme_json?: Json
          updated_at?: string
          whatsapp_e164?: string | null
          yape_holder?: string | null
          yape_number?: string | null
        }
        Update: {
          contact_email?: string | null
          created_at?: string
          event_balance?: number
          id?: string
          mp_access_token_enc?: string | null
          mp_public_key_enc?: string | null
          mp_webhook_secret?: string | null
          name?: string
          slug?: string
          theme_json?: Json
          updated_at?: string
          whatsapp_e164?: string | null
          yape_holder?: string | null
          yape_number?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          brand_id: string
          cover_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          is_published: boolean
          min_age: number
          name: string
          refund_policy: string | null
          slug: string
          starts_at: string
          updated_at: string
          venue_address: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
        }
        Insert: {
          brand_id: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_published?: boolean
          min_age?: number
          name: string
          refund_policy?: string | null
          slug: string
          starts_at: string
          updated_at?: string
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Update: {
          brand_id?: string
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_published?: boolean
          min_age?: number
          name?: string
          refund_policy?: string | null
          slug?: string
          starts_at?: string
          updated_at?: string
          venue_address?: string | null
          venue_lat?: number | null
          venue_lng?: number | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      events_log: {
        Row: {
          actor_user_id: string | null
          brand_id: string | null
          created_at: string
          event_id: string | null
          id: string
          order_id: string | null
          payload: Json
          ticket_id: string | null
          type: string
        }
        Insert: {
          actor_user_id?: string | null
          brand_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          ticket_id?: string | null
          type: string
        }
        Update: {
          actor_user_id?: string | null
          brand_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          order_id?: string | null
          payload?: Json
          ticket_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_log_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_log_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          quantity: number
          subtotal_cents: number
          ticket_type_id: string
          ticket_type_name: string
          unit_price_cents: number
        }
        Insert: {
          id?: string
          order_id: string
          quantity: number
          subtotal_cents: number
          ticket_type_id: string
          ticket_type_name: string
          unit_price_cents: number
        }
        Update: {
          id?: string
          order_id?: string
          quantity?: number
          subtotal_cents?: number
          ticket_type_id?: string
          ticket_type_name?: string
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          brand_id: string
          buyer_age_ok: boolean
          buyer_dni: string | null
          buyer_email: string
          buyer_name: string
          buyer_phone: string
          created_at: string
          email_sent_at: string | null
          event_id: string
          expires_at: string
          id: string
          ip_address: unknown
          marketing_opt_in: boolean
          mp_payment_id: string | null
          mp_payment_status: string | null
          mp_preference_id: string | null
          promo_code_id: string | null
          discount_cents: number
          paid_at: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_agent: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          yape_proof_id: string | null
        }
        Insert: {
          brand_id: string
          buyer_age_ok: boolean
          buyer_dni?: string | null
          buyer_email: string
          buyer_name: string
          buyer_phone: string
          created_at?: string
          email_sent_at?: string | null
          event_id: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          marketing_opt_in?: boolean
          mp_payment_id?: string | null
          mp_payment_status?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          yape_proof_id?: string | null
        }
        Update: {
          brand_id?: string
          buyer_age_ok?: boolean
          buyer_dni?: string | null
          buyer_email?: string
          buyer_name?: string
          buyer_phone?: string
          created_at?: string
          email_sent_at?: string | null
          event_id?: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          marketing_opt_in?: boolean
          mp_payment_id?: string | null
          mp_payment_status?: string | null
          mp_preference_id?: string | null
          paid_at?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_agent?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          yape_proof_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_yape_proof_fk"
            columns: ["yape_proof_id"]
            isOneToOne: false
            referencedRelation: "yape_proofs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reservations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          order_id: string | null
          quantity: number
          session_id: string
          ticket_type_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          order_id?: string | null
          quantity: number
          session_id: string
          ticket_type_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string | null
          quantity?: number
          session_id?: string
          ticket_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          id: string
          event_id: string
          brand_id: string
          code: string
          label: string | null
          discount_type: 'percent' | 'fixed' | 'free'
          discount_value: number
          max_uses: number | null
          use_count: number
          per_email_limit: number
          applies_to_all: boolean
          expires_at: string | null
          is_active: boolean
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          event_id: string
          brand_id: string
          code: string
          label?: string | null
          discount_type: 'percent' | 'fixed' | 'free'
          discount_value: number
          max_uses?: number | null
          use_count?: number
          per_email_limit?: number
          applies_to_all?: boolean
          expires_at?: string | null
          is_active?: boolean
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          label?: string | null
          is_active?: boolean
          max_uses?: number | null
          expires_at?: string | null
          use_count?: number
        }
        Relationships: []
      }
      promo_code_ticket_types: {
        Row: { promo_code_id: string; ticket_type_id: string }
        Insert: { promo_code_id: string; ticket_type_id: string }
        Update: { promo_code_id?: string; ticket_type_id?: string }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          id: string
          promo_code_id: string
          order_id: string
          event_id: string
          brand_id: string
          email: string
          amount_discount_cents: number
          status: 'held' | 'consumed' | 'released'
          breakdown: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          promo_code_id: string
          order_id: string
          event_id: string
          brand_id: string
          email: string
          amount_discount_cents: number
          status?: 'held' | 'consumed' | 'released'
          breakdown?: Json
        }
        Update: { status?: 'held' | 'consumed' | 'released' }
        Relationships: []
      }
      ticket_type_price_phases: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          name: string | null
          price_cents: number
          sort_order: number
          starts_at: string | null
          ticket_type_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string | null
          price_cents: number
          sort_order?: number
          starts_at?: string | null
          ticket_type_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          name?: string | null
          price_cents?: number
          sort_order?: number
          starts_at?: string | null
          ticket_type_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_type_price_phases_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_types: {
        Row: {
          capacity: number
          color_hex: string | null
          created_at: string
          description: string | null
          event_id: string
          id: string
          is_active: boolean
          is_unlimited: boolean
          max_scans: number | null
          name: string
          perks: Json
          price_cents: number
          reserved: number
          sold: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          capacity: number
          color_hex?: string | null
          created_at?: string
          description?: string | null
          event_id: string
          id?: string
          is_active?: boolean
          is_unlimited?: boolean
          max_scans?: number | null
          name: string
          perks?: Json
          price_cents: number
          reserved?: number
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          capacity?: number
          color_hex?: string | null
          created_at?: string
          description?: string | null
          event_id?: string
          id?: string
          is_active?: boolean
          is_unlimited?: boolean
          max_scans?: number | null
          name?: string
          perks?: Json
          price_cents?: number
          reserved?: number
          sold?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          attendee_name: string | null
          brand_id: string
          created_at: string
          event_id: string
          id: string
          invalidated_at: string | null
          max_scans: number | null
          order_id: string
          qr_code: string
          scan_count: number
          ticket_number: string
          ticket_type_id: string
          ticket_type_name: string
          validated_at: string | null
          validated_by: string | null
          validated_offline: boolean
        }
        Insert: {
          attendee_name?: string | null
          brand_id: string
          created_at?: string
          event_id: string
          id?: string
          invalidated_at?: string | null
          max_scans?: number | null
          order_id: string
          qr_code?: string
          scan_count?: number
          ticket_number: string
          ticket_type_id: string
          ticket_type_name: string
          validated_at?: string | null
          validated_by?: string | null
          validated_offline?: boolean
        }
        Update: {
          attendee_name?: string | null
          brand_id?: string
          created_at?: string
          event_id?: string
          id?: string
          invalidated_at?: string | null
          max_scans?: number | null
          order_id?: string
          qr_code?: string
          scan_count?: number
          ticket_number?: string
          ticket_type_id?: string
          ticket_type_name?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_offline?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tickets_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_ticket_type_id_fkey"
            columns: ["ticket_type_id"]
            isOneToOne: false
            referencedRelation: "ticket_types"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          display_name: string | null
          is_super_admin: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          is_super_admin?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          is_super_admin?: boolean
          user_id?: string
        }
        Relationships: []
      }
      validator_codes: {
        Row: {
          brand_id: string
          code: string
          created_at: string
          created_by: string | null
          device_label: string | null
          expires_at: string
          id: string
          max_uses: number
          use_count: number
          used_at: string | null
          user_id: string
        }
        Insert: {
          brand_id: string
          code: string
          created_at?: string
          created_by?: string | null
          device_label?: string | null
          expires_at: string
          id?: string
          max_uses?: number
          use_count?: number
          used_at?: string | null
          user_id: string
        }
        Update: {
          brand_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          device_label?: string | null
          expires_at?: string
          id?: string
          max_uses?: number
          use_count?: number
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "validator_codes_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      yape_proofs: {
        Row: {
          amount_cents: number
          brand_id: string
          created_at: string
          id: string
          operation_number: string
          order_id: string
          payer_name: string
          receipt_url: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          security_code: string
          status: Database["public"]["Enums"]["yape_proof_status"]
        }
        Insert: {
          amount_cents: number
          brand_id: string
          created_at?: string
          id?: string
          operation_number: string
          order_id: string
          payer_name: string
          receipt_url: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          security_code: string
          status?: Database["public"]["Enums"]["yape_proof_status"]
        }
        Update: {
          amount_cents?: number
          brand_id?: string
          created_at?: string
          id?: string
          operation_number?: string
          order_id?: string
          payer_name?: string
          receipt_url?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          security_code?: string
          status?: Database["public"]["Enums"]["yape_proof_status"]
        }
        Relationships: [
          {
            foreignKeyName: "yape_proofs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yape_proofs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      attach_reservation_to_order: {
        Args: { p_order_id: string; p_session_id: string }
        Returns: number
      }
      cleanup_expired_reservations: { Args: never; Returns: number }
      create_or_refresh_stock_reservation: {
        Args: {
          p_quantity: number
          p_session_id: string
          p_ticket_type_id: string
        }
        Returns: string
      }
      get_available_stock: {
        Args: { p_ticket_type_id: string }
        Returns: number
      }
      get_brand_mp_credentials: {
        Args: { p_brand_id: string; p_encryption_key: string }
        Returns: {
          access_token: string
          public_key: string
        }[]
      }
      get_event_active_prices: {
        Args: { p_event_id: string }
        Returns: {
          ticket_type_id: string
          active_price_cents: number
          next_price_cents: number | null
          next_starts_at: string | null
        }[]
      }
      consume_event_balance: {
        Args: { p_brand_id: string; p_actor_user_id: string; p_event: Json }
        Returns: string
      }
      create_brand_event: {
        Args: {
          p_brand_id: string
          p_actor_user_id: string
          p_event: Json
          p_ticket_types: Json
        }
        Returns: string
      }
      load_event_pack: {
        Args: {
          p_brand_id: string
          p_pack: number
          p_added: number
          p_price_soles: number
          p_actor_user_id: string
        }
        Returns: number
      }
      generate_validator_code: {
        Args: {
          p_brand_id: string
          p_user_id: string
          p_device_label: string
          p_created_by: string
          p_ttl_minutes?: number
          p_max_uses?: number
        }
        Returns: Json
      }
      redeem_validator_code: { Args: { p_code: string }; Returns: Json }
      revoke_validator_code: { Args: { p_id: string; p_brand_id: string }; Returns: boolean }
      check_and_record_auth_attempt: {
        Args: {
          p_kind: string
          p_identifier: string | null
          p_ip: string
          p_max_per_id?: number
          p_max_per_ip?: number
          p_window_minutes?: number
        }
        Returns: Json
      }
      clear_auth_attempts: { Args: { p_kind: string; p_identifier: string }; Returns: undefined }
      preview_promo: {
        Args: { p_event_id: string; p_code: string; p_email: string; p_items: Json }
        Returns: Json
      }
      apply_promo_to_order: {
        Args: { p_order_id: string; p_event_id: string; p_code: string; p_email: string; p_items: Json }
        Returns: Json
      }
      mark_promo_redemption_consumed: { Args: { p_order_id: string }; Returns: undefined }
      release_promo_redemption_for_order: { Args: { p_order_id: string }; Returns: undefined }
      create_promo_code: {
        Args: {
          p_event_id: string
          p_brand_id: string
          p_code: string
          p_label: string
          p_discount_type: 'percent' | 'fixed' | 'free'
          p_discount_value: number
          p_max_uses: number | null
          p_per_email_limit: number
          p_applies_to_all: boolean
          p_ticket_type_ids: string[] | null
          p_expires_at: string | null
          p_created_by: string
        }
        Returns: string
      }
      is_super_admin: { Args: never; Returns: boolean }
      recompute_ticket_type_sold: {
        Args: { p_ticket_type_id: string }
        Returns: undefined
      }
      release_stock_reservations_for_order: {
        Args: { p_order_id: string }
        Returns: number
      }
      set_brand_mp_credentials: {
        Args: {
          p_access_token: string
          p_brand_id: string
          p_encryption_key: string
          p_public_key: string
        }
        Returns: undefined
      }
      user_brands: {
        Args: { p_role?: Database["public"]["Enums"]["user_role"] }
        Returns: string[]
      }
      validate_ticket: {
        Args: {
          p_qr_code: string
          p_validator_user_id: string
          p_offline?: boolean
          p_scanned_at?: string | null
          p_device_id?: string | null
          p_client_scan_id?: string | null
        }
        Returns: Json
      }
      user_is_brand_member: {
        Args: {
          p_brand_id: string
          p_role?: Database["public"]["Enums"]["user_role"]
        }
        Returns: boolean
      }
    }
    Enums: {
      order_status:
        | "pending_payment"
        | "pending_yape_review"
        | "paid"
        | "failed"
        | "refunded"
        | "expired"
      payment_method: "mercadopago" | "yape_manual"
      user_role: "super_admin" | "brand_admin" | "validator"
      yape_proof_status: "pending_review" | "approved" | "rejected"
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
      order_status: [
        "pending_payment",
        "pending_yape_review",
        "paid",
        "failed",
        "refunded",
        "expired",
      ],
      payment_method: ["mercadopago", "yape_manual"],
      user_role: ["super_admin", "brand_admin", "validator"],
      yape_proof_status: ["pending_review", "approved", "rejected"],
    },
  },
} as const
