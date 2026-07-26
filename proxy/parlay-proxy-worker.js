/*
 * ParlayAPI CORS Proxy  —  Cloudflare Worker
 * -------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ParlayAPI's /odds endpoint returns HTTP 502 for ANY request that carries a
 * browser "Origin" header (verified: without Origin = works, with Origin = 502
 * every single time). Browsers ALWAYS send Origin on cross-site requests and
 * that cannot be disabled from JavaScript — so a browser page can never call
 * ParlayAPI's odds endpoint directly. On top of that, ParlayAPI's error pages
 * omit CORS headers, so the failure shows up in the browser as a vague
 * "connection failed" instead of a clear 502.
 *
 * WHAT THIS DOES
 * The browser calls THIS worker instead of ParlayAPI. The worker then calls
 * ParlayAPI server-to-server (no Origin header -> no 502 bug), automatically
 * retries ParlayAPI's occasional genuine 502 hiccups, and returns the data to
 * the browser WITH proper CORS headers so the browser can read it.
 *
 * DEPLOY (no coding, ~2 minutes):
 *   1. Sign up free at dash.cloudflare.com
 *   2. Workers & Pages -> Create -> Create Worker -> name it e.g. "parlay-proxy"
 *   3. Click "Edit code", delete the sample, paste THIS file, click "Deploy"
 *   4. Copy your worker URL, e.g. https://parlay-proxy.YOURNAME.workers.dev
 *   5. In the app's "API Base URL" box, put:  https://parlay-proxy.YOURNAME.workers.dev/v1
 *   Done. Enter your key as normal and load odds.
 */

const UPSTREAM = "https://parlay-api.com";   // real ParlayAPI host
const MAX_ATTEMPTS = 5;                       // retry ParlayAPI's transient 502s
const RETRY_BASE_MS = 600;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // --- CORS preflight: allow the browser to proceed ---
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Forward the exact path + query to ParlayAPI (e.g. /v1/sports/baseball_mlb/odds?...)
    const target = UPSTREAM + url.pathname + url.search;
    const apiKey = request.headers.get("X-API-Key") || url.searchParams.get("apiKey") || "";

    let lastStatus = 0, lastBody = "";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        // Server-to-server call: we deliberately DO NOT send an Origin header.
        const upstreamResp = await fetch(target, {
          method: "GET",
          headers: { "X-API-Key": apiKey, "Accept": "application/json" },
        });
        const body = await upstreamResp.text();

        // Retry only ParlayAPI's transient gateway errors; pass everything else straight through.
        if (upstreamResp.status >= 500 && attempt < MAX_ATTEMPTS) {
          lastStatus = upstreamResp.status; lastBody = body;
          await sleep(RETRY_BASE_MS * attempt);
          continue;
        }
        return new Response(body, {
          status: upstreamResp.status,
          headers: {
            ...corsHeaders(),
            "Content-Type": upstreamResp.headers.get("content-type") || "application/json",
          },
        });
      } catch (err) {
        lastStatus = 0; lastBody = String(err);
        if (attempt < MAX_ATTEMPTS) await sleep(RETRY_BASE_MS * attempt);
      }
    }
    // All retries exhausted -> ParlayAPI is genuinely down right now.
    return new Response(
      JSON.stringify({ detail: { error: "UPSTREAM_UNAVAILABLE",
        message: "ParlayAPI odds server is temporarily unavailable (repeated 5xx). Try again shortly.",
        lastStatus, sample: lastBody.slice(0, 200) } }),
      { status: 502, headers: { ...corsHeaders(), "Content-Type": "application/json" } }
    );
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "X-API-Key, Accept, Content-Type",
    "Access-Control-Max-Age": "600",
  };
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
