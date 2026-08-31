/**
 * Configuration from environment variables.
 */
import type { AccessMode, SecurityConfig } from "./security.js";

export interface OssianConnection {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
}

export interface AppConfig {
  connection: OssianConnection;
  defaultAgentId: string;
  security: SecurityConfig;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function list(name: string): string[] {
  const v = process.env[name];
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseMode(): AccessMode {
  const raw = (process.env.OSSIAN_MODE ?? "read-only").toLowerCase();
  if (raw === "read-only" || raw === "read-write" || raw === "admin") return raw;
  throw new Error(`Invalid OSSIAN_MODE '${raw}'. Expected one of: read-only, read-write, admin.`);
}

export function loadConfig(): AppConfig {
  return {
    connection: {
      baseUrl: (process.env.OSSIAN_URL || "http://localhost:8081").replace(/\/$/, ""),
      apiKey: process.env.OSSIAN_API_KEY ?? "",
      timeoutMs: Number(process.env.OSSIAN_TIMEOUT_MS ?? 120000),
    },
    defaultAgentId: process.env.OSSIAN_AGENT_ID ?? "mcp",
    security: {
      mode: parseMode(),
      namespaceAllowlist: list("OSSIAN_NAMESPACE_ALLOWLIST"),
      protectedNamespaces: list("OSSIAN_PROTECTED_NAMESPACES"),
      allowForget: bool("OSSIAN_ALLOW_FORGET", false),
      dryRun: bool("OSSIAN_DRY_RUN", false),
      auditLog: bool("OSSIAN_AUDIT_LOG", true),
    },
  };
}
