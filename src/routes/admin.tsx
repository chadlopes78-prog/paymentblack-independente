import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  Users, 
  UserCheck, 
  UserPlus, 
  UserX, 
  Search,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Ban,
  Shield,
  LayoutDashboard,
  Clock,
  Mail,
  Filter,
  AlertTriangle,
  RefreshCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isAdminEmail, ADMIN_EMAILS } from "@/lib/admins";

const adminLabel = (email?: string | null) => {
  if (!email) return null;
  if (email.toLowerCase() === ADMIN_EMAILS[0]) return "Administrador Principal";
  if (email.toLowerCase() === ADMIN_EMAILS[1]) return "Administrador Secundário";
  return null;
};

export const Route = createFileRoute("/admin")({
  component: AdminControlCenter,
});

function AdminControlCenter() {
  const [users, setUsers] = useState<any[] | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    banned: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const PAGE_SIZE = 20;

  useEffect(() => {
    checkAdmin();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const checkAdmin = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }

      // Bypass for primary admins
      if (isAdminEmail(session.user.email)) {
        return;
      }

      // Fallback: check profile role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.role !== 'admin') {
        navigate({ to: "/dashboard" });
        toast.error("Acesso negado.");
      }
    } catch (error) {
      console.error("Admin check error:", error);
      navigate({ to: "/auth" });
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch stats using count for better performance and to avoid loading all data
      const [totalCount, pendingCount, approvedCount, bannedCount] = await Promise.all([
        supabase.from("profiles").select("*", { count: 'exact', head: true }),
        supabase.from("profiles").select("*", { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from("profiles").select("*", { count: 'exact', head: true }).eq('status', 'approved'),
        supabase.from("profiles").select("*", { count: 'exact', head: true }).eq('status', 'banned'),
      ]);
      
      setStats({
        total: totalCount.count || 0,
        pending: pendingCount.count || 0,
        approved: approvedCount.count || 0,
        banned: bannedCount.count || 0
      });

      // Fetch paginated users
      let query = supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
      }

      const { data, error: queryError } = await query;
      
      if (queryError) {
        if (queryError.message.includes("infinite recursion")) {
          throw new Error("Erro de segurança no banco de dados. Contate o suporte.");
        }
        throw queryError;
      }
      
      setUsers(data || []);
    } catch (err: any) {
      console.error("Fetch error:", err);
      setError(err.message || "Erro desconhecido ao carregar usuários");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (userId: string, status: string, targetEmail?: string | null) => {
    if (isAdminEmail(targetEmail)) {
      toast.error("Administradores não podem ser alterados.");
      return;
    }
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq("id", userId);
      
      if (error) throw error;
      
      toast.success(`Usuário ${status} com sucesso.`);
      
      // Update local state for immediate feedback
      if (users) {
        setUsers(users.map(u => u.id === userId ? { ...u, status } : u));
      }
      
      // Recalculate stats locally to avoid extra query
      fetchUsers(); 
    } catch (error: any) {
      toast.error("Erro na operação: " + error.message);
    }
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4 p-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full max-w-[250px]" />
            <Skeleton className="h-4 w-full max-w-[200px]" />
          </div>
        </div>
      ))}
    </div>
  );

  const ErrorState = ({ message }: { message: string }) => (
    <div className="p-10 text-center space-y-4">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 mb-2">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h3 className="text-xl font-bold text-slate-900">Falha ao carregar dados</h3>
      <p className="text-slate-500 max-w-md mx-auto">{message}</p>
      <Button onClick={fetchUsers} variant="outline" className="mt-4">
        <RefreshCcw className="mr-2 h-4 w-4" />
        Tentar Novamente
      </Button>
    </div>
  );

  const EmptyState = () => (
    <div className="p-20 text-center">
      <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-slate-50 text-slate-400 mb-4">
        <Search className="h-8 w-8" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">Nenhum utilizador encontrado</h3>
      <p className="text-slate-500">Ajuste seus filtros ou tente uma busca diferente.</p>
    </div>
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 border-emerald-200 font-medium">Aprovado</Badge>;
      case 'pending': return <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-amber-200 font-medium">Pendente</Badge>;
      case 'banned': return <Badge className="bg-red-50 text-red-700 hover:bg-red-50 border-red-200 font-medium">Banido</Badge>;
      case 'rejected': return <Badge className="bg-slate-50 text-slate-700 hover:bg-slate-50 border-slate-200 font-medium">Rejeitado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] p-4 md:p-10">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header - Clean Stripe Style */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-primary font-bold text-sm tracking-tight uppercase">
              <Shield className="h-4 w-4" />
              Control Center
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
              Gestão de Acessos
            </h1>
            <p className="text-slate-500 font-medium">Controle total sobre a base de usuários da PaymentBlack.</p>
          </div>
          
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Button variant="outline" className="bg-white border-slate-200 text-slate-600 font-bold hover:bg-slate-50 shadow-sm h-11 px-6 rounded-xl transition-all active:scale-95">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Painel Operacional
              </Button>
            </Link>
          </div>
        </div>

        {/* Metric Cards - Premium Style */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: "Total de Usuários", value: stats.total, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Aguardando Aprovação", value: stats.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Contas Ativas", value: stats.approved, icon: UserCheck, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Contas Banidas", value: stats.banned, icon: Ban, color: "text-red-600", bg: "bg-red-50" },
          ].map((stat, i) => (
            <Card key={i} className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden transition-all hover:shadow-md">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className={cn("p-2.5 rounded-xl", stat.bg)}>
                    <stat.icon className={cn("h-5 w-5", stat.color)} />
                  </div>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-1">{stat.label}</p>
                  <p className="text-3xl font-black text-slate-900 tabular-nums leading-none">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Table Area */}
        <Card className="border border-slate-100 shadow-sm bg-white rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input 
                placeholder="Pesquisar por nome ou email..." 
                className="pl-10 h-11 bg-slate-50 border-transparent focus:bg-white focus:ring-primary/20 rounded-xl font-medium transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="text-slate-500 font-bold hover:bg-slate-50 rounded-lg">
                <Filter className="mr-2 h-4 w-4" />
                Filtros
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100 h-12">
                  <TableHead className="font-bold text-slate-500 text-[12px] uppercase tracking-wider pl-6">Utilizador</TableHead>
                  <TableHead className="font-bold text-slate-500 text-[12px] uppercase tracking-wider">Status</TableHead>
                  <TableHead className="font-bold text-slate-500 text-[12px] uppercase tracking-wider">Adesão</TableHead>
                  <TableHead className="font-bold text-slate-500 text-[12px] uppercase tracking-wider">Último Login</TableHead>
                  <TableHead className="text-right font-bold text-slate-500 text-[12px] uppercase tracking-wider pr-6">Gerir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <LoadingSkeleton />
                    </TableCell>
                  </TableRow>
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <ErrorState message={error} />
                    </TableCell>
                  </TableRow>
                ) : users === null || users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <EmptyState />
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const adminRoleLabel = adminLabel(user.email);
                    const isAdminRow = !!adminRoleLabel;
                    return (
                    <TableRow key={user.id} className="hover:bg-slate-50/50 border-slate-100 transition-colors h-20">
                      <TableCell className="pl-6">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center font-black shrink-0 border",
                            isAdminRow ? "bg-primary/10 text-primary border-primary/20" : "bg-slate-100 text-slate-400 border-slate-200"
                          )}>
                            {isAdminRow ? <Shield className="h-4 w-4" /> : (user.full_name?.charAt(0) || "U")}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-900 truncate flex items-center gap-2">
                              {user.full_name || "Sem nome cadastrado"}
                              {isAdminRow && (
                                <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-primary/20 font-bold text-[10px] uppercase tracking-wider">
                                  {adminRoleLabel}
                                </Badge>
                              )}
                            </span>
                            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {user.email || "Sem email cadastrado"}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{isAdminRow ? <Badge className="bg-primary/10 text-primary hover:bg-primary/10 border-primary/20 font-medium">Administrador</Badge> : getStatusBadge(user.status)}</TableCell>
                      <TableCell className="text-sm text-slate-600 font-medium">
                        {user.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : "-"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 font-medium">
                        {user.last_login ? new Date(user.last_login).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : "Nunca acessou"}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        {isAdminRow ? (
                          <span className="text-xs font-bold text-slate-400 italic pr-2">Protegido</span>
                        ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-100">
                              <MoreVertical className="h-4 w-4 text-slate-400" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56 p-2 rounded-xl shadow-xl border-slate-100">
                            <DropdownMenuLabel className="text-[11px] uppercase tracking-widest text-slate-400 font-black px-2 pb-2">Controle de Acesso</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              disabled={user.status === 'approved'}
                              className="flex items-center gap-2 py-2.5 rounded-lg text-emerald-600 focus:text-emerald-700 focus:bg-emerald-50 cursor-pointer font-bold"
                              onClick={() => handleUpdateStatus(user.id, 'approved', user.email)}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Aprovar Acesso
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              disabled={user.status === 'rejected'}
                              className="flex items-center gap-2 py-2.5 rounded-lg text-amber-600 focus:text-amber-700 focus:bg-amber-50 cursor-pointer font-bold"
                              onClick={() => handleUpdateStatus(user.id, 'rejected', user.email)}
                            >
                              <XCircle className="h-4 w-4" />
                              Recusar Adesão
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              disabled={user.status === 'banned'}
                              className="flex items-center gap-2 py-2.5 rounded-lg text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer font-bold"
                              onClick={() => handleUpdateStatus(user.id, 'banned', user.email)}
                            >
                              <Ban className="h-4 w-4" />
                              Banir Permanentemente
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          <div className="p-6 border-t border-slate-100 flex items-center justify-between bg-white">
            <p className="text-sm font-bold text-slate-400">
              {stats.total > 0 ? `Exibindo ${users?.length || 0} de ${stats.total} registros` : "Nenhum registro encontrado"}
            </p>
            <div className="flex items-center gap-1.5">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-9 w-9 rounded-lg border-slate-200"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="px-3 h-9 flex items-center justify-center bg-slate-50 rounded-lg text-xs font-black text-slate-600">
                PÁGINA {page + 1}
              </div>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-9 w-9 rounded-lg border-slate-200"
                disabled={!users || users.length < PAGE_SIZE}
                onClick={() => setPage(p => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}