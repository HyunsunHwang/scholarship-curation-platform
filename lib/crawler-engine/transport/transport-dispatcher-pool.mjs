import { Agent as UndiciAgent } from "undici";
import tls from "node:tls";

function hostnameOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch { return ""; }
}

function transportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function resolveSystemCaCertificates(systemCaProvider = tls.getCACertificates) {
  if (typeof systemCaProvider !== "function") {
    throw transportError(
      "transport_system_ca_unsupported",
      "This Node.js runtime does not support tls.getCACertificates().",
    );
  }
  const defaults = systemCaProvider("default");
  const system = systemCaProvider("system");
  if (!Array.isArray(defaults) || !Array.isArray(system)) {
    throw transportError(
      "transport_system_ca_invalid",
      "System CA provider must return certificate arrays.",
    );
  }
  if (system.length === 0) {
    throw transportError(
      "transport_system_ca_empty",
      "System CA store is empty; refusing to weaken system-ca verification.",
    );
  }
  return Object.freeze([...new Set([...defaults, ...system])]);
}

export class TransportDispatcherPool {
  #agents = new Map();
  #systemCaProvider;
  #agentFactory;

  constructor({ systemCaProvider = tls.getCACertificates, agentFactory = null } = {}) {
    this.#systemCaProvider = systemCaProvider;
    this.#agentFactory = agentFactory ?? ((options) => new UndiciAgent(options));
  }

  dispatcherFor(url, policy) {
    const hostname = hostnameOf(url);
    const protocol = new URL(url).protocol;
    const insecure = protocol === "https:"
      && policy.tlsMode === "insecure-exact-host"
      && policy.allowedHosts.includes(hostname);
    const systemCa = protocol === "https:"
      && policy.tlsMode === "system-ca"
      && policy.allowedHosts.includes(hostname);
    const key = [
      policy.dnsFamily,
      insecure ? "insecure" : systemCa ? "system-ca" : "strict",
      insecure || systemCa ? hostname : "shared",
    ].join(":");
    if (!this.#agents.has(key)) {
      const family = policy.dnsFamily === "ipv4"
        ? 4
        : policy.dnsFamily === "ipv6"
          ? 6
          : undefined;
      // Insecure agents are keyed by exact hostname so an exception can never
      // leak to an unrelated redirect target through dispatcher reuse.
      const connect = {
        ...(family ? { family } : {}),
        ...(systemCa ? { ca: resolveSystemCaCertificates(this.#systemCaProvider) } : {}),
        ...(insecure ? { rejectUnauthorized: false } : {}),
      };
      this.#agents.set(key, this.#agentFactory({
        connect: {
          ...connect,
        },
      }));
    }
    return {
      dispatcher: this.#agents.get(key),
      insecureTlsApplied: insecure,
      systemCaApplied: systemCa,
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
