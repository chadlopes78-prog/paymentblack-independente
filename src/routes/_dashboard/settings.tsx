import { createFileRoute } from "@tanstack/react-router";
import { Settings, Shield, Globe, Bell, User, History, MessageSquare, PieChart, Smartphone, Lock, Trash2, AlertTriangle, Wifi } from "lucide-react";
import { DocPaymentSection, E2pPaymentSection } from "@/components/dashboard/PaymentConfigSection";
import { Switch } from "@/components/ui/switch";
import { PushNotificationManager } from "@/components/dashboard/PushNotificationManager";
import { WebhooksSection } from "@/components/dashboard/WebhooksSection";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState, useEffect } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_dashboard/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");

  const [mpesaNumber, setMpesaNumber] = useState("");
  const [emolaNumber, setEmolaNumber] = useState("");
  const [editingMpesa, setEditingMpesa] = useState(false);
  const [editingEmola, setEditingEmola] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      
      if (error && error.code !== "PGRST116") throw error;
      return { ...data, email: user.email };
    }
  });

  const savedMpesa = (profile as { payout_mpesa?: string | null } | null)?.payout_mpesa || "";
  const savedEmola = (profile as { payout_emola?: string | null } | null)?.payout_emola || "";

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name);
  }, [profile]);



  const formatSaved = (v: string) => (v.startsWith("258") ? v.slice(3) : v);

  const savePayout = async (kind: "mpesa" | "emola", raw: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Não autenticado");
    const digits = raw.replace(/\D/g, "");
    const normalized = digits.startsWith("258")
      ? digits
      : digits.length === 9
        ? `258${digits}`
        : digits;
    if (!/^258\d{9}$/.test(normalized)) {
      throw new Error("Número inválido. Use 9 dígitos (ex: 84xxxxxxx).");
    }
    const prefix = normalized.slice(3, 5);
    if (kind === "mpesa" && !["84", "85"].includes(prefix)) {
      throw new Error("Número M-Pesa deve começar com 84 ou 85.");
    }
    if (kind === "emola" && !["86", "87"].includes(prefix)) {
      throw new Error("Número e-Mola deve começar com 86 ou 87.");
    }
    const payload = kind === "mpesa" ? { payout_mpesa: normalized } : { payout_emola: normalized };
    const { data: updated, error } = await supabase
      .from("profiles")
      .update({ ...payload, updated_at: new Date().toISOString() } as never)
      .eq("id", user.id)
      .select("id, payout_mpesa, payout_emola");
    if (error) throw error;
    if (!updated || updated.length === 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("profiles")
        .insert({ id: user.id, ...payload, updated_at: new Date().toISOString() } as never)
        .select("id, payout_mpesa, payout_emola")
        .single();

      if (insertError) throw insertError;
      if (!inserted) throw new Error("Não foi possível salvar o número. Faça logout e entre novamente.");
    }
  };

  const updateMpesa = useMutation({
    mutationFn: () => savePayout("mpesa", mpesaNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Número M-Pesa salvo!");
      setEditingMpesa(false);
      setMpesaNumber("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateEmola = useMutation({
    mutationFn: () => savePayout("emola", emolaNumber),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Número e-Mola salvo!");
      setEditingEmola(false);
      setEmolaNumber("");
    },
    onError: (e: Error) => toast.error(e.message),
  });



  const updateProfile = useMutation({
    mutationFn: async (name: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          full_name: name,
          updated_at: new Date().toISOString()
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Perfil atualizado com sucesso!");
    },
    onError: (error: any) => {
      toast.error("Erro ao atualizar perfil: " + error.message);
    }
  });
  
  const resetData = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // We need to delete data associated with the user
      // Note: This assumes tables have RLS allowing deletion or user_id columns
      
      // 1. Delete sales (assuming RLS allows or we use product relationship)
      // Since we don't have a direct user_id on sales (it's via products), 
      // we first find the product IDs owned by the user.
      const { data: userProducts } = await supabase
        .from("products")
        .select("id")
        .eq("user_id", user.id);
      
      const productIds = userProducts?.map(p => p.id) || [];

      if (productIds.length > 0) {
        // Delete sales for these products
        const { error: salesError } = await supabase
          .from("sales")
          .delete()
          .in("product_id", productIds);
        
        if (salesError) throw salesError;
        
        // Delete traffic events for these products/pages
        const { data: userPages } = await supabase
          .from("traffic_pages")
          .select("id")
          .in("product_id", productIds);
        
        const pageIds = userPages?.map(p => p.id) || [];
        
        if (pageIds.length > 0) {
          const { error: eventsError } = await supabase
            .from("traffic_events")
            .delete()
            .in("page_id", pageIds);
          
          if (eventsError) throw eventsError;
        }
      }

      // 2. Delete notification logs
      const { error: notifyError } = await supabase
        .from("notifications_log")
        .delete()
        .eq("user_id", user.id);
      
      if (notifyError) throw notifyError;

      // 3. Delete marketing alerts
      const { error: alertsError } = await supabase
        .from("marketing_alerts")
        .delete()
        .eq("user_id", user.id);
      
      if (alertsError) throw alertsError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("Todos os dados foram resetados com sucesso!");
      setIsResetDialogOpen(false);
      setResetConfirmText("");
    },
    onError: (error: any) => {
      toast.error("Erro ao resetar dados: " + error.message);
    }
  });

  if (isLoading) return <div className="p-8">Carregando...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Gerencie sua conta e preferências da plataforma.</p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <CardTitle>Dados do Perfil</CardTitle>
            </div>
            <CardDescription>Atualize suas informações pessoais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full-name">Nome Completo</Label>
                <Input 
                  id="full-name" 
                  value={fullName} 
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome" 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={profile?.email || ""} disabled />
              </div>
            </div>
            <Button 
              onClick={() => updateProfile.mutate(fullName)}
              disabled={updateProfile.isPending}
            >
              {updateProfile.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>Segurança</CardTitle>
            </div>
            <CardDescription>Gerencie sua senha e autenticação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova Senha</Label>
                <Input id="new-password" type="password" placeholder="••••••••" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
                <Input id="confirm-password" type="password" placeholder="••••••••" />
              </div>
            </div>
            <Button variant="outline" className="gap-2">
              <Lock className="h-4 w-4" />
              Alterar Senha
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/5 to-transparent border-primary/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" />
              <CardTitle>Instalar App (PWA)</CardTitle>
            </div>
            <CardDescription>Use o PaymentBlack como um aplicativo nativo no seu iPhone ou Android.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-sm">
                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">1</span>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">No iPhone (iOS):</p>
                  <p className="text-muted-foreground">Abra no Safari, clique no ícone de <span className="font-bold">Compartilhar</span> e selecione <span className="font-bold">"Adicionar à Tela de Início"</span>.</p>
                </div>
              </div>
              
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white dark:bg-slate-900 border shadow-sm">
                <div className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-primary">2</span>
                </div>
                <div className="text-sm">
                  <p className="font-semibold">No Android:</p>
                  <p className="text-muted-foreground">Clique nos três pontos do navegador e selecione <span className="font-bold">"Instalar Aplicativo"</span>.</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>


        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              <CardTitle>Conta de Recebimento</CardTitle>
            </div>
            <CardDescription>
              Salve seus números M-Pesa e e-Mola. Os valores das vendas serão enviados para o número correspondente ao método escolhido pelo cliente.
              Taxa do gateway: 15% + 15 MZN por transação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Resumo dos números salvos */}
            <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
              <p className="text-sm font-semibold text-emerald-900">📌 Números ativos de recebimento</p>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-white p-3 border">
                  <p className="text-xs text-muted-foreground">M-Pesa</p>
                  {savedMpesa ? (
                    <p className="font-bold text-base">{formatSaved(savedMpesa)} <span className="text-emerald-600 text-xs">✓ salvo</span></p>
                  ) : (
                    <p className="italic text-muted-foreground">Nenhum número salvo</p>
                  )}
                </div>
                <div className="rounded-lg bg-white p-3 border">
                  <p className="text-xs text-muted-foreground">e-Mola</p>
                  {savedEmola ? (
                    <p className="font-bold text-base">{formatSaved(savedEmola)} <span className="text-emerald-600 text-xs">✓ salvo</span></p>
                  ) : (
                    <p className="italic text-muted-foreground">Nenhum número salvo</p>
                  )}
                </div>
              </div>
              <p className="text-xs text-emerald-800">Os pagamentos das vendas serão enviados para estes números.</p>
            </div>

            {/* M-Pesa */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/50">
              <Label className="font-semibold">Número M-Pesa (84 / 85)</Label>
              {savedMpesa && !editingMpesa ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">
                    Número de M-Pesa: <span className="font-bold">{formatSaved(savedMpesa)}</span> — salvo ✓
                  </p>
                  <Button size="sm" variant="outline" onClick={() => { setMpesaNumber(formatSaved(savedMpesa)); setEditingMpesa(true); }}>
                    Editar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={mpesaNumber}
                    onChange={(e) => setMpesaNumber(e.target.value)}
                    placeholder="84xxxxxxx ou 85xxxxxxx"
                  />
                  <Button onClick={() => updateMpesa.mutate()} disabled={updateMpesa.isPending}>
                    {updateMpesa.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                  {savedMpesa && (
                    <Button variant="ghost" onClick={() => { setEditingMpesa(false); setMpesaNumber(""); }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* e-Mola */}
            <div className="space-y-2 p-4 rounded-xl border bg-slate-50/50">
              <Label className="font-semibold">Número e-Mola (86 / 87)</Label>
              {savedEmola && !editingEmola ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm">
                    Número de e-Mola: <span className="font-bold">{formatSaved(savedEmola)}</span> — salvo ✓
                  </p>
                  <Button size="sm" variant="outline" onClick={() => { setEmolaNumber(formatSaved(savedEmola)); setEditingEmola(true); }}>
                    Editar
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={emolaNumber}
                    onChange={(e) => setEmolaNumber(e.target.value)}
                    placeholder="86xxxxxxx ou 87xxxxxxx"
                  />
                  <Button onClick={() => updateEmola.mutate()} disabled={updateEmola.isPending}>
                    {updateEmola.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                  {savedEmola && (
                    <Button variant="ghost" onClick={() => { setEditingEmola(false); setEmolaNumber(""); }}>
                      Cancelar
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Separator */}
            <div className="h-px bg-slate-100" />

            {/* Document-based advanced processing */}
            <DocPaymentSection />
          </CardContent>
        </Card>

        {/* ── E2Payments wallet integration ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-primary" />
              <CardTitle>Integração com Carteira (E2Payments)</CardTitle>
            </div>
            <CardDescription>
              Configure manualmente as credenciais da sua carteira E2Payments para M-Pesa e e-Mola.
              Quando ativada, substitui o processamento padrão da plataforma para os pagamentos desta conta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <E2pPaymentSection />
          </CardContent>
        </Card>

        <WebhooksSection />



        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>Integrações</CardTitle>
            </div>
            <CardDescription>Conecte outras plataformas ao seu checkout.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground italic">Em breve novas integrações disponíveis.</p>
          </CardContent>
        </Card>

        <Card className="border-red-200 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              <CardTitle className="text-red-600">Zona de Perigo</CardTitle>
            </div>
            <CardDescription>Ações irreversíveis para sua conta e dados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl border border-red-100 dark:border-red-900/20 bg-white dark:bg-slate-900">
              <div className="space-y-1">
                <p className="font-bold text-slate-900">Limpar Dados / Reiniciar Sistema</p>
                <p className="text-sm text-slate-500">
                  Apaga todas as transações, vendas, valores e gráficos. Sua conta e produtos permanecem.
                </p>
              </div>
              
              <Button
                variant="destructive"
                disabled={resetData.isPending}
                onClick={() => resetData.mutate()}
                className="font-bold uppercase tracking-wider text-xs px-6"
              >
                {resetData.isPending ? "Processando..." : "Reset Total"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const Separator = () => <div className="h-px bg-slate-100 dark:bg-slate-800 w-full" />;
