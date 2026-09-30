// LEVEL-UP payments: the only place that talks to Mollie.
// Deploy as the Supabase Edge Function "payments" with JWT verification OFF
// (Mollie's webhook has no Supabase login; /create checks the player itself).
// Secrets: MOLLIE_API_KEY (test_… first, live_… when ready), optional SITE_URL.
//
//   POST /payments/create   { type: "booking" | "pack", id }  (player's Authorization header)
//        -> { checkoutUrl }  the page sends the player to Mollie
//   POST /payments/webhook  Mollie posts "id=tr_…" whenever a payment changes
//   POST /payments/refunds  runs the refunds the database marked as due

import { createClient } from "npm:@supabase/supabase-js@2";

const MOLLIE = "https://api.mollie.com/v2";
const MOLLIE_KEY = Deno.env.get("MOLLIE_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://pieterrvds.github.io/LEVEL-UP-/").replace(/\/?$/, "/");

// Service role: only used for the payment functions the website itself can't call
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function mollie(path: string, init: RequestInit = {}) {
  const res = await fetch(`${MOLLIE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${MOLLIE_KEY}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Mollie error ${res.status}`);
  return data;
}

const money = (n: number | string) => ({ currency: "EUR", value: Number(n).toFixed(2) });

// A player starts an online payment for their own booking or pack
async function create(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return json({ error: "Log in first." }, 401);
  const { type, id } = await req.json().catch(() => ({}));
  if (!["booking", "pack"].includes(type) || !id) return json({ error: "Invalid payment." }, 400);

  // Runs as the player: the database checks it's theirs and still payable
  const asPlayer = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data: info, error } = await asPlayer.rpc("payment_request", { p_type: type, p_id: id });
  if (error) return json({ error: error.message }, 400);

  const payment = await mollie("/payments", {
    method: "POST",
    body: JSON.stringify({
      amount: money(info.amount),
      description: info.description,
      redirectUrl: `${SITE_URL}profile.html?payment=${type}:${id}`,
      webhookUrl: `${SUPABASE_URL}/functions/v1/payments/webhook`,
      metadata: { type, id },
    }),
  });
  const { error: attachError } = await admin.rpc("attach_payment", { p_type: type, p_id: id, p_mollie: payment.id });
  if (attachError) throw new Error(attachError.message);
  return json({ checkoutUrl: payment._links.checkout.href });
}

async function refund(mollieId: string, amount: number | string, description: string) {
  return await mollie(`/payments/${mollieId}/refunds`, {
    method: "POST",
    body: JSON.stringify({ amount: money(amount), description }),
  });
}

// Refunds the database marked as due (declined, expired or freely cancelled after paying)
async function processRefunds() {
  const { data: due, error } = await admin.rpc("claim_refunds");
  if (error) throw new Error(error.message);
  for (const r of due ?? []) {
    try {
      const res = await refund(r.mollieId, r.amount, "LEVEL-UP session refund");
      await admin.rpc("refund_done", { p_id: r.id, p_refund: res.id, p_ok: true });
    } catch (err) {
      console.error("Refund failed", r.id, err);
      await admin.rpc("refund_done", { p_id: r.id, p_refund: null, p_ok: false });
    }
  }
  return (due ?? []).length;
}

// Mollie only sends the payment id; the status always comes from Mollie itself
async function webhook(req: Request) {
  const form = await req.formData().catch(() => null);
  const id = form?.get("id");
  if (typeof id !== "string" || !id.startsWith("tr_")) return new Response("ok");
  const payment = await mollie(`/payments/${id}`);
  const { type, id: targetId } = payment.metadata ?? {};
  if (!type || !targetId) return new Response("ok");
  const { data, error } = await admin.rpc("payment_update", {
    p_mollie: id, p_status: payment.status, p_type: type, p_id: targetId,
  });
  if (error) throw new Error(error.message);
  if (data?.action === "refund" && payment.status === "paid") {
    await refund(id, payment.amount.value, "LEVEL-UP: booking no longer available");
  }
  await processRefunds();
  return new Response("ok");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  if (!MOLLIE_KEY) return json({ error: "Online payment is not set up yet." }, 503);
  const path = new URL(req.url).pathname;
  try {
    if (path.endsWith("/create")) return await create(req);
    if (path.endsWith("/webhook")) return await webhook(req);
    if (path.endsWith("/refunds")) return json({ refunded: await processRefunds() });
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    // Mollie retries the webhook when it doesn't get a 200, which is what we want on errors
    return json({ error: err instanceof Error ? err.message : "Payment error" }, 500);
  }
});
