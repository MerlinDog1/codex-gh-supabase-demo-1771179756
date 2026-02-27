import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function base64Bytes(base64: string): number {
  const clean = base64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const imageBase64 = typeof body?.imageBase64 === "string" ? body.imageBase64.trim() : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
    const scaleRaw = body?.scale;
    const scale = typeof scaleRaw === "number" ? scaleRaw : Number(scaleRaw || 2);

    if (!imageBase64) return jsonResponse({ error: "imageBase64 is required" }, 400);
    if (!mimeType || !allowedMimeTypes.has(mimeType)) {
      return jsonResponse({ error: "mimeType must be one of image/png, image/jpeg, image/webp" }, 400);
    }
    if (!/^[A-Za-z0-9+/=\r\n]+$/.test(imageBase64)) {
      return jsonResponse({ error: "imageBase64 must be valid base64" }, 400);
    }
    if (base64Bytes(imageBase64) > MAX_IMAGE_BYTES) {
      return jsonResponse({ error: `imageBase64 exceeds ${MAX_IMAGE_BYTES} byte limit` }, 413);
    }
    if (!Number.isFinite(scale) || scale < 1 || scale > 4) {
      return jsonResponse({ error: "scale must be a number between 1 and 4" }, 400);
    }

    const backendUrl = Deno.env.get("UPSCALE_BACKEND_URL");
    const backendToken = Deno.env.get("UPSCALE_BACKEND_TOKEN");

    if (!backendUrl || !backendToken) {
      return jsonResponse({
        error: "Upscale backend is not configured. Set UPSCALE_BACKEND_URL and UPSCALE_BACKEND_TOKEN in Supabase Edge Function secrets.",
      }, 501);
    }

    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${backendToken}`,
      },
      body: JSON.stringify({ imageBase64, mimeType, scale }),
    });

    const raw = await upstream.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch {}

    if (!upstream.ok) {
      return jsonResponse({ error: String(parsed?.error || raw || "Upscale backend request failed") }, upstream.status);
    }

    const outBase64 = typeof parsed?.bytesBase64Encoded === "string" ? parsed.bytesBase64Encoded : "";
    const outMime = typeof parsed?.mimeType === "string" ? parsed.mimeType : mimeType;
    if (!outBase64) return jsonResponse({ error: "Upscale backend returned no bytesBase64Encoded" }, 502);

    return jsonResponse({ bytesBase64Encoded: outBase64, mimeType: outMime });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
