import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, BellOff, Info, CreditCard, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { subscribeToPushNotifications, unsubscribeFromPushNotifications } from "@/lib/push-notifications";

export function PushNotificationManager() {
  const [isSupported, setIsSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setIsSupported(false);
      return;
    }

    setPermission(Notification.permission);
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    try {
      if (!("serviceWorker" in navigator)) return;
      
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setIsSubscribed(!!subscription);
      
      // If permission is already granted but not subscribed, try to auto-subscribe silently
      if (Notification.permission === "granted" && !subscription) {
        console.log("[Push] Permissão já concedida, tentando inscrição automática...");
        await subscribeToPushNotifications(true);
        const newSubscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!newSubscription);
      }
    } catch (error) {
      console.error("[Push] Erro ao verificar inscrição:", error);
    }
  };

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      await subscribeToPushNotifications();
      setIsSubscribed(true);
      setPermission("granted");
      toast.success("Notificações ativadas com sucesso!");
    } catch (error: any) {
      console.error("Erro ao assinar:", error);
      toast.error(error.message || "Erro ao ativar notificações");
    } finally {
      setLoading(false);
    }
  };

  const handleUnsubscribe = async () => {
    setLoading(true);
    try {
      await unsubscribeFromPushNotifications();
      setIsSubscribed(false);
      toast.info("Notificações pausadas temporariamente");
    } catch (error) {
      toast.error("Erro ao desativar notificações");
    } finally {
      setLoading(false);
    }
  };

  const testNotification = () => {
    toast.success(
      <div className="flex flex-col gap-0.5">
        <span className="font-black text-sm uppercase text-emerald-600">💰 Venda Aprovada:</span>
        <span className="text-base font-black text-slate-900 leading-tight">Pingou🎉 +350 MT</span>
      </div>,
      {
        icon: <div className="bg-black p-2 rounded-xl shadow-lg flex items-center justify-center animate-bounce"><CreditCard className="h-4 w-4 text-white" /></div>,
        duration: 5000,
      }
    );

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("💰 Venda aprovada!", {
        body: `Pingou🎉 +350 MT no Checkout`,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
      });
    }
  };

  if (!isSupported) {
    return (
      <Alert variant="destructive" className="bg-red-50 border-red-100 rounded-2xl">
        <Info className="h-4 w-4 text-red-600" />
        <AlertTitle className="font-black text-red-900 uppercase tracking-tighter">Não suportado</AlertTitle>
        <AlertDescription className="text-red-700 font-medium">
          Seu navegador não suporta notificações push. No iPhone, use o Safari e adicione o app à tela inicial.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="border-none shadow-xl bg-white dark:bg-slate-900 rounded-2xl overflow-hidden ring-1 ring-slate-100">
      <CardHeader className="bg-slate-50/50 border-b pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-black flex items-center gap-2 uppercase tracking-tighter">
              Central de Alertas
              {isSubscribed ? (
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <span className="flex h-2 w-2 rounded-full bg-slate-300" />
              )}
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase text-slate-400">
              Notificações inteligentes estilo Hotmart/Stripe.
            </CardDescription>
          </div>
          <div className={cn(
            "h-12 w-12 rounded-2xl flex items-center justify-center transition-all shadow-lg",
            isSubscribed ? "bg-emerald-500 text-white shadow-emerald-200" : "bg-black text-white shadow-slate-100"
          )}>
            {isSubscribed ? <Bell className="h-6 w-6" /> : <BellOff className="h-6 w-6" />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {permission === "denied" && (
          <Alert variant="destructive" className="bg-red-50 border-red-100 rounded-xl">
            <Info className="h-4 w-4 text-red-600" />
            <AlertTitle className="text-red-900 font-black uppercase text-xs">Acesso Bloqueado</AlertTitle>
            <AlertDescription className="text-red-700 text-[10px] font-bold">
              Você bloqueou as notificações. Reative nas configurações do navegador para receber alertas de venda.
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
              <span className="text-xs font-black uppercase text-slate-600 tracking-tight">Vendas em Tempo Real</span>
            </div>
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Ativo</span>
          </div>
          <div className="flex items-center justify-between group">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-200" />
              <span className="text-xs font-black uppercase text-slate-600 tracking-tight">Relatórios de Faturamento</span>
            </div>
            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">Ativo</span>
          </div>
        </div>

        {/* Removed "Ativar" button as per requirements - auto-activation logic in place */}
        {!isSubscribed && permission !== "denied" && (
          <Button 
            className="w-full gap-3 h-14 rounded-2xl font-black uppercase tracking-widest shadow-2xl shadow-primary/20 bg-black text-white hover:bg-slate-900" 
            onClick={handleSubscribe}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Bell className="h-5 w-5" />}
            Sincronizar Alertas Agora
          </Button>
        )}

        {isSubscribed && (
          <Button 
            variant="ghost" 
            className="w-full gap-2 text-slate-400 hover:text-red-600 text-[10px] font-black uppercase tracking-widest" 
            onClick={handleUnsubscribe}
            disabled={loading}
          >
            <BellOff className="h-3 w-3" />
            Pausar Alertas Temporariamente
          </Button>
        )}

        <div className="pt-2 space-y-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full text-[10px] font-black uppercase tracking-widest h-10 rounded-xl border-dashed"
            onClick={testNotification}
          >
            Testar Som de Venda 💰
          </Button>
          
          {!isSubscribed && (
            <p className="text-[8px] text-center text-rose-500 font-bold uppercase px-4">
              ⚠️ Se estiver no iPhone, use o Safari e adicione à Tela de Início antes de ativar.
            </p>
          )}
        </div>

        <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest">
          Sincronização 100% Automática & Segura
        </p>
      </CardContent>
    </Card>
  );
}

const cn = (...classes: any[]) => classes.filter(Boolean).join(" ");
