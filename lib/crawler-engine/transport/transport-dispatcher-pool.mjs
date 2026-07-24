import { Agent as UndiciAgent } from "undici";

function hostnameOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

export class TransportDispatcherPool {
  #agents = new Map();

  dispatcherFor(url, policy) {
    const hostname = hostnameOf(url);
    const protocol = new URL(url).protocol;
    const insecure = protocol === "https:"
      && policy.tlsMode === "insecure-exact-host"
      && policy.allowedHosts.includes(hostname);
    const key = [
      policy.dnsFamily,
      insecure ? "insecure" : policy.tlsMode,
      insecure ? hostname : "shared",
    ].join(":");
    if (!this.#agents.has(key)) {
      const family = policy.dnsFamily === "ipv4"
        ? 4
        : policy.dnsFamily === "ipv6"
          ? 6
          : undefined;
      // Insecure agents are keyed by exact hostname so an exception can never
      // leak to an unrelated redirect target through dispatcher reuse.
      this.#agents.set(key, new UndiciAgent({
        connect: {
          ...(family ? { family } : {}),
          ...(insecure ? { rejectUnauthorized: false } : {}),
        },
      }));
    }
    return {
      dispatcher: this.#agents.get(key),
      insecureTlsApplied: insecure,
    };
  }

  async close() {
    await Promise.all(
      [...this.#agents.values()].map((agent) => agent.close().catch(() => {})),
    );
    this.#agents.clear();
  }
}

export function createTransportDispatcherPool() {
  return new TransportDispatcherPool();
}
