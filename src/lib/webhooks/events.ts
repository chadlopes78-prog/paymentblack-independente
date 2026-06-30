// Catálogo central de eventos do sistema (compartilhado client + server).
export const WEBHOOK_EVENTS = [
  { id: "sale.created",        label: "Venda criada",         description: "Cliente iniciou uma compra." },
  { id: "payment.requested",   label: "Pagamento solicitado", description: "Sistema enviou solicitação M-Pesa/e-Mola." },
  { id: "payment.received",    label: "Pagamento recebido",   description: "Confirmação de pagamento recebida." },
  { id: "sale.approved",       label: "Venda aprovada",       description: "Venda concluída com sucesso." },
  { id: "payment.refused",     label: "Pagamento recusado",   description: "Cliente recusou ou gateway rejeitou." },
  { id: "payment.expired",     label: "Pagamento expirado",   description: "Tempo do pagamento esgotado." },
  { id: "sale.cancelled",      label: "Venda cancelada",      description: "Venda foi cancelada." },
  { id: "product.delivered",   label: "Produto entregue",     description: "Cliente recebeu acesso ao produto." },
  { id: "refund.created",      label: "Reembolso realizado",  description: "Reembolso processado." },
  { id: "customer.created",    label: "Cliente criado",       description: "Novo cliente registado." },
] as const;

export type WebhookEventId = (typeof WEBHOOK_EVENTS)[number]["id"];

export const WEBHOOK_EVENT_IDS = WEBHOOK_EVENTS.map((e) => e.id) as WebhookEventId[];
