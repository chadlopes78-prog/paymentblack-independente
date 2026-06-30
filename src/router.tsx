import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 30,       // dados frescos por 30s — sem refetch desnecessário
        gcTime: 1000 * 60 * 5,      // cache em memória por 5 min
        refetchOnWindowFocus: false, // não refaz query ao alt+tab de volta
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",   // precarrega JS da rota ao passar o mouse no link
    defaultPreloadStaleTime: 0,
  });

  return router;
};
