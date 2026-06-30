import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { subscribeToPushNotifications } from "../lib/push-notifications";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "../components/ui/sonner";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { ThemeProvider } from "../components/ThemeProvider";

const themeInitScript = `(function(){try{var t=localStorage.getItem('pb-theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}document.documentElement.style.colorScheme=t;}catch(e){}})();`;

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Paymentblack Mozambique | Plataforma de Pagamentos" },
      { name: "description", content: "A plataforma de pagamentos e checkout mais completa para Moçambique. Aceite M-Pesa e e-Mola." },

      { name: "author", content: "Paymentblack" },
      { property: "og:title", content: "Paymentblack Mozambique | Plataforma de Pagamentos" },
      { property: "og:description", content: "A plataforma de pagamentos e checkout mais completa para Moçambique. Aceite M-Pesa e e-Mola." },


      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Paymentblack Mozambique | Plataforma de Pagamentos" },
      { name: "twitter:description", content: "A plataforma de pagamentos e checkout mais completa para Moçambique. Aceite M-Pesa e e-Mola." },

      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4f30b18f-4006-44c5-aa69-aa14f7bc9f00/id-preview-0f09bcce--4fb7a44a-76ae-40f5-b7af-384c8a31cb3b.lovable.app-1780562490496.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/4f30b18f-4006-44c5-aa69-aa14f7bc9f00/id-preview-0f09bcce--4fb7a44a-76ae-40f5-b7af-384c8a31cb3b.lovable.app-1780562490496.png" },
    ],
    links: [
      { rel: "preconnect", href: "https://thgruqixqfrxfckjlphb.supabase.co" },
      { rel: "preconnect", href: "https://connect.facebook.net" },


      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "icon",
        type: "image/png",
        href: "/favicon.ico",
      },
      {
        rel: "apple-touch-icon",
        href: "/logo-192.png",
      },

    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Register Service Worker for PWA
    if ("serviceWorker" in navigator) {
      const registerSW = () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("[SW] Registrado com sucesso:", registration.scope);
            
            // Try to auto-subscribe if permission is already granted.
            // Guard: Safari iOS (non-PWA) e WebViews antigos não expõem `Notification`.
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              subscribeToPushNotifications(true).catch(() => {});
            }
          })
          .catch((err) => {
            console.error("[SW] Falha no registro:", err);
          });
      };

      if (document.readyState === "complete") {
        registerSW();
      } else {
        window.addEventListener("load", registerSW);
        return () => window.removeEventListener("load", registerSW);
      }
    }
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster position="top-center" richColors closeButton />
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
