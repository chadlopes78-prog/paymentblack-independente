import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { trackingId, eventType, url, referrer, metadata, campaignId, adId, source, medium } = await req.json()

    const ALLOWED_EVENTS = ['view', 'click', 'purchase']
    if (!trackingId || !eventType) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }
    if (!ALLOWED_EVENTS.includes(eventType)) {
      return new Response(JSON.stringify({ error: 'Invalid event type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Find the page
    const { data: page, error: pageError } = await supabase
      .from('traffic_pages')
      .select('id')
      .eq('tracking_id', trackingId)
      .single()

    if (pageError || !page) {
      return new Response(JSON.stringify({ error: 'Page not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    // Insert the event
    const { error: eventError } = await supabase
      .from('traffic_events')
      .insert([
        {
          page_id: page.id,
          event_type: eventType,
          campaign_id: campaignId,
          ad_id: adId,
          source: source,
          medium: medium,
          metadata: {
            ...metadata,
            url,
            referrer,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('remote-addr')
          }
        }
      ])

    if (eventError) throw eventError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})