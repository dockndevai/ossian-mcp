import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import type { AppConfig } from "../src/config.js";
import { MEMORY_LIST_LIMIT, OssianClient, memorySetVersion, type Memory } from "../src/ossian/client.js";
import { buildServer } from "../src/server.js";

const config = (requireHumanApproval = false): AppConfig => ({
  connection: { baseUrl: "http://ossian.invalid", apiKey: "osk_test", timeoutMs: 1000 },
  defaultAgentId: "mcp",
  security: {
    mode: "admin",
    namespaceAllowlist: [],
    protectedNamespaces: [],
    allowForget: true,
    dryRun: false,
    auditLog: false,
    requireHumanApproval,
  },
});

type Answer = { action: "accept" | "decline"; content?: Record<string, unknown> };

/** Connect an in-memory MCP client (optionally able to answer elicitation) to a freshly built server. */
async function connect(opts: { requireHuman?: boolean; answer?: (message: string) => Answer | Promise<Answer>; elicits?: boolean } = {}) {
  const { server } = buildServer(config(opts.requireHuman));
  const prompts: string[] = [];
  const client = new Client({ name: "t", version: "0" }, { capabilities: opts.elicits === false ? {} : { elicitation: {} } });
  if (opts.elicits !== false) {
    client.setRequestHandler(ElicitRequestSchema, async (req) => {
      prompts.push(req.params.message);
      return (await opts.answer?.(req.params.message)) ?? { action: "accept", content: { confirm: true } };
    });
  }
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, prompts };
}

const text = (r: unknown) => ((r as { content: Array<{ text: string }> }).content[0]?.text ?? "");

const mem = (id: string, content: string, extra: Partial<Memory> = {}): Memory => ({
  id,
  content,
  kind: "fact",
  subject: null,
  sessionId: "s1",
  importance: 1,
  similarity: null,
  score: null,
  createdAt: "2026-11-01T00:00:00Z",
  ...extra,
});

afterEach(() => vi.restoreAllMocks());

describe("forget_session approval (end to end)", () => {
  it("shows the tool, full arguments, memory-set version and fingerprint, then erases", async () => {
    vi.spyOn(OssianClient.prototype, "sessionMemoriesVersion").mockResolvedValue("3 memories:abc");
    const forget = vi.spyOn(OssianClient.prototype, "forgetSession").mockResolvedValue({ forgotten: 3 });
    const { client, prompts } = await connect();
    const res = await client.callTool({ name: "forget_session", arguments: { sessionId: "s1" } });
    expect(text(res)).toContain("Forgot 3 memories");
    expect(forget).toHaveBeenCalledWith("mcp", "s1");
    expect(prompts[0]).toContain("tool: forget_session");
    expect(prompts[0]).toContain('{"sessionId":"s1"}');
    expect(prompts[0]).toContain("agentId: mcp");
    expect(prompts[0]).toContain("resource version: 3 memories:abc");
    expect(prompts[0]).toMatch(/fingerprint: [0-9a-f]{16}/);
  });

  it("does NOT erase when a memory was added to the session while the human was deciding", async () => {
    const versions = ["3 memories:abc", "4 memories:def"];
    vi.spyOn(OssianClient.prototype, "sessionMemoriesVersion").mockImplementation(async () => versions.shift());
    const forget = vi.spyOn(OssianClient.prototype, "forgetSession").mockResolvedValue({ forgotten: 4 });
    const { client } = await connect();
    const res = await client.callTool({ name: "forget_session", arguments: { sessionId: "s1" } });
    expect(text(res)).toContain("resource changed since the prompt");
    expect(forget).not.toHaveBeenCalled();
  });

  it("does NOT erase when the human declines", async () => {
    vi.spyOn(OssianClient.prototype, "sessionMemoriesVersion").mockResolvedValue("3 memories:abc");
    const forget = vi.spyOn(OssianClient.prototype, "forgetSession").mockResolvedValue({ forgotten: 3 });
    const { client } = await connect({ answer: () => ({ action: "decline" }) });
    await client.callTool({ name: "forget_session", arguments: { sessionId: "s1" } });
    expect(forget).not.toHaveBeenCalled();
  });

  it("pins the real memory list read through the HTTP client (stable across recalls, changed by a new memory)", async () => {
    // First prompt-time read, then the post-answer read: a recall bumped useCount/lastUsedAt only.
    const reads: Memory[][] = [
      [mem("a", "likes tea"), mem("b", "lives in Pune")],
      [mem("b", "lives in Pune", { useCount: 9, lastUsedAt: "2026-11-11T00:00:00Z" } as Partial<Memory>), mem("a", "likes tea")],
    ];
    vi.spyOn(OssianClient.prototype, "listSessionMemories").mockImplementation(async () => reads.shift() ?? []);
    const forget = vi.spyOn(OssianClient.prototype, "forgetSession").mockResolvedValue({ forgotten: 2 });
    const { client } = await connect();
    await client.callTool({ name: "forget_session", arguments: { sessionId: "s1" } });
    expect(forget).toHaveBeenCalledOnce();

    const reads2: Memory[][] = [[mem("a", "likes tea")], [mem("a", "likes tea"), mem("c", "new fact")]];
    vi.spyOn(OssianClient.prototype, "listSessionMemories").mockImplementation(async () => reads2.shift() ?? []);
    forget.mockClear();
    const res = await client.callTool({ name: "forget_session", arguments: { sessionId: "s1" } });
    expect(text(res)).toContain("resource changed since the prompt");
    expect(forget).not.toHaveBeenCalled();
  });

  it("uses the agentId argument for both the pin and the erase", async () => {
    const pin = vi.spyOn(OssianClient.prototype, "sessionMemoriesVersion").mockResolvedValue("1 memories:x");
    const forget = vi.spyOn(OssianClient.prototype, "forgetSession").mockResolvedValue({ forgotten: 1 });
    const { client } = await connect();
    await client.callTool({ name: "forget_session", arguments: { sessionId: "s1", agentId: "bot" } });
    expect(pin).toHaveBeenCalledWith("bot", "s1");
    expect(forget).toHaveBeenCalledWith("bot", "s1");
  });
});

