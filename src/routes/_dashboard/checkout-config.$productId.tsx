import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowLeft,
  Timer,
  Type,
  Palette,
  Star,
  Shield,
  MessageSquare,
  HelpCircle,
  Lock,
  ShoppingCart,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/_dashboard/checkout-config/$productId")({
  component: CheckoutConfigPage,
});

interface Benefit {
  text: string;
}

interface Testimonial {
  name: string;
  text: string;
  stars: number;
}

interface FaqItem {
  question: string;
  answer: string;
}

interface CheckoutConfig {
  timerEnabled: boolean;
  timerMinutes: number;
  title: string;
  subtitle: string;
  primaryColor: string;
  benefits: Benefit[];
  guaranteeEnabled: boolean;
  guaranteeText: string;
  testimonials: Testimonial[];
  faq: FaqItem[];
  showSecurityBadges: boolean;
  buyButtonText: string;
}

const defaultConfig: CheckoutConfig = {
  timerEnabled: false,
  timerMinutes: 15,
  title: "",
  subtitle: "",
  primaryColor: "#16a34a",
  benefits: [],
  guaranteeEnabled: false,
  guaranteeText: "7 dias de garantia",
  testimonials: [],
  faq: [],
  showSecurityBadges: true,
  buyButtonText: "Comprar agora",
};

