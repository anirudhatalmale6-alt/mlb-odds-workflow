# ParlayAPI CORS Proxy

ParlayAPI's `/odds` endpoint returns **HTTP 502 for any request carrying a browser `Origin` header**
(verified by testing: without Origin = 200, with Origin = 502 every time). Browsers always send
`Origin`, so a browser page cannot call the odds endpoint directly. This tiny proxy fixes that: the
browser calls the proxy, the proxy calls ParlayAPI server-to-server (no Origin), retries transient
502s, and returns the data with proper CORS headers.

## Deploy on a free Cloudflare Worker (no coding, ~2 min)
1. Sign up free at https://dash.cloudflare.com
2. **Workers & Pages → Create → Create Worker**, name it e.g. `parlay-proxy`
3. **Edit code**, delete the sample, paste `parlay-proxy-worker.js`, click **Deploy**
4. Copy the worker URL, e.g. `https://parlay-proxy.YOURNAME.workers.dev`
5. In the app's **API Base URL** box, enter: `https://parlay-proxy.YOURNAME.workers.dev/v1`
6. Enter your API key and load odds as normal.

`parlay-proxy-worker.js` — the Cloudflare Worker (also runs on any Node 18+ host with minor edits).
