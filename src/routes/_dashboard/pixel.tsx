import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_dashboard/pixel")({
  component: PixelPage,
});

function PixelPage() {
  const [fbPixelId, setFbPixelId] = useState("");
  const [fbAccessToken, setFbAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPixelConfigs();
  }, []);

  const fetchPixelConfigs = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("pixel_configs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFbPixelId(data.fb_pixel_id || "");
        setFbAccessToken(data.fb_access_token || "");
      }
    } catch (error: any) {
      console.error("Error fetching pixel configs:", error);
      toast.error("Erro ao carregar configurações de Pixel");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existing } = await supabase
        .from("pixel_configs")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const payload = {
        user_id: user.id,
        fb_pixel_id: fbPixelId,
        fb_access_token: fbAccessToken,
      };

      if (existing) {
        const { error } = await supabase
          .from("pixel_configs")
          .update(payload)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("pixel_configs")
          .insert(payload);
        if (error) throw error;
      }

      toast.success("Configurações do Facebook Pixel salvas!");
    } catch (error: any) {
      console.error("Error saving pixel configs:", error);
      toast.error("Erro ao salvar configurações");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pixel Facebook</h1>
        <p className="text-muted-foreground">Configure o rastreio de conversões global para suas campanhas.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Facebook Pixel (Meta)</CardTitle>
            <CardDescription>
              Insira o ID do seu Pixel e o Access Token para rastrear eventos de checkout e utilizar a API de Conversões.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fb-pixel">Pixel ID</Label>
              <Input 
                id="fb-pixel" 
                placeholder="Ex: 1234567890" 
                value={fbPixelId}
                onChange={(e) => setFbPixelId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fb-token">Access Token (API de Conversões)</Label>
              <Input 
                id="fb-token" 
                placeholder="EAAB..." 
                value={fbAccessToken}
                onChange={(e) => setFbAccessToken(e.target.value)}
              />
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar Configurações
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
