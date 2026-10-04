// LEVEL-UP push notifications: sends the messages the database queued in push_outbox.
// Deploy as the Supabase Edge Function "push" with JWT verification OFF (the website calls /flush
// after every change, and a cron job can call it too; it only ever sends what the database queued).
// No secrets to set: the VAPID key pair is made on the first /setup call and kept in public.push_keys,
// which only the server can read. Optional secret: PUSH_CONTACT (default mailto:PieterV-D-S@hotmail.com).
//
//   POST /push/setup   makes the key pair if there is none yet -> { publicKey }
//   POST /push/flush   queues session reminders, then sends every waiting message -> { sent, gone }

import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const CONTACT = Deno.env.get("PUSH_CONTACT") ?? "mailto:PieterV-D-S@hotmail.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// ---------- Web Push (RFC 8291 encryption + RFC 8292 VAPID), WebCrypto only ----------
const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

// A new VAPID key pair: the public key goes to browsers, the private JWK stays in the database
async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { publicKey, privateJwk };
}

async function vapidHeader(endpoint: string, publicKey: string, privateJwk: JsonWebKey, subject: string) {
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64url(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(signature)}, k=${publicKey}`;
}

// Encrypts the payload for one browser subscription (aes128gcm, one record)
async function encryptPayload(p256dh: string, authSecret: string, payload: Uint8Array) {
  const uaPublic = fromB64url(p256dh);
  const auth = fromB64url(authSecret);
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(auth, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

type PushTarget = { endpoint: string; p256dh: string; auth: string };
type Vapid = { publicKey: string; privateJwk: JsonWebKey; subject: string };

// Sends one notification; returns the push service's HTTP status (404/410 = subscription is gone)
async function sendPush(target: PushTarget, message: unknown, vapid: Vapid, ttl = 86400) {
  const body = await encryptPayload(target.p256dh, target.auth, enc.encode(JSON.stringify(message)));
  const res = await fetch(target.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidHeader(target.endpoint, vapid.publicKey, vapid.privateJwk, vapid.subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttl),
      Urgency: "high",
    },
    body,
  });
  await res.body?.cancel();
  return res.status;
}


// ---------- Keys ----------
async function getKeys() {
  const { data } = await admin.from("push_keys").select("public_key, private_jwk").eq("id", 1).maybeSingle();
  return data ? { publicKey: data.public_key as string, privateJwk: data.private_jwk as JsonWebKey } : null;
}

async function setup() {
  let keys = await getKeys();
  if (!keys) {
    const fresh = await generateVapidKeys();
    // two first calls at once: the second insert is ignored and both read the same row
    await admin.from("push_keys").upsert({ id: 1, public_key: fresh.publicKey, private_jwk: fresh.privateJwk },
      { onConflict: "id", ignoreDuplicates: true });
    keys = await getKeys();
  }
  return json({ publicKey: keys?.publicKey ?? null });
}

// ---------- Sending ----------
type Message = { title: string; body: string; url: string; tag: string; targets: (PushTarget & { id: string })[] };

async function flush() {
  const keys = await getKeys();
  if (!keys) return json({ sent: 0, note: "No keys yet: nobody has turned on notifications." });
  const vapid: Vapid = { ...keys, subject: CONTACT };
  await admin.rpc("push_due_reminders");

  let sent = 0;
  const gone: string[] = [];
  const ok: string[] = [];
  for (let round = 0; round < 5; round++) {
    const { data, error } = await admin.rpc("push_claim", { p_limit: 100 });
    if (error) return json({ error: error.message }, 500);
    const messages = (data ?? []) as Message[];
    if (!messages.length) break;
    await Promise.all(messages.flatMap((m) => m.targets.map(async (t) => {
      try {
        const status = await sendPush(t, { title: m.title, body: m.body, url: m.url, tag: m.tag }, vapid);
        if (status === 404 || status === 410) gone.push(t.id);
        else if (status < 300) { ok.push(t.id); sent++; }
        else console.error("push failed", status, new URL(t.endpoint).host);
      } catch (err) {
        console.error("push error", err);
      }
    })));
  }
  if (gone.length || ok.length) await admin.rpc("push_report", { p_gone: gone, p_ok: [...new Set(ok)] });
  return json({ sent, gone: gone.length });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Not found" }, 404);
  const path = new URL(req.url).pathname.split("/").pop();
  try {
    if (path === "setup") return await setup();
    if (path === "flush") return await flush();
    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Push service error" }, 500);
  }
});
