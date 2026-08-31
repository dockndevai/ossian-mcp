/**
 * Security policy engine.
 *
 * Ossian-mcp is a thin adapter: the primary access control is the Ossian API
 * key itself, which carries its own roles and can be confined to a single
 * namespace. These flags are defence in depth on top of that key — they decide
 * which tools are registered (capability vs. access mode) and whether each
 * individual call is allowed at runtime (namespace scoping, protected
 * namespaces, the destructive `forget` gate, dry-run). Pure logic — fully
 * unit-testable.
 */

export type Capability = "read" | "write" | "admin";
export type AccessMode = "read-only" | "read-write" | "admin";

const MODE_RANK: Record<AccessMode, number> = {
  "read-only": 0,
  "read-write": 1,
  admin: 2,
};

const CAPABILITY_RANK: Record<Capability, number> = {
  read: 0,
  write: 1,
  admin: 2,
};

export interface SecurityConfig {
  mode: AccessMode;
  /** If set, only these namespaces may be touched. Empty = all. */
  namespaceAllowlist: string[];
  /** Namespaces that can be read/searched but never ingested into. */
  protectedNamespaces: string[];
  /** `forget_session` (irreversible memory erase) requires this to be true. */
  allowForget: boolean;
  /** Validate + log writes without executing them. */
  dryRun: boolean;
  auditLog: boolean;
}

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

export interface GuardContext {
  tool: string;
  capability: Capability;
  /** The namespace a call targets, when it names one. */
  namespace?: string;
  /** Marks a mutating call as destructive (irreversible data loss). */
  destructive?: boolean;
}

export class SecurityPolicy {
  constructor(private readonly config: SecurityConfig) {}

  get mode(): AccessMode {
    return this.config.mode;
  }

  isCapabilityEnabled(capability: Capability): boolean {
    return CAPABILITY_RANK[capability] <= MODE_RANK[this.config.mode];
  }

  isNamespaceAllowed(ns: string): boolean {
    if (this.config.namespaceAllowlist.length === 0) return true;
    return this.config.namespaceAllowlist.includes(ns);
  }

  isNamespaceProtected(ns: string): boolean {
    return this.config.protectedNamespaces.includes(ns);
  }

  get protectedNamespaces(): string[] {
    return this.config.protectedNamespaces;
  }

  guard(ctx: GuardContext): { dryRun: boolean } {
    if (!this.isCapabilityEnabled(ctx.capability)) {
      this.audit(ctx, "DENY", `capability '${ctx.capability}' exceeds mode '${this.config.mode}'`);
      throw new PolicyError(
        `Operation '${ctx.tool}' requires '${ctx.capability}' access but the server runs in '${this.config.mode}' mode. ` +
          `Set OSSIAN_MODE to grant it.`,
      );
    }

    if (ctx.namespace !== undefined && ctx.namespace !== "") {
      if (!this.isNamespaceAllowed(ctx.namespace)) {
        this.audit(ctx, "DENY", `namespace '${ctx.namespace}' not in allowlist`);
        throw new PolicyError(
          `Namespace '${ctx.namespace}' is not in the configured allowlist (OSSIAN_NAMESPACE_ALLOWLIST).`,
        );
      }
      if (ctx.capability !== "read" && this.isNamespaceProtected(ctx.namespace)) {
        this.audit(ctx, "DENY", `namespace '${ctx.namespace}' is protected`);
        throw new PolicyError(
          `Namespace '${ctx.namespace}' is protected (OSSIAN_PROTECTED_NAMESPACES); it can be read but not written to.`,
        );
      }
    }

    if (ctx.destructive && !this.config.allowForget) {
      this.audit(ctx, "DENY", "forget not enabled");
      throw new PolicyError(
        `Irreversible operation '${ctx.tool}' is disabled. Set OSSIAN_ALLOW_FORGET=true to enable it.`,
      );
    }

    const dryRun = ctx.capability !== "read" && this.config.dryRun;
    this.audit(ctx, dryRun ? "DRY_RUN" : "ALLOW");
    return { dryRun };
  }

  private audit(ctx: GuardContext, decision: string, reason?: string): void {
    if (!this.config.auditLog) return;
    const line = {
      ts: new Date().toISOString(),
      audit: "ossian-mcp",
      decision,
      tool: ctx.tool,
      capability: ctx.capability,
      namespace: ctx.namespace ?? null,
      destructive: ctx.destructive ?? false,
      ...(reason ? { reason } : {}),
    };
    process.stderr.write(`${JSON.stringify(line)}\n`);
  }
}
