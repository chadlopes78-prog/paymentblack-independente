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
      app_config: {
        Row: {
          created_at: string | null
          description: string | null
          key: string
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          key: string
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      checkouts: {
        Row: {
          banner_url: string | null
          button_text: string | null
          created_at: string
          footer_text: string | null
          form_fields: Json | null
          guarantee_text: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          product_id: string
          subtitle: string | null
          testimonials: Json | null
          title: string | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          banner_url?: string | null
          button_text?: string | null
          created_at?: string
          footer_text?: string | null
          form_fields?: Json | null
          guarantee_text?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          product_id: string
          subtitle?: string | null
          testimonials?: Json | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          banner_url?: string | null
          button_text?: string | null
          created_at?: string
          footer_text?: string | null
          form_fields?: Json | null
          guarantee_text?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          product_id?: string
          subtitle?: string | null
          testimonials?: Json | null
          title?: string | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checkouts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          merchant_id: string
          name: string | null
          phone: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          merchant_id: string
          name?: string | null
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          merchant_id?: string
          name?: string | null
          phone?: string | null
        }
        Relationships: []
      }
      marketing_alerts: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications_log: {
        Row: {
          body: string
          created_at: string
          id: string
          metadata: Json | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount: number
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id: string
          merchant_id: string
          metadata: Json | null
          payment_method: string | null
          product_id: string
          status: string | null
          traffic_page_id: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone: string
          id?: string
          merchant_id: string
          metadata?: Json | null
          payment_method?: string | null
          product_id: string
          status?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string
          id?: string
          merchant_id?: string
          metadata?: Json | null
          payment_method?: string | null
          product_id?: string
          status?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_traffic_page_id_fkey"
            columns: ["traffic_page_id"]
            isOneToOne: false
            referencedRelation: "traffic_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      pixel_configs: {
        Row: {
          created_at: string
          fb_access_token: string | null
          fb_pixel_id: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fb_access_token?: string | null
          fb_pixel_id?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fb_access_token?: string | null
          fb_pixel_id?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          id: string
          is_registrations_open: boolean | null
          transaction_fee_percentage: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          is_registrations_open?: boolean | null
          transaction_fee_percentage?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          is_registrations_open?: boolean | null
          transaction_fee_percentage?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          access_link: string | null
          bump_button_text: string | null
          bump_description: string | null
          bump_enabled: boolean
          bump_highlight_color: string | null
          bump_image_url: string | null
          bump_price: number | null
          bump_title: string | null
          category: string | null
          checkout_banner_url: string | null
          created_at: string
          custom_url: string | null
          delivery_file_url: string | null
          delivery_link: string | null
          delivery_type: string | null
          description: string | null
          facebook_access_token: string | null
          facebook_pixel_id: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          status: string | null
          support_number: string | null
          support_phone: string | null
          thank_you_button_text: string | null
          thank_you_url: string | null
          updated_at: string
          user_id: string
          warranty_days: number | null
        }
        Insert: {
          access_link?: string | null
          bump_button_text?: string | null
          bump_description?: string | null
          bump_enabled?: boolean
          bump_highlight_color?: string | null
          bump_image_url?: string | null
          bump_price?: number | null
          bump_title?: string | null
          category?: string | null
          checkout_banner_url?: string | null
          created_at?: string
          custom_url?: string | null
          delivery_file_url?: string | null
          delivery_link?: string | null
          delivery_type?: string | null
          description?: string | null
          facebook_access_token?: string | null
          facebook_pixel_id?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          status?: string | null
          support_number?: string | null
          support_phone?: string | null
          thank_you_button_text?: string | null
          thank_you_url?: string | null
          updated_at?: string
          user_id: string
          warranty_days?: number | null
        }
        Update: {
          access_link?: string | null
          bump_button_text?: string | null
          bump_description?: string | null
          bump_enabled?: boolean
          bump_highlight_color?: string | null
          bump_image_url?: string | null
          bump_price?: number | null
          bump_title?: string | null
          category?: string | null
          checkout_banner_url?: string | null
          created_at?: string
          custom_url?: string | null
          delivery_file_url?: string | null
          delivery_link?: string | null
          delivery_type?: string | null
          description?: string | null
          facebook_access_token?: string | null
          facebook_pixel_id?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          status?: string | null
          support_number?: string | null
          support_phone?: string | null
          thank_you_button_text?: string | null
          thank_you_url?: string | null
          updated_at?: string
          user_id?: string
          warranty_days?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          last_login: string | null
          payout_emola: string | null
          payout_method: string | null
          payout_mpesa: string | null
          payout_number: string | null
          pushcut_enabled: boolean
          pushcut_template: string
          pushcut_url: string | null
          role: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          last_login?: string | null
          payout_emola?: string | null
          payout_method?: string | null
          payout_mpesa?: string | null
          payout_number?: string | null
          pushcut_enabled?: boolean
          pushcut_template?: string
          pushcut_url?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          last_login?: string | null
          payout_emola?: string | null
          payout_method?: string | null
          payout_mpesa?: string | null
          payout_number?: string | null
          pushcut_enabled?: boolean
          pushcut_template?: string
          pushcut_url?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          metadata: Json | null
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          metadata?: Json | null
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          metadata?: Json | null
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pushcut_logs: {
        Row: {
          created_at: string
          id: string
          metadata: Json
          order_id: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string | null
          webhook_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          metadata?: Json
          order_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          webhook_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          metadata?: Json
          order_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pushcut_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_attempts: {
        Row: {
          customer_phone: string
          id: string
          product_id: string | null
          sent_at: string
          user_id: string
        }
        Insert: {
          customer_phone: string
          id?: string
          product_id?: string | null
          sent_at?: string
          user_id: string
        }
        Update: {
          customer_phone?: string
          id?: string
          product_id?: string | null
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_attempts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          amount: number
          bump_accepted: boolean
          bump_amount: number | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          payment_confirmed_at: string | null
          payment_failed_at: string | null
          payment_method: string | null
          payment_reference: string | null
          product_id: string | null
          status: string | null
          status_reason: string | null
          traffic_page_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          bump_accepted?: boolean
          bump_amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          payment_confirmed_at?: string | null
          payment_failed_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          product_id?: string | null
          status?: string | null
          status_reason?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          bump_accepted?: boolean
          bump_amount?: number | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          payment_confirmed_at?: string | null
          payment_failed_at?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          product_id?: string | null
          status?: string | null
          status_reason?: string | null
          traffic_page_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_traffic_page_id_fkey"
            columns: ["traffic_page_id"]
            isOneToOne: false
            referencedRelation: "traffic_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_events: {
        Row: {
          ad_id: string | null
          campaign_id: string | null
          created_at: string
          event_type: string
          id: string
          medium: string | null
          metadata: Json | null
          page_id: string
          source: string | null
        }
        Insert: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          medium?: string | null
          metadata?: Json | null
          page_id: string
          source?: string | null
        }
        Update: {
          ad_id?: string | null
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          medium?: string | null
          metadata?: Json | null
          page_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "traffic_events_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "traffic_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      traffic_pages: {
        Row: {
          created_at: string
          id: string
          name: string
          tracking_id: string
          type: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          tracking_id?: string
          type?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          tracking_id?: string
          type?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string | null
          error: string | null
          event: string
          id: string
          next_attempt_at: string
          payload: Json
          response_body: string | null
          response_code: number | null
          status: string
          updated_at: string
          user_id: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          event: string
          id?: string
          next_attempt_at?: string
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          updated_at?: string
          user_id: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string | null
          error?: string | null
          event?: string
          id?: string
          next_attempt_at?: string
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          active: boolean
          created_at: string
          events: string[]
          id: string
          is_pushcut: boolean
          name: string
          product_ids: string[]
          secret: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          is_pushcut?: boolean
          name: string
          product_ids?: string[]
          secret?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          events?: string[]
          id?: string
          is_pushcut?: boolean
          name?: string
          product_ids?: string[]
          secret?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      funnel_stats: {
        Row: {
          checkout_initiations: number | null
          product_views: number | null
          total_purchases: number | null
          total_visitors: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      clean_invalid_sales: { Args: never; Returns: Json }
      get_dashboard_metrics: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_payment_failure_summary: {
        Args: { _since: string; _user_id: string }
        Returns: {
          failure_count: number
          payment_method: string
          status_reason: string
          total_amount: number
        }[]
      }
      is_product_publicly_visible: {
        Args: { _product_id: string }
        Returns: boolean
      }
      wipe_all_sales: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
