import { describe, expect, it } from "vitest";
import { PolicyError, SecurityPolicy, type SecurityConfig } from "../src/security.js";

function makePolicy(overrides: Partial<SecurityConfig> = {}): SecurityPolicy {
  return new SecurityPolicy({
    mode: "read-only",
    namespaceAllowlist: [],
    protectedNamespaces: ["published"],
    allowForget: false,
    dryRun: false,
    auditLog: false,
    ...overrides,
  });
}

describe("capability gating", () => {
  it("read-only enables read only", () => {
    const p = makePolicy();
    expect(p.isCapabilityEnabled("read")).toBe(true);
    expect(p.isCapabilityEnabled("write")).toBe(false);
    expect(p.isCapabilityEnabled("admin")).toBe(false);
  });
  it("read-write enables read and write but not admin", () => {
    const p = makePolicy({ mode: "read-write" });
    expect(p.isCapabilityEnabled("write")).toBe(true);
    expect(p.isCapabilityEnabled("admin")).toBe(false);
  });
  it("admin enables everything", () => {
    const p = makePolicy({ mode: "admin" });
    expect(p.isCapabilityEnabled("admin")).toBe(true);
  });
});

describe("mode vs capability at guard time", () => {
  it("rejects a write in read-only mode", () => {
    const p = makePolicy();
    expect(() => p.guard({ tool: "remember", capability: "write" })).toThrow(PolicyError);
  });
  it("rejects admin in read-write mode", () => {
    const p = makePolicy({ mode: "read-write" });
    expect(() => p.guard({ tool: "forget_session", capability: "admin", destructive: true })).toThrow(/admin/);
  });
});

describe("namespace allowlist + protection", () => {
  it("blocks namespaces outside a non-empty allowlist", () => {
    const p = makePolicy({ mode: "read-write", namespaceAllowlist: ["runbooks"] });
    expect(() =>
      p.guard({ tool: "add_document_from_url", capability: "write", namespace: "secret" }),
    ).toThrow(/allowlist/);
  });
  it("allows reading a protected namespace but not ingesting into it", () => {
    const p = makePolicy({ mode: "read-write" });
    expect(() => p.guard({ tool: "ask_documents", capability: "read", namespace: "published" })).not.toThrow();
    expect(() =>
      p.guard({ tool: "add_document_from_url", capability: "write", namespace: "published" }),
    ).toThrow(/protected/);
  });
});

describe("forget gating", () => {
  it("blocks forget without allowForget even in admin mode", () => {
    const p = makePolicy({ mode: "admin" });
    expect(() => p.guard({ tool: "forget_session", capability: "admin", destructive: true })).toThrow(
      /ALLOW_FORGET/,
    );
  });
  it("permits forget with allowForget", () => {
    const p = makePolicy({ mode: "admin", allowForget: true });
    expect(() =>
      p.guard({ tool: "forget_session", capability: "admin", destructive: true }),
    ).not.toThrow();
  });
});

describe("dry run", () => {
  it("flags writes but not reads", () => {
    const p = makePolicy({ mode: "read-write", dryRun: true });
    expect(p.guard({ tool: "recall", capability: "read" }).dryRun).toBe(false);
    expect(p.guard({ tool: "remember", capability: "write" }).dryRun).toBe(true);
  });
});
