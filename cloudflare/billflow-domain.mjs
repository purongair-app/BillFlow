// Serves the public GitHub Pages frontend at the BillFlow custom hostname.
// Authentication and financial requests go directly from the browser to Supabase.
const HOST = "billflow.airfriendservice.com";
const ORIGIN = "https://purongair-app.github.io";
export default {
  async fetch(request) {
    const incoming = new URL(request.url);
    if (incoming.hostname !== HOST) return new Response("Not found", {status: 404});
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", {status: 405, headers: {Allow: "GET, HEAD"}});
    if (incoming.protocol !== "https:") {
      incoming.protocol = "https:";
      return Response.redirect(incoming.toString(), 302);
    }
    const path = incoming.pathname === "/" ? "/BillFlow/" :
      incoming.pathname === "/BillFlow" ? "/BillFlow/" :
      incoming.pathname.startsWith("/BillFlow/") ? incoming.pathname : "/BillFlow" + incoming.pathname;
    const target = new URL(path, ORIGIN);
    if (target.origin !== ORIGIN || !target.pathname.startsWith("/BillFlow/"))
      return new Response("Not found", {status: 404});
    // Never forward cookies, credentials, auth callback query parameters or bodies.
    const headers = new Headers();
    for (const name of ["accept", "if-none-match", "if-modified-since", "range"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const upstream = await fetch(target.toString(), {method: request.method, headers, redirect: "manual"});
      const responseHeaders = new Headers(upstream.headers);
      responseHeaders.delete("set-cookie");
      responseHeaders.set("x-content-type-options", "nosniff");
      responseHeaders.set("referrer-policy", "strict-origin-when-cross-origin");
      const location = responseHeaders.get("location");
      if (location) {
        const next = new URL(location, target);
        if (next.origin !== ORIGIN || !next.pathname.startsWith("/BillFlow/"))
          return new Response("Unexpected upstream redirect", {status: 502});
        next.protocol = "https:";
        next.host = HOST;
        responseHeaders.set("location", next.toString());
      }
      if (responseHeaders.get("content-type")?.includes("text/html")) {
        responseHeaders.set("cache-control", "no-cache");
      }
      return new Response(upstream.body, {status: upstream.status, statusText: upstream.statusText, headers: responseHeaders});
    } catch {
      return new Response("BillFlow is temporarily unavailable. Please try again.", {status: 502, headers: {"content-type": "text/plain; charset=utf-8", "cache-control": "no-store"}});
    }
  }
};
