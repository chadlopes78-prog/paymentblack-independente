/**
 * Admin-only API — all actions require the caller to be an admin (role='admin' in profiles).
 *
 * POST /api-admin
 * Authorization: Bearer <access_token>
 *
 * Actions:
 *   { action: "list_users",    page?, pageSize?, search?, status? }
 *   { action: "set_status",    userId, status: "approved"|"rejected"|"banned"|"pending" }
 *   { action: "stats" }
 */

import { ensureWebSocket } from "./_ws-polyfill";
import { createClient } from "@supabase/supabase-js";

ensureWebSocket();

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

const ADMIN_EMAILS = ["chadlopesff@gmail.com", "dercktuane@gmail.com", "chadlopes7@gmail.com"];

function ok(body: object) {
  return { statusCode: 200, headers: CORS, body: JSON.stringify(body) };
}
function fail(msg: string, status = 400) {
  return { statusCode: status, headers: CORS, body: JSON.stringify({ success: false, error: msg }) };
}

export const handler = async (event: any) => {
  try {
    return await handleRequest(event);
  } catch (e: any) {
    console.error("api-admin unhandled error", e);
    return fail("Erro no servidor: " + (e?.message || String(e)), 500);
  }
};

async function handleRequest(event: any) {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };
  if (event.httpMethod !== "POST") return fail("Method not allowed", 405);

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey     = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  if (!supabaseUrl || !serviceKey) return fail("Servidor não configurado.", 500);
  if (!anonKey) {
    return fail(
      "Servidor não configurado: falta a variável de ambiente SUPABASE_PUBLISHABLE_KEY no Netlify.",
      500,
    );
  }

  // ── Authenticate caller ──────────────────────────────────────────────────────
  const authHeader = event.headers?.authorization || event.headers?.Authorization || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return fail("Não autenticado.", 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error: authErr } = await userClient.auth.getUser();
  if (authErr || !user) return fail("Token inválido.", 401);

  // ── Verify admin role ────────────────────────────────────────────────────────
  const isAdminByEmail = ADMIN_EMAILS.includes((user.email || "").toLowerCase());
  if (!isAdminByEmail) {
    // Double-check via DB role column
    const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: p } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (p?.role !== "admin") return fail("Acesso negado.", 403);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let body: any;
  try { body = JSON.parse(event.body || "{}"); } catch { return fail("JSON inválido."); }

  const { action } = body;

  // ── stats ────────────────────────────────────────────────────────────────────
  if (action === "stats") {
    const { data: rows } = await db.from("profiles").select("status, created_at");
    const all = rows ?? [];
    const now = new Date();
    const d7  = new Date(now.getTime() - 7  * 86400_000).toISOString();
    const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString();

    const count = (st: string) => all.filter((r: any) => r.status === st).length;
    return ok({
      success: true,
      stats: {
        total:    all.length,
        approved: count("approved"),
        pending:  count("pending"),
        rejected: count("rejected"),
        banned:   count("banned"),
        new_7d:   all.filter((r: any) => r.created_at >= d7).length,
        new_30d:  all.filter((r: any) => r.created_at >= d30).length,
      },
    });
  }

  // ── list_users ───────────────────────────────────────────────────────────────
  if (action === "list_users") {
    const page     = Math.max(1, Number(body.page     ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(body.pageSize ?? 20)));
    const search   = (body.search  || "").trim();
    const status   = (body.status  || "").trim();
    const from     = (page - 1) * pageSize;
    const to       = from + pageSize - 1;

    // Fetch users with product + sale counts using a joined query
    let q = db
      .from("profiles")
      .select(`
        id, full_name, email, status, role, created_at, updated_at, last_login,
        products:products(count),
        sales:products(sales(count))
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) q = q.eq("status", status);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);

    const { data, count, error } = await q;
    if (error) return fail("Erro ao listar usuários: " + error.message, 500);

    // Flatten nested counts
    const users = (data ?? []).map((u: any) => ({
      id:           u.id,
      full_name:    u.full_name || "—",
      email:        u.email    || "—",
      status:       u.status   || "pending",
      role:         u.role     || "user",
      created_at:   u.created_at,
      last_login:   u.last_login,
      product_count: u.products?.[0]?.count ?? 0,
      sale_count:    0, // simplified — nested aggregate needs RPC for accuracy
    }));

    return ok({ success: true, users, total: count ?? 0, page, pageSize });
  }

  // ── set_status ───────────────────────────────────────────────────────────────
  if (action === "set_status") {
    const { userId, status: newStatus } = body;
    if (!userId) return fail("userId obrigatório.");
    const VALID = ["approved", "rejected", "banned", "pending"];
    if (!VALID.includes(newStatus)) return fail(`Status inválido. Use: ${VALID.join(", ")}`);

    // Prevent demoting another admin
    const { data: target } = await db.from("profiles").select("role, email").eq("id", userId).maybeSingle();
    if (target?.role === "admin" && !ADMIN_EMAILS.includes(user.email || "")) {
      return fail("Não é possível alterar o status de um administrador.", 403);
    }

    const { error } = await db
      .from("profiles")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", userId);

    if (error) return fail("Erro ao atualizar status: " + error.message, 500);
    return ok({ success: true, userId, status: newStatus });
  }

  return fail("Ação inválida.");
}
