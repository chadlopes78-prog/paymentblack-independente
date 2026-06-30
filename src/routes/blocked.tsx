import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ShieldX, LogOut, MessageSquare } from "lucide-react";
import { isAdminEmail } from "@/lib/admins";

export const Route = createFileRoute("/blocked")({
  component: BlockedPage,
});

function BlockedPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkBypass = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (isAdminEmail(session?.user?.email)) {
        navigate({ to: "/admin" });
      }
    };
    checkBypass();
  }, [navigate]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600 mb-6">
          <ShieldX className="h-10 w-10" />
        </div>
        
        <div className="space-y-3">
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Acesso Restrito</h1>
          <p className="text-slate-600 leading-relaxed">
            Sua conta foi suspensa por violar nossos termos de serviço ou políticas de segurança.
          </p>
        </div>

        <div className="flex flex-col gap-3 pt-4">
          <Button 
            variant="default" 
            className="w-full bg-slate-900 hover:bg-slate-800"
            onClick={() => window.open('mailto:suporte@paymentblack.com')}
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Contatar Suporte
          </Button>
          <Button 
            variant="ghost" 
            className="w-full text-slate-500 hover:text-red-600" 
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
