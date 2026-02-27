import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const allowedMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const allowedTraceDetail = new Set(["2K", "4K", "8K"]);

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
    const style = typeof body?.style === "string" ? body.style.trim() : "crosshatch";
    const traceDetail = typeof body?.traceDetail === "string" ? body.traceDetail.trim().toUpperCase() : "4K";
    const output = typeof body?.output === "string" ? body.output.trim().toLowerCase() : "svg";

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
    if (style.length > 80) return jsonResponse({ error: "style must be <= 80 chars" }, 400);
    if (!allowedTraceDetail.has(traceDetail)) return jsonResponse({ error: "traceDetail must be one of 2K, 4K, 8K" }, 400);
    if (output !== "svg") return jsonResponse({ error: "output must be 'svg'" }, 400);

    const backendUrl = Deno.env.get("TRACE_BACKEND_URL");
    const backendToken = Deno.env.get("TRACE_BACKEND_TOKEN");

    if (!backendUrl || !backendToken) {
      return jsonResponse({
        error: "Tracing backend is not configured. Set TRACE_BACKEND_URL and TRACE_BACKEND_TOKEN in Supabase Edge Function secrets.",
      }, 501);
    }

    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${backendToken}`,
      },
      body: JSON.stringify({ imageBase64, mimeType, style, traceDetail, output: "svg" }),
    });

    const raw = await upstream.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(raw); } catch {}

    if (!upstream.ok) {
      return jsonResponse({ error: String(parsed?.error || raw || "Trace backend request failed") }, upstream.status);
    }

    const svg = typeof parsed?.svg === "string" ? parsed.svg : "";
    if (!svg) return jsonResponse({ error: "Trace backend returned no svg" }, 502);

    return jsonResponse({ svg });
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});
