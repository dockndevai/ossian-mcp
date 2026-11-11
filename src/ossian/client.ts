/**
 * Thin HTTP client for an Ossian installation.
 *
 * Authenticates with an API key rather than a user token, because that is what a process can
 * hold — an agent cannot complete an interactive browser login. A key carries its own roles and
 * can be confined to a single namespace, so the credential given to an agent can be narrower
 * than the person who issued it.
 */

import { createHash } from "node:crypto";

export class OssianError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export interface Citation {
  index: number;
  documentId: string;
  filename: string;
  score: number | null;
  excerpt: string;
}

export interface AskResponse {
  answer: string;
  citations: Citation[];
  answeredFromContext: boolean;
  latencyMs: number;
}

export interface Memory {
  id: string;
  content: string;
  kind: string;
  subject: string | null;
  sessionId: string | null;
  importance: number;
  similarity: number | null;
  score: number | null;
  createdAt: string;
}

/** The most memories Ossian's list endpoint returns per call (it clamps `limit` to 200). */
export const MEMORY_LIST_LIMIT = 200;

/**
 * Version token for a set of memories: the set's size plus a SHA-256 over each memory's id and the
 * SHA-256 of its content, sorted. It is the same construction as Ossian's own per-memory
 * `content_hash` (SHA-256 of the stored text), folded over ids so the token names exactly which
 * rows hold exactly which statements.
 *
 * Deliberately excluded: `lastUsedAt`, `useCount`, `similarity`, `score` (change on every
 * `recall`), and `importance` / `subject` / `kind` / `metadata` (a re-`remember` of the same text
 * rewrites them without changing what is remembered). Returns `undefined` for an empty set.
 */
export function memorySetVersion(memories: Array<Pick<Memory, "id" | "content">>, truncated = false): string | undefined {
  if (memories.length === 0) return undefined;
  const lines = memories
    .map((m) => `${m.id}:${createHash("sha256").update(m.content).digest("hex")}`)
    .sort();
  const digest = createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 12);
  return `${memories.length}${truncated ? "+" : ""} memories:${digest}`;
}

export class OssianClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 120_000,
  ) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    // Every call is bounded. A hung request would otherwise leave the agent waiting forever with
    // no indication of why, which is worse than an error it can report.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          "X-API-Key": this.apiKey,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      });
      if (!res.ok) {
        let detail = res.statusText;
        try {
          const body = (await res.json()) as { message?: string };
          detail = body.message ?? detail;
        } catch {
          /* a non-JSON error body; the status text will do */
        }
        // 429 is worth naming, because the agent can act on it — everything else it can only
        // report.
        if (res.status === 429) {
          const retry = res.headers.get("retry-after");
          throw new OssianError(429, `Rate limited by Ossian${retry ? `; retry after ${retry}s` : ""}.`);
        }
        throw new OssianError(res.status, detail);
      }
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof OssianError) throw err;
      if (err instanceof Error && err.name === "AbortError") {
        throw new OssianError(504, `Ossian did not respond within ${this.timeoutMs / 1000}s.`);
      }
      throw new OssianError(0, err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(timer);
    }
  }

  ask(question: string, namespace?: string, documentIds?: string[]) {
    return this.request<AskResponse>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ question, namespace, documentIds }),
    });
  }

  documents(namespace?: string) {
    const q = namespace ? `&namespace=${encodeURIComponent(namespace)}` : "";
    return this.request<{ content: Array<Record<string, unknown>>; totalElements: number }>(
      `/api/documents?size=100${q}`,
    );
  }

  namespaces() {
    return this.request<Array<{ name: string; documents: number; chunks: number }>>("/api/namespaces");
  }

  addUrl(url: string, namespace?: string, title?: string) {
    return this.request<{ documentId: string; status: string; duplicate: boolean }>("/api/documents/url", {
      method: "POST",
      body: JSON.stringify({ url, namespace, title }),
    });
  }

  remember(body: Record<string, unknown>) {
    return this.request<Memory>("/api/memory", { method: "POST", body: JSON.stringify(body) });
  }

  recall(body: Record<string, unknown>) {
    return this.request<Memory[]>("/api/memory/recall", { method: "POST", body: JSON.stringify(body) });
  }

  /** Memories currently held for one agent session (newest first, expired ones excluded by Ossian). */
  listSessionMemories(agentId: string, sessionId: string) {
    return this.request<Memory[]>(
      `/api/memory?agentId=${encodeURIComponent(agentId)}&sessionId=${encodeURIComponent(sessionId)}&limit=${MEMORY_LIST_LIMIT}`,
    );
  }

  /**
   * Version token for what `forgetSession` would erase, pinned across an approval prompt. Reads
   * the session's memories through Ossian's list endpoint (id + content only feed the token).
   *
   * Limits: the endpoint returns at most 200 rows, newest first, so a session with more is pinned
   * on its 200 newest (a new memory always lands in that window and is detected; a change only to
   * older rows is not). Expired rows are invisible to the endpoint but are still deleted by the
   * erase. The erase itself (`DELETE /api/memory/sessions/{id}`) has no precondition, so the check
   * is a pre-flight, not atomic: a memory written between the final check and the delete is erased
   * unseen. Ossian has no updated-at or revision for a set of memories, so none is used.
   */
  async sessionMemoriesVersion(agentId: string, sessionId: string): Promise<string | undefined> {
    const rows = await this.listSessionMemories(agentId, sessionId);
    return memorySetVersion(rows, rows.length >= MEMORY_LIST_LIMIT);
  }

  forgetSession(agentId: string, sessionId: string) {
    return this.request<{ forgotten: number }>(
      `/api/memory/sessions/${encodeURIComponent(sessionId)}?agentId=${encodeURIComponent(agentId)}`,
      { method: "DELETE" },
    );
  }
}
