import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Package,
  Plus,
  Search,
  MoreHorizontal,
  ExternalLink,
  QrCode,
  Edit,
  Trash2,
  Copy,
  Palette,
  ImageOff,
  ShoppingBag,
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_dashboard/products")({
  component: ProductsPage,
});

function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("");
  const [supportPhone, setSupportPhone] = useState("");
  const [supportNumber, setSupportNumber] = useState("");
  const [facebookPixelId, setFacebookPixelId] = useState("");
  const [facebookAccessToken, setFacebookAccessToken] = useState("");
  const [deliveryType, setDeliveryType] = useState("none");
  const [deliveryLink, setDeliveryLink] = useState("");
  const [accessLink, setAccessLink] = useState("");
  const [thankYouButtonText, setThankYouButtonText] = useState("Liberar acesso");
  const [thankYouUrl, setThankYouUrl] = useState("");
  const [deliveryFile, setDeliveryFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string>("");
  const [bumpEnabled, setBumpEnabled] = useState(false);
  const [bumpTitle, setBumpTitle] = useState("");
  const [bumpDescription, setBumpDescription] = useState("");
  const [bumpPrice, setBumpPrice] = useState("");
  const [bumpButtonText, setBumpButtonText] = useState("Sim, quero adicionar!");
  const [bumpHighlightColor, setBumpHighlightColor] = useState("#16a34a");
  const [bumpImageFile, setBumpImageFile] = useState<File | null>(null);
  const [bumpImageUrl, setBumpImageUrl] = useState<string>("");

  const uploadProductImage = async (userId: string, file: File): Promise<string> => {
    const fileExt = file.name.split(".").pop();
    const filePath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
    const { error: upErr } = await supabase.storage
      .from("product-images")
      .upload(filePath, file, { cacheControl: "3600", upsert: false });
    if (upErr) throw upErr;
    const { data: signed, error: signErr } = await supabase.storage
      .from("product-images")
      .createSignedUrl(filePath, 60 * 60 * 24 * 365 * 10);
    if (signErr) throw signErr;
    return signed.signedUrl;
  };

  const fetchProducts = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao buscar produtos");
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thankYouUrl.trim() || !/^https?:\/\//i.test(thankYouUrl.trim())) {
      toast.error("Link da Página de Obrigado é obrigatório (deve começar com http:// ou https://)");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      let deliveryFileUrl = "";

      if (deliveryFile) {
        const fileExt = deliveryFile.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${user.id}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("product-deliverables")
          .upload(filePath, deliveryFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("product-deliverables")
          .getPublicUrl(filePath);

        deliveryFileUrl = publicUrl;
      }

      let uploadedImageUrl = "";
      if (imageFile) uploadedImageUrl = await uploadProductImage(user.id, imageFile);
      let uploadedBannerUrl = "";
      if (bannerFile) uploadedBannerUrl = await uploadProductImage(user.id, bannerFile);
      let uploadedBumpImageUrl = "";
      if (bumpImageFile) uploadedBumpImageUrl = await uploadProductImage(user.id, bumpImageFile);

      const { data, error } = await supabase
        .from("products")
        .insert({
          name,
          description,
          price: parseFloat(price),
          category,
          user_id: user.id,
          status: "active",
          facebook_pixel_id: facebookPixelId,
          facebook_access_token: facebookAccessToken,
          delivery_type: deliveryType,
          delivery_link: deliveryLink,
          delivery_file_url: deliveryFileUrl,
          access_link: accessLink || deliveryLink,
          thank_you_button_text: thankYouButtonText || "Liberar acesso",
          thank_you_url: thankYouUrl || null,
          image_url: uploadedImageUrl || null,
          checkout_banner_url: uploadedBannerUrl || null,
          bump_enabled: bumpEnabled,
          bump_title: bumpEnabled ? bumpTitle : null,
          bump_description: bumpEnabled ? bumpDescription : null,
          bump_price: bumpEnabled && bumpPrice ? parseFloat(bumpPrice) : null,
          bump_button_text: bumpEnabled ? bumpButtonText : null,
          bump_highlight_color: bumpEnabled ? bumpHighlightColor : null,
          bump_image_url: bumpEnabled ? (uploadedBumpImageUrl || null) : null,
        } as any)
        .select()
        .single();

      if (error) throw error;

      const { error: checkoutError } = await supabase.from("checkouts").insert({
        product_id: data.id,
        title: name,
        subtitle: description ? description.substring(0, 100) : "",
      });

      if (checkoutError) {
        console.error("Erro ao criar configurações de checkout:", checkoutError);
      }

      const checkoutLink = `${window.location.origin}/p/${data.id}`;
      toast.success("Produto criado com sucesso!", {
        description: "O link de checkout já está pronto para uso.",
        action: {
          label: "Copiar Link",
          onClick: () => {
            navigator.clipboard.writeText(checkoutLink);
            toast.success("Link copiado!");
          }
        }
      });
      setIsDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setCategory("");
    setSupportPhone("");
    setFacebookPixelId("");
    setFacebookAccessToken("");
    setDeliveryType("none");
    setDeliveryLink("");
    setAccessLink("");
    setThankYouButtonText("Liberar acesso");
    setThankYouUrl("");
    setDeliveryFile(null);
    setImageFile(null);
    setImageUrl("");
    setBannerFile(null);
    setBannerUrl("");
    setBumpEnabled(false);
    setBumpTitle("");
    setBumpDescription("");
    setBumpPrice("");
    setBumpButtonText("Sim, quero adicionar!");
    setBumpHighlightColor("#16a34a");
    setBumpImageFile(null);
    setBumpImageUrl("");
  };

  const handleEditProduct = (product: any) => {
    setEditingProduct(product);
    setName(product.name);
    setDescription(product.description || "");
    setPrice(product.price.toString());
    setCategory(product.category || "");
    setSupportPhone(product.support_phone || "");
    setSupportNumber(product.support_number || product.support_phone || "");
    setFacebookPixelId(product.facebook_pixel_id || "");
    setFacebookAccessToken(product.facebook_access_token || "");
    setDeliveryType(product.delivery_type || "none");
    setDeliveryLink(product.delivery_link || "");
    setAccessLink(product.access_link || "");
    setThankYouButtonText(product.thank_you_button_text || "Liberar acesso");
    setThankYouUrl(product.thank_you_url || "");
    setImageUrl(product.image_url || "");
    setImageFile(null);
    setBannerUrl(product.checkout_banner_url || "");
    setBannerFile(null);
    setBumpEnabled(!!product.bump_enabled);
    setBumpTitle(product.bump_title || "");
    setBumpDescription(product.bump_description || "");
    setBumpPrice(product.bump_price != null ? String(product.bump_price) : "");
    setBumpButtonText(product.bump_button_text || "Sim, quero adicionar!");
    setBumpHighlightColor(product.bump_highlight_color || "#16a34a");
    setBumpImageUrl(product.bump_image_url || "");
    setBumpImageFile(null);
    setIsEditDialogOpen(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!thankYouUrl.trim() || !/^https?:\/\//i.test(thankYouUrl.trim())) {
      toast.error("Link da Página de Obrigado é obrigatório (deve começar com http:// ou https://)");
      return;
    }

    try {
      let finalImageUrl = imageUrl;
      if (imageFile) finalImageUrl = await uploadProductImage(editingProduct.user_id, imageFile);
      let finalBannerUrl = bannerUrl;
      if (bannerFile) finalBannerUrl = await uploadProductImage(editingProduct.user_id, bannerFile);
      let finalBumpImageUrl = bumpImageUrl;
      if (bumpImageFile) finalBumpImageUrl = await uploadProductImage(editingProduct.user_id, bumpImageFile);

      const { error } = await supabase
        .from("products")
        .update({
          name,
          description,
          price: parseFloat(price),
          category,
          facebook_pixel_id: facebookPixelId,
          facebook_access_token: facebookAccessToken,
          delivery_type: deliveryType,
          delivery_link: deliveryLink,
          access_link: accessLink || deliveryLink,
          thank_you_button_text: thankYouButtonText || "Liberar acesso",
          thank_you_url: thankYouUrl || null,
          image_url: finalImageUrl || null,
          checkout_banner_url: finalBannerUrl || null,
          bump_enabled: bumpEnabled,
          bump_title: bumpEnabled ? bumpTitle : null,
          bump_description: bumpEnabled ? bumpDescription : null,
          bump_price: bumpEnabled && bumpPrice ? parseFloat(bumpPrice) : null,
          bump_button_text: bumpEnabled ? bumpButtonText : null,
          bump_highlight_color: bumpEnabled ? bumpHighlightColor : null,
          bump_image_url: bumpEnabled ? (finalBumpImageUrl || null) : null,
        } as any)
        .eq("id", editingProduct.id);

      if (error) throw error;

      toast.success("Produto atualizado com sucesso!");
      setIsEditDialogOpen(false);
      setEditingProduct(null);
      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;

      toast.success("Produto excluído com sucesso!");
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDuplicateProduct = async (product: any) => {
    try {
      const { id: _id, created_at: _c, updated_at: _u, custom_url: _cu, ...rest } = product;
      const payload = { ...rest, name: `${product.name} (Cópia)` };
      const { error } = await supabase.from("products").insert(payload);
      if (error) throw error;
      toast.success("Produto duplicado com sucesso!");
      fetchProducts();
    } catch (error: any) {
      toast.error(error.message ?? "Erro ao duplicar produto");
    }
  };

  const copyCheckoutLink = (productId: string) => {
    const url = `${window.location.origin}/p/${productId}`;
    navigator.clipboard.writeText(url);
    toast.success("Link de checkout copiado!");
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const ProductFormFields = ({ prefix = "" }: { prefix?: string }) => (
    <Tabs defaultValue="basic" className="w-full">
      <TabsList className="grid w-full grid-cols-5 mb-4">
        <TabsTrigger value="basic" className="text-xs">Básico</TabsTrigger>
        <TabsTrigger value="images" className="text-xs">Imagens</TabsTrigger>
        <TabsTrigger value="delivery" className="text-xs">Entrega</TabsTrigger>
        <TabsTrigger value="bump" className="text-xs">Order Bump</TabsTrigger>
        <TabsTrigger value="advanced" className="text-xs">Avançado</TabsTrigger>
      </TabsList>

      {/* Tab: Básico */}
      <TabsContent value="basic" className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}name`} className="font-semibold">Nome do Produto <span className="text-rose-500">*</span></Label>
          <p className="text-[10px] text-slate-400">Nome exibido no checkout e na lista de produtos</p>
          <Input
            id={`${prefix}name`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Curso de Marketing Digital"
            required
            className={cn(name ? "border-emerald-400" : "")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}description`} className="font-semibold">Descrição</Label>
          <p className="text-[10px] text-slate-400">Breve descrição do produto</p>
          <Textarea
            id={`${prefix}description`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva seu produto em poucas palavras..."
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${prefix}price`} className="font-semibold">Preço (MT) <span className="text-rose-500">*</span></Label>
            <Input
              id={`${prefix}price`}
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="1000"
              required
              className={cn(price ? "border-emerald-400" : "")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${prefix}category`} className="font-semibold">Categoria</Label>
            <Input
              id={`${prefix}category`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Ex: Educação"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}thank_you_button_text`} className="font-semibold">Texto do botão (pós-compra)</Label>
          <p className="text-[10px] text-slate-400">Texto do botão verde exibido após o pagamento confirmado</p>
          <Input
            id={`${prefix}thank_you_button_text`}
            value={thankYouButtonText}
            onChange={(e) => setThankYouButtonText(e.target.value)}
            placeholder="Ex: Liberar acesso, Levantar valor"
            maxLength={40}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${prefix}thank_you_url`} className="font-semibold">Link da Página de Obrigado <span className="text-rose-500">*</span></Label>
          <p className="text-[10px] text-slate-400">O cliente será redirecionado para este URL após o pagamento aprovado</p>
          <Input
            id={`${prefix}thank_you_url`}
            type="url"
            required
            value={thankYouUrl}
            onChange={(e) => setThankYouUrl(e.target.value)}
            placeholder="https://seusite.com/obrigado"
            className={cn(thankYouUrl && /^https?:\/\//i.test(thankYouUrl) ? "border-emerald-400" : thankYouUrl ? "border-rose-400" : "")}
          />
        </div>
      </TabsContent>

      {/* Tab: Imagens */}
      <TabsContent value="images" className="space-y-5">
        <div className="grid gap-3">
          <div>
            <Label className="font-semibold">Foto do Produto</Label>
            <p className="text-[10px] text-slate-400 mt-0.5">Imagem principal exibida no checkout</p>
          </div>
          <Input
            id={`${prefix}image`}
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            className="cursor-pointer"
          />
          {(imageFile || imageUrl) && (
            <div className="relative inline-block">
              <img
                src={imageFile ? URL.createObjectURL(imageFile) : imageUrl}
                alt="Preview"
                className="h-28 w-28 object-cover rounded-xl border-2 border-slate-200 shadow-sm"
              />
              <Badge className="absolute -top-2 -right-2 text-[9px] bg-emerald-500">Preview</Badge>
            </div>
          )}
        </div>
        <div className="border-t pt-4 grid gap-3">
          <div>
            <Label className="font-semibold">Banner do Checkout</Label>
            <p className="text-[10px] text-slate-400 mt-0.5">Aparece no topo do checkout. Use para oferta, garantia, bónus ou aviso.</p>
          </div>
          <Input
            id={`${prefix}banner`}
            type="file"
            accept="image/*"
            onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
            className="cursor-pointer"
          />
          {(bannerFile || bannerUrl) && (
            <div className="relative">
              <img
                src={bannerFile ? URL.createObjectURL(bannerFile) : bannerUrl}
                alt="Preview banner"
                className="w-full h-auto rounded-xl border-2 border-slate-200 shadow-sm"
              />
              <Badge className="absolute top-2 right-2 text-[9px] bg-emerald-500">Preview</Badge>
            </div>
          )}
        </div>
      </TabsContent>

      {/* Tab: Entrega */}
      <TabsContent value="delivery" className="space-y-4">
        <div className="grid gap-2">
          <Label className="font-semibold">Tipo de entrega automática</Label>
          <p className="text-[10px] text-slate-400">Além do redirecionamento, você pode enviar um arquivo ou link adicional</p>
          <select
            value={deliveryType}
            onChange={(e) => setDeliveryType(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="none">Nenhum adicional</option>
            <option value="file">Upload de Arquivo</option>
            <option value="link">Link Secundário</option>
            <option value="both">Ambos (Arquivo + Link)</option>
          </select>
        </div>
        {(deliveryType === "file" || deliveryType === "both") && (
          <div className="grid gap-2">
            <Label className="font-semibold">Arquivo de entrega</Label>
            <p className="text-[10px] text-slate-400">PDF, ZIP ou outro formato digital</p>
            <Input
              id={`${prefix}delivery_file`}
              type="file"
              onChange={(e) => setDeliveryFile(e.target.files?.[0] || null)}
              className="cursor-pointer"
            />
          </div>
        )}
        {(deliveryType === "link" || deliveryType === "both") && (
          <div className="grid gap-2">
            <Label className="font-semibold">Link de acesso</Label>
            <p className="text-[10px] text-slate-400">URL de acesso ao produto ou área de membros</p>
            <Input
              id={`${prefix}delivery_link`}
              value={deliveryLink}
              onChange={(e) => setDeliveryLink(e.target.value)}
              placeholder="https://..."
            />
          </div>
        )}
      </TabsContent>

      {/* Tab: Order Bump */}
      <TabsContent value="bump" className="space-y-4">
        <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-100">
          <div>
            <p className="font-bold text-sm text-emerald-800">Order Bump ativado</p>
            <p className="text-[10px] text-emerald-600">Oferta extra exibida no checkout</p>
          </div>
          <Switch checked={bumpEnabled} onCheckedChange={(v) => setBumpEnabled(v)} />
        </div>
        {bumpEnabled && (
          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="grid gap-2">
              <Label className="font-semibold">Título do bump</Label>
              <Input value={bumpTitle} onChange={(e) => setBumpTitle(e.target.value)} placeholder="Ex: Adicione o bónus VIP" maxLength={80} />
            </div>
            <div className="grid gap-2">
              <Label className="font-semibold">Descrição</Label>
              <Textarea value={bumpDescription} onChange={(e) => setBumpDescription(e.target.value)} placeholder="Por apenas mais X MT, leve também..." rows={2} maxLength={160} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label className="font-semibold">Preço (MT)</Label>
                <Input type="number" value={bumpPrice} onChange={(e) => setBumpPrice(e.target.value)} placeholder="200" />
              </div>
              <div className="grid gap-2">
                <Label className="font-semibold">Cor de destaque</Label>
                <div className="flex items-center gap-2">
                  <input type="color" value={bumpHighlightColor} onChange={(e) => setBumpHighlightColor(e.target.value)} className="h-9 w-12 rounded-md border border-input cursor-pointer p-1" />
                  <Input value={bumpHighlightColor} onChange={(e) => setBumpHighlightColor(e.target.value)} className="font-mono text-xs" />
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="font-semibold">Texto de chamada</Label>
              <Input value={bumpButtonText} onChange={(e) => setBumpButtonText(e.target.value)} placeholder="Sim, quero adicionar!" maxLength={40} />
            </div>
            <div className="grid gap-2">
              <Label className="font-semibold">Imagem do bump (opcional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => setBumpImageFile(e.target.files?.[0] || null)} className="cursor-pointer" />
              {(bumpImageFile || bumpImageUrl) && (
                <img src={bumpImageFile ? URL.createObjectURL(bumpImageFile) : bumpImageUrl} alt="Preview" className="h-16 w-16 object-cover rounded-lg border" />
              )}
            </div>
          </div>
        )}
      </TabsContent>

      {/* Tab: Avançado */}
      <TabsContent value="advanced" className="space-y-4">
        <div className="grid gap-2">
          <Label className="font-semibold">Facebook Pixel ID</Label>
          <p className="text-[10px] text-slate-400">Rastreamento de conversões no Facebook Ads</p>
          <Input value={facebookPixelId} onChange={(e) => setFacebookPixelId(e.target.value)} placeholder="Ex: 123456789" />
        </div>
        <div className="grid gap-2">
          <Label className="font-semibold">Facebook Access Token</Label>
          <p className="text-[10px] text-slate-400">Token para Conversions API (opcional)</p>
          <Input value={facebookAccessToken} onChange={(e) => setFacebookAccessToken(e.target.value)} placeholder="EAAB..." />
        </div>
        <div className="grid gap-2">
          <Label className="font-semibold">Suporte (Telefone/WhatsApp)</Label>
          <Input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} placeholder="+258 84 000 0000" />
        </div>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900">Produtos</h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">Gerencie seus produtos digitais e físicos.</p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl px-5 shadow-lg w-full sm:w-auto">
              <Plus className="h-4 w-4" /> Novo Produto
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto">
            <form onSubmit={handleCreateProduct}>
              <DialogHeader className="pb-4">
                <DialogTitle className="text-xl font-black">Criar Novo Produto</DialogTitle>
                <DialogDescription className="text-sm">
                  Preencha as informações do produto organizado por seções.
                </DialogDescription>
              </DialogHeader>
              <ProductFormFields prefix="create-" />
              <DialogFooter className="mt-6 flex-col sm:flex-row gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); resetForm(); }}>Cancelar</Button>
                <Button type="submit" className="bg-slate-900 hover:bg-slate-800 font-bold">Criar Produto</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) { resetForm(); setEditingProduct(null); } }}>
          <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto">
            <form onSubmit={handleUpdateProduct}>
              <DialogHeader className="pb-4">
                <DialogTitle className="text-xl font-black">Editar Produto</DialogTitle>
                <DialogDescription>Atualize as informações do produto.</DialogDescription>
              </DialogHeader>
              <ProductFormFields prefix="edit-" />
              <DialogFooter className="mt-6 flex-col sm:flex-row gap-2 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => { setIsEditDialogOpen(false); resetForm(); setEditingProduct(null); }}>Cancelar</Button>
                <Button type="submit" className="bg-slate-900 hover:bg-slate-800 font-bold">Salvar Alterações</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar produtos..."
          className="pl-9 rounded-xl border-slate-200 bg-white shadow-sm"
        />
      </div>

      {/* Products list */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-3xl bg-slate-100 flex items-center justify-center mb-4">
            <ShoppingBag className="h-10 w-10 text-slate-300" />
          </div>
          <h3 className="font-black text-slate-900 text-lg">
            {searchQuery ? "Nenhum produto encontrado" : "Ainda sem produtos"}
          </h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm">
            {searchQuery
              ? `Nenhum produto corresponde a "${searchQuery}"`
              : "Crie seu primeiro produto digital para começar a vender."}
          </p>
          {!searchQuery && (
            <Button
              className="mt-6 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl"
              onClick={() => setIsDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" /> Criar primeiro produto
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile: Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:hidden gap-4">
            {filteredProducts.map((product) => (
              <div key={product.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="flex items-start gap-3 p-4">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} className="h-14 w-14 rounded-xl object-cover shrink-0 border border-slate-100" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                      <Package className="h-6 w-6 text-slate-300" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-black text-sm text-slate-900 truncate">{product.name}</p>
                    {product.category && <p className="text-[10px] text-slate-400 uppercase tracking-wider">{product.category}</p>}
                    <p className="font-black text-emerald-600 mt-1">{product.price.toLocaleString("pt-MZ")} MT</p>
                  </div>
                  <Badge className={cn("text-[10px] shrink-0", product.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                    {product.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
                <div className="px-4 pb-4 flex items-center gap-2 border-t border-slate-50 pt-3">
                  <Button variant="outline" size="sm" className="flex-1 h-8 text-xs rounded-lg" onClick={() => copyCheckoutLink(product.id)}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar link
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => window.open(`/p/${product.id}`, "_blank")}>
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>Ações</DropdownMenuLabel>
                      <DropdownMenuItem onClick={() => handleEditProduct(product)}>
                        <Edit className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate({ to: "/checkout-config/$productId", params: { productId: product.id } })}>
                        <Palette className="h-4 w-4 mr-2" /> Personalizar Checkout
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDuplicateProduct(product)}>
                        <Copy className="mr-2 h-4 w-4" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteProduct(product.id)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden lg:block rounded-2xl border border-slate-100 bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/50 border-b border-slate-100">
                  <TableHead className="font-black text-xs uppercase tracking-wider text-slate-500 py-3 pl-4">Produto</TableHead>
                  <TableHead className="font-black text-xs uppercase tracking-wider text-slate-500 py-3">Preço</TableHead>
                  <TableHead className="font-black text-xs uppercase tracking-wider text-slate-500 py-3">Status</TableHead>
                  <TableHead className="font-black text-xs uppercase tracking-wider text-slate-500 py-3 text-right pr-4">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map((product) => (
                  <TableRow key={product.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <TableCell className="py-4 pl-4">
                      <div className="flex items-center gap-3">
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="h-10 w-10 rounded-xl object-cover border border-slate-100 shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                            <Package className="h-4 w-4 text-slate-300" />
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-sm text-slate-900">{product.name}</p>
                          {product.category && <p className="text-[10px] text-slate-400 uppercase tracking-wide">{product.category}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-black text-sm text-slate-900">{product.price.toLocaleString("pt-MZ")} MT</span>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] font-bold", product.status === "active" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500")}>
                        {product.status === "active" ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg" onClick={() => copyCheckoutLink(product.id)}>
                          <Copy className="h-3 w-3 mr-1" /> Link
                        </Button>
                        <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" onClick={() => window.open(`/p/${product.id}`, "_blank")}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => window.open(`/p/${product.id}`, "_blank")}>
                              <ExternalLink className="mr-2 h-4 w-4" /> Ver Checkout
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleEditProduct(product)}>
                              <Edit className="mr-2 h-4 w-4" /> Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => navigate({ to: "/checkout-config/$productId", params: { productId: product.id } })}>
                              <Palette className="h-4 w-4 mr-2" /> Personalizar Checkout
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                              <QrCode className="mr-2 h-4 w-4" /> QR Code
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDuplicateProduct(product)}>
                              <Copy className="mr-2 h-4 w-4" /> Duplicar
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteProduct(product.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