describe("OSSIAN_REQUIRE_HUMAN_APPROVAL", () => {
  it("falls back to the flags when the client cannot elicit (default)", async () => {
    vi.spyOn(OssianClient.prototype, "sessionMemoriesVersion").mockResolvedValue("1 memories:x");
    const forget = vi.spyOn(OssianClient.prototype, "forgetSession").mockResolvedValue({ forgotten: 1 });
    const { client } = await connect({ elicits: false });
    await client.callTool({ name: "forget_session", arguments: { sessionId: "s1" } });
    expect(forget).toHaveBeenCalledWith("mcp", "s1");
  });

  it("refuses to erase when the client cannot elicit and human approval is required", async () => {
    vi.spyOn(OssianClient.prototype, "sessionMemoriesVersion").mockResolvedValue("1 memories:x");
    const forget = vi.spyOn(OssianClient.prototype, "forgetSession").mockResolvedValue({ forgotten: 1 });
    const { client, prompts } = await connect({ elicits: false, requireHuman: true });
    const res = await client.callTool({ name: "forget_session", arguments: { sessionId: "s1" } });
    expect(text(res)).toContain("no human approval channel");
    expect(prompts).toHaveLength(0);
    expect(forget).not.toHaveBeenCalled();
  });
});

describe("memorySetVersion", () => {
  const base = [mem("a", "likes tea"), mem("b", "lives in Pune")];

  it("is undefined for an empty session", () => {
    expect(memorySetVersion([])).toBeUndefined();
  });

  it("is independent of order and of volatile fields", () => {
    const touched = [
      mem("b", "lives in Pune", { importance: 5, subject: "user:x", kind: "preference" }),
      mem("a", "likes tea", { similarity: 0.9, score: 0.8 }),
    ];
    expect(memorySetVersion(touched)).toBe(memorySetVersion(base));
  });

  it("changes when a memory is added, removed, or its content differs", () => {
    const v = memorySetVersion(base);
    expect(memorySetVersion([...base, mem("c", "x")])).not.toBe(v);
    expect(memorySetVersion([base[0]!])).not.toBe(v);
    expect(memorySetVersion([mem("a", "likes coffee"), base[1]!])).not.toBe(v);
  });

  it("marks a full page as truncated so the human sees the set may be larger", () => {
    expect(memorySetVersion(base, true)).toMatch(/^2\+ memories:/);
    expect(memorySetVersion(base)).toMatch(/^2 memories:/);
  });

  it("asks Ossian for the session's memories with the page-size limit", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(base), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const v = await new OssianClient("http://ossian.invalid", "k").sessionMemoriesVersion("a b", "s/1");
      expect(v).toBe(memorySetVersion(base));
      expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe(
        `http://ossian.invalid/api/memory?agentId=a%20b&sessionId=s%2F1&limit=${MEMORY_LIST_LIMIT}`,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