function CheckoutConfigPage() {
  const { productId } = useParams({ from: "/_dashboard/checkout-config/$productId" });
  const [config, setConfig] = useState<CheckoutConfig>(defaultConfig);
  const [productName, setProductName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: product }, { data: configData }] = await Promise.all([
        supabase.from("products").select("name").eq("id", productId).single(),
        supabase.from("checkout_configs").select("config").eq("product_id", productId).maybeSingle(),
      ]);
      if (product) setProductName(product.name);
      if (configData?.config) {
        setConfig({ ...defaultConfig, ...(configData.config as CheckoutConfig) });
      }
      setLoading(false);
    };
    load();
  }, [productId]);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("checkout_configs")
      .upsert({ product_id: productId, config: config as any }, { onConflict: "product_id" });
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar configurações");
    } else {
      toast.success("Configurações salvas com sucesso!");
    }
  };

  const updateConfig = (key: keyof CheckoutConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const addBenefit = () => updateConfig("benefits", [...config.benefits, { text: "" }]);
  const removeBenefit = (i: number) => updateConfig("benefits", config.benefits.filter((_, idx) => idx !== i));
  const updateBenefit = (i: number, text: string) => updateConfig("benefits", config.benefits.map((b, idx) => idx === i ? { text } : b));

  const addTestimonial = () => updateConfig("testimonials", [...config.testimonials, { name: "", text: "", stars: 5 }]);
  const removeTestimonial = (i: number) => updateConfig("testimonials", config.testimonials.filter((_, idx) => idx !== i));
  const updateTestimonial = (i: number, field: keyof Testimonial, value: any) =>
    updateConfig("testimonials", config.testimonials.map((t, idx) => idx === i ? { ...t, [field]: value } : t));

  const addFaq = () => updateConfig("faq", [...config.faq, { question: "", answer: "" }]);
  const removeFaq = (i: number) => updateConfig("faq", config.faq.filter((_, idx) => idx !== i));
  const updateFaq = (i: number, field: keyof FaqItem, value: string) =>
    updateConfig("faq", config.faq.map((f, idx) => idx === i ? { ...f, [field]: value } : f));

  const timerSecs = config.timerMinutes * 60;
  const timerDisplay = `${String(Math.floor(timerSecs / 60)).padStart(2, "0")}:${String(timerSecs % 60).padStart(2, "0")}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-slate-900 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24 max-w-[1200px] mx-auto px-4">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/products">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">Personalizar Checkout</h1>
          <p className="text-xs text-slate-500 font-medium">{productName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* LEFT: Settings */}
        <div className="space-y-4">
          <Accordion type="multiple" defaultValue={["timer", "texts", "color", "button"]} className="space-y-3">

            {/* Timer */}
            <AccordionItem value="timer" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-50 rounded-lg">
                    <Timer className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Cronômetro de urgência</p>
                    <p className="text-xs text-slate-400">Ativa um timer no checkout</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700">Ativar timer</Label>
                  <Switch checked={config.timerEnabled} onCheckedChange={(v) => updateConfig("timerEnabled", v)} />
                </div>
                {config.timerEnabled && (
                  <div className="grid gap-2">
                    <Label className="text-xs text-slate-500">Duração (minutos)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={config.timerMinutes}
                      onChange={(e) => updateConfig("timerMinutes", Number(e.target.value))}
                      className="max-w-[120px]"
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Texts */}
            <AccordionItem value="texts" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <Type className="h-4 w-4 text-blue-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Textos do checkout</p>
                    <p className="text-xs text-slate-400">Título e subtítulo personalizados</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-slate-700">Título</Label>
                  <Input
                    value={config.title}
                    onChange={(e) => updateConfig("title", e.target.value)}
                    placeholder="Ex: Garanta sua vaga agora"
                  />
                </div>
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-slate-700">Subtítulo</Label>
                  <Textarea
                    value={config.subtitle}
                    onChange={(e) => updateConfig("subtitle", e.target.value)}
                    placeholder="Ex: Acesso imediato + bônus exclusivos"
                    rows={2}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Primary color */}
            <AccordionItem value="color" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-50 rounded-lg">
                    <Palette className="h-4 w-4 text-purple-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Cor primária</p>
                    <p className="text-xs text-slate-400">Cor dos botões e destaques</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={config.primaryColor}
                    onChange={(e) => updateConfig("primaryColor", e.target.value)}
                    className="h-10 w-16 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <Input
                    value={config.primaryColor}
                    onChange={(e) => updateConfig("primaryColor", e.target.value)}
                    placeholder="#16a34a"
                    className="max-w-[140px] font-mono text-sm"
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Buy button text */}
            <AccordionItem value="button" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-50 rounded-lg">
                    <ShoppingCart className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Botão de compra</p>
                    <p className="text-xs text-slate-400">Texto do botão principal</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="grid gap-2">
                  <Label className="text-xs font-semibold text-slate-700">Texto do botão</Label>
                  <Input
                    value={config.buyButtonText}
                    onChange={(e) => updateConfig("buyButtonText", e.target.value)}
                    placeholder="Comprar agora"
                    maxLength={40}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>

            {/* Benefits */}
            <AccordionItem value="benefits" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-green-50 rounded-lg">
                    <Star className="h-4 w-4 text-green-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Benefícios</p>
                    <p className="text-xs text-slate-400">{config.benefits.length} item(s) configurados</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-3">
                {config.benefits.map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      value={b.text}
                      onChange={(e) => updateBenefit(i, e.target.value)}
                      placeholder={`Benefício ${i + 1}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeBenefit(i)} className="shrink-0 text-rose-500 hover:text-rose-700 hover:bg-rose-50">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addBenefit} className="w-full">
                  <Plus className="h-3 w-3 mr-1" /> Adicionar benefício
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Guarantee */}
            <AccordionItem value="guarantee" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-teal-50 rounded-lg">
                    <Shield className="h-4 w-4 text-teal-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Garantia</p>
                    <p className="text-xs text-slate-400">Texto de garantia de satisfação</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700">Mostrar garantia</Label>
                  <Switch checked={config.guaranteeEnabled} onCheckedChange={(v) => updateConfig("guaranteeEnabled", v)} />
                </div>
                {config.guaranteeEnabled && (
                  <div className="grid gap-2">
                    <Label className="text-xs text-slate-500">Texto da garantia</Label>
                    <Input
                      value={config.guaranteeText}
                      onChange={(e) => updateConfig("guaranteeText", e.target.value)}
                      placeholder="7 dias de garantia"
                    />
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>

            {/* Testimonials */}
            <AccordionItem value="testimonials" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-50 rounded-lg">
                    <MessageSquare className="h-4 w-4 text-yellow-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Depoimentos</p>
                    <p className="text-xs text-slate-400">{config.testimonials.length} depoimento(s)</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                {config.testimonials.map((t, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 p-3 space-y-2 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Depoimento {i + 1}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeTestimonial(i)} className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={t.name}
                      onChange={(e) => updateTestimonial(i, "name", e.target.value)}
                      placeholder="Nome do cliente"
                      className="bg-white"
                    />
                    <Textarea
                      value={t.text}
                      onChange={(e) => updateTestimonial(i, "text", e.target.value)}
                      placeholder="Texto do depoimento..."
                      rows={2}
                      className="bg-white"
                    />
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-slate-500">Estrelas:</Label>
                      <select
                        value={t.stars}
                        onChange={(e) => updateTestimonial(i, "stars", Number(e.target.value))}
                        className="h-8 rounded-md border border-input bg-white px-2 py-1 text-xs"
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>{n} estrela{n > 1 ? "s" : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTestimonial} className="w-full">
                  <Plus className="h-3 w-3 mr-1" /> Adicionar depoimento
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* FAQ */}
            <AccordionItem value="faq" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <HelpCircle className="h-4 w-4 text-indigo-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">FAQ</p>
                    <p className="text-xs text-slate-400">{config.faq.length} pergunta(s)</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                {config.faq.map((f, i) => (
                  <div key={i} className="rounded-xl border border-slate-100 p-3 space-y-2 bg-slate-50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500">Pergunta {i + 1}</span>
                      <Button variant="ghost" size="icon" onClick={() => removeFaq(i)} className="h-7 w-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <Input
                      value={f.question}
                      onChange={(e) => updateFaq(i, "question", e.target.value)}
                      placeholder="Pergunta..."
                      className="bg-white"
                    />
                    <Textarea
                      value={f.answer}
                      onChange={(e) => updateFaq(i, "answer", e.target.value)}
                      placeholder="Resposta..."
                      rows={2}
                      className="bg-white"
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addFaq} className="w-full">
                  <Plus className="h-3 w-3 mr-1" /> Adicionar pergunta
                </Button>
              </AccordionContent>
            </AccordionItem>

            {/* Security badges */}
            <AccordionItem value="security" className="border rounded-2xl bg-white shadow-sm px-4">
              <AccordionTrigger className="py-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg">
                    <Lock className="h-4 w-4 text-slate-500" />
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-sm text-slate-900">Selos de segurança</p>
                    <p className="text-xs text-slate-400">Ícones de confiança e segurança</p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-700">Mostrar selos</Label>
                  <Switch checked={config.showSecurityBadges} onCheckedChange={(v) => updateConfig("showSecurityBadges", v)} />
                </div>
              </AccordionContent>
            </AccordionItem>

          </Accordion>
        </div>

        {/* RIGHT: Preview */}
        <div className="lg:sticky lg:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden">
            <div className="bg-slate-900 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-rose-400" />
                <div className="h-3 w-3 rounded-full bg-yellow-400" />
                <div className="h-3 w-3 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 bg-slate-800 rounded-md h-6 flex items-center px-3">
                <span className="text-[10px] text-slate-400 truncate">checkout.paymentblack.com/p/{productId.slice(0, 8)}...</span>
              </div>
            </div>

            <div className="p-5 space-y-4 bg-gray-50 min-h-[500px]">
              {/* Timer */}
              {config.timerEnabled && (
                <div className="rounded-xl bg-slate-900 text-white text-center py-3 px-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Oferta expira em</p>
                  <p className="text-2xl font-black tabular-nums">{timerDisplay}</p>
                </div>
              )}

              {/* Title */}
              {(config.title || config.subtitle) && (
                <div className="text-center space-y-1">
                  {config.title && <h2 className="text-lg font-black text-slate-900">{config.title}</h2>}
                  {config.subtitle && <p className="text-xs text-slate-500">{config.subtitle}</p>}
                </div>
              )}

              {/* Benefits */}
              {config.benefits.length > 0 && (
                <div className="rounded-xl bg-white border border-slate-100 p-3 space-y-2">
                  {config.benefits.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                      <div className="h-4 w-4 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: config.primaryColor }}>
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                      </div>
                      <span>{b.text || `Benefício ${i + 1}`}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Payment form placeholder */}
              <div className="rounded-xl bg-white border border-slate-200 p-4 space-y-3">
                <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Dados de pagamento</p>
                <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                <div className="grid grid-cols-2 gap-2">
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                  <div className="h-8 bg-slate-100 rounded-lg animate-pulse" />
                </div>
              </div>

              {/* Buy button */}
              <button
                className="w-full py-3 rounded-xl text-white text-sm font-black uppercase tracking-wider shadow-lg transition-transform active:scale-95"
                style={{ backgroundColor: config.primaryColor }}
              >
                {config.buyButtonText || "Comprar agora"}
              </button>

              {/* Security badges */}
              {config.showSecurityBadges && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  {["SSL", "Seguro", "Criptografado"].map((label) => (
                    <div key={label} className="flex items-center gap-1 text-[9px] text-slate-400">
                      <Lock className="h-2.5 w-2.5" />
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Guarantee */}
              {config.guaranteeEnabled && config.guaranteeText && (
                <div className="flex items-center gap-2 justify-center bg-white rounded-xl p-3 border border-dashed border-emerald-200">
                  <Shield className="h-4 w-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-slate-600 font-medium">{config.guaranteeText}</p>
                </div>
              )}

              {/* Testimonials */}
              {config.testimonials.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Depoimentos</p>
                  {config.testimonials.slice(0, 2).map((t, i) => (
                    <div key={i} className="rounded-xl bg-white border border-slate-100 p-3">
                      <div className="flex items-center gap-1 mb-1">
                        {Array.from({ length: t.stars }).map((_, s) => (
                          <Star key={s} className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                      <p className="text-[11px] text-slate-600 italic">"{t.text || "Ótimo produto!"}"</p>
                      <p className="text-[10px] font-bold text-slate-400 mt-1">— {t.name || "Cliente"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 shadow-lg z-50 px-4 py-3">
        <div className="max-w-[1200px] mx-auto flex items-center justify-between gap-4">
          <Link to="/products">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Voltar para produtos
            </Button>
          </Link>
          <Button onClick={handleSave} disabled={saving} className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6">
            {saving ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Salvando...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4" /> Salvar alterações
              </div>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
