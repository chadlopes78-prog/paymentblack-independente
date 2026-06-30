import { supabase } from "@/integrations/supabase/client";

export const VAPID_PUBLIC_KEY = "BETEoVdcIuhkKSgg8hOo_FMhcFPODIRW7prsctLKBjrCHHyUX3Vies5BrclXrsifs4H3-lRtJV1uBQ-HiXv4bVc";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPushNotifications(silent = false) {
  // Check browser support dynamically based on capabilities, not version strings
  const isPushSupported = "serviceWorker" in navigator && "PushManager" in window;
  const isNotificationSupported = "Notification" in window;

  if (!isPushSupported || !isNotificationSupported) {
    if (!silent) console.warn("[Push] Notificações não são suportadas pelas capacidades deste dispositivo/navegador.");
    return;
  }

  try {
    // Ensure the service worker is registered and ready
    const registration = await navigator.serviceWorker.ready;
    console.log("[Push] Service Worker pronto:", registration.scope);

    // Request permission - MUST BE TRIGGERED BY USER ACTION on iOS
    let permission = Notification.permission;
    if (permission === "default") {
      console.log("[Push] Solicitando permissão...");
      permission = await Notification.requestPermission();
    }
    
    if (permission !== "granted") {
      if (!silent) console.warn("[Push] Permissão negada para notificações.");
      return;
    }

    // Subscribe with VAPID key - Standard Web Push protocol (works on iOS 16.4+)
    console.log("[Push] Inscrevendo no Push Manager...");
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    console.log("[Push] Inscrição realizada com sucesso:", subscription.endpoint);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn("[Push] Usuário não autenticado, não salvando token.");
      return;
    }

    // Convert keys to base64
    const p256dh = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey("p256dh")!))));
    const auth = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(subscription.getKey("auth")!))));

    // Store push type metadata to handle potential forward compatibility strategies
    // We categorize it as 'web-push' which is the universal standard iOS now follows
    const pushType = "web-push";

    // Save to database
    const { error } = await supabase.from("push_subscriptions").upsert({
      user_id: session.user.id,
      endpoint: subscription.endpoint,
      p256dh,
      auth,
      updated_at: new Date().toISOString(),
      metadata: { 
        push_type: pushType,
        user_agent: navigator.userAgent,
        platform: navigator.platform
      }
    }, {
      onConflict: 'user_id,endpoint'
    });

    if (error) {
      console.error("[Push] Erro ao salvar no banco:", error);
      if (!silent) throw error;
    } else {
      console.log("[Push] Token atualizado no backend para o usuário:", session.user.id);
    }

    return subscription;
  } catch (error) {
    console.error("[Push] Falha crítica na inscrição:", error);
    if (!silent) throw error;
  }
}

export async function unsubscribeFromPushNotifications() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", user.id)
          .eq("endpoint", subscription.endpoint);
      }
      await subscription.unsubscribe();
      console.log("[Push] Inscrição removida com sucesso.");
    }
  } catch (error) {
    console.error("[Push] Erro ao remover inscrição:", error);
    throw error;
  }
}
