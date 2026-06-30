import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  FileText, 
  Trash2, 
  ExternalLink, 
  Download,
  Settings,
  Database
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_dashboard/files")({
  component: FilesManagementPage,
});

function FilesManagementPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProductsWithFiles = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", user.id)
      .neq("delivery_type", "none");

    if (error) {
      toast.error("Erro ao buscar arquivos");
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProductsWithFiles();
  }, []);

  const handleDeleteFile = async (productId: string) => {
    if (!confirm("Tem certeza que deseja remover o arquivo de entrega deste produto?")) return;

    try {
      const { error } = await supabase
        .from("products")
        .update({ delivery_file_url: null, delivery_type: products.find(p => p.id === productId).delivery_type === 'both' ? 'link' : 'none' })
        .eq("id", productId);

      if (error) throw error;

      toast.success("Arquivo removido com sucesso");
      fetchProductsWithFiles();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Gestão de Arquivos</h1>
        <p className="text-sm md:text-base text-muted-foreground">Gerencie a entrega digital dos seus produtos.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Produtos Digitais</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo de Entrega</TableHead>
              <TableHead>Arquivo / Link</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8">Carregando...</TableCell>
              </TableRow>
            ) : products.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Nenhum produto com entrega digital configurada.
                </TableCell>
              </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="capitalize">{product.delivery_type}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {product.delivery_file_url && (
                        <span className="text-xs flex items-center gap-1 text-blue-600">
                          <FileText className="h-3 w-3" /> Arquivo anexado
                        </span>
                      )}
                      {product.delivery_link && (
                        <span className="text-xs flex items-center gap-1 text-indigo-600">
                          <ExternalLink className="h-3 w-3" /> {product.delivery_link}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button variant="ghost" size="icon" title="Editar no Produto" asChild>
                        <a href="/products">
                          <Settings className="h-4 w-4" />
                        </a>
                      </Button>
                      {product.delivery_file_url && (
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteFile(product.id)} className="text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
