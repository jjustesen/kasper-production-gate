// Rule 6, Brain rules: does this copy break a client's free-text brand rule?
//
// This is the only step that needs language understanding ("never a generic
// cup", "no superlatives we can't prove"), so it is the only LLM step. It uses a
// cheap model through a content-addressed cache:
//
//   1. Look up sha256(model, client, rules, copy) in the cache file. Re-checking
//      an unchanged brief costs nothing.
//   2. On a miss, call the model if live calls are enabled, then cache the answer.
//   3. On a miss with no live calls (or an API error), answer "unsure" for every
//      rule. The gate turns "unsure" into a block for human review: failing
//      closed is safer than letting unchecked copy into production.
//
// The model only says violates / ok / unsure and quotes the offending words.
// It never decides numbers: discount caps are checked in code (claims.ts).

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { BRAIN_MAX_TOKENS, BRAIN_MODEL } from "./config.ts";
import type { BrainVerdict } from "./models.ts";

export const SYSTEM_PROMPT = `You check the text of an ad brief against a client's brand rules. You only see the brief's words; the ad itself is made later by a designer who also knows the rules.
For each rule, answer:
- "violates": the brief's words themselves break the rule, or ask the designer to break it. evidence = the exact words from the brief, quoted verbatim and nothing else (no explanation).
- "ok": the words do not break the rule. This includes a brief that says nothing related to the rule: a rule about imagery is "ok" when the brief describes no imagery, and a rule about claims is "ok" when the brief makes no such claim. Silence is never a violation.
- "unsure": the brief explicitly describes something that might break the rule and you cannot tell. Use this rarely. evidence = the related words, quoted.
Ignore numeric limits such as discount caps; they are checked elsewhere, so answer "ok" for them.
The brief may be in English or Portuguese. Judge meaning, not keywords.

Examples for the rule "Always show the can or bag, never a generic cup":
- "First box 20% off." -> ok. The brief describes no imagery; the designer will follow the rule.
- "Cosy autumn flavour, limited run." -> ok. Same reason.
- "Barista pours into a takeaway cup." -> violates. The brief asks for a generic cup.
- "Close-up of the drink being poured." -> unsure. It describes imagery but not the container.`;

// Bump when the prompt changes so cached answers from an older prompt are not reused.
export const PROMPT_VERSION = "v3";

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rule_index: { type: "integer" },
          verdict: { type: "string", enum: ["violates", "ok", "unsure"] },
          evidence: { type: "string" },
        },
        required: ["rule_index", "verdict", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
};

interface CacheEntry {
  model: string;
  client: string;
  rules: string[];
  text: string;
  source: string;
  verdicts: BrainVerdict[];
  brief?: string;
}

/** The part of the Anthropic client we use, so tests can pass a fake. */
export interface MessagesClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      stop_reason: string | null;
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    }>;
  };
}

export interface BrainCheck {
  check(client: string, text: string, rules: string[]): Promise<{ verdicts: BrainVerdict[]; source: string }>;
}

export function cacheKey(model: string, client: string, rules: string[], text: string): string {
  return createHash("sha256").update(JSON.stringify([model, PROMPT_VERSION, client, rules, text])).digest("hex");
}

export class BrainChecker implements BrainCheck {
  // Token counts come from the API's usage field, so a live run reports what it really cost.
  stats = { cache_hits: 0, live_calls: 0, unchecked: 0, input_tokens: 0, output_tokens: 0 };
  private cache = new Map<string, CacheEntry>();
  private cachePath: string | null;
  private live: boolean;
  private model: string;
  private client: MessagesClient | null;

  constructor(opts: { cachePath?: string | null; live?: boolean; model?: string; client?: MessagesClient } = {}) {
    this.cachePath = opts.cachePath ?? null;
    this.live = opts.live ?? false;
    this.model = opts.model ?? BRAIN_MODEL;
    this.client = opts.client ?? null; // an Anthropic client, injected in tests
    if (this.cachePath && existsSync(this.cachePath)) {
      for (const entry of JSON.parse(readFileSync(this.cachePath, "utf-8")) as CacheEntry[]) {
        this.cache.set(cacheKey(entry.model, entry.client, entry.rules, entry.text), entry);
      }
    }
  }

  /** One verdict per rule, and where the answer came from. */
  async check(client: string, text: string, rules: string[]) {
    const key = cacheKey(this.model, client, rules, text);
    const cached = this.cache.get(key);
    if (cached) {
      this.stats.cache_hits += 1;
      return { verdicts: cached.verdicts.map((v) => ({ ...v })), source: `cache (${cached.source})` };
    }

    if (this.live) {
      let verdicts: BrainVerdict[];
      try {
        verdicts = await this.askModel(text, rules);
      } catch (error) {
        // Any API failure fails closed.
        return this.unchecked(rules, `API error: ${(error as Error).name}`);
      }
      this.stats.live_calls += 1;
      this.store(key, client, text, rules, verdicts);
      return { verdicts, source: this.model };
    }

    return this.unchecked(rules, "no cached answer and live calls are off");
  }

  private unchecked(rules: string[], why: string) {
    this.stats.unchecked += 1;
    return { verdicts: rules.map((rule) => ({ rule, verdict: "unsure" as const, evidence: why })), source: "unchecked" };
  }

  private async askModel(text: string, rules: string[]): Promise<BrainVerdict[]> {
    if (!this.client) {
      // Optional dependency, only needed for live calls.
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      this.client = new Anthropic() as unknown as MessagesClient;
    }
    const numbered = rules.map((rule, i) => `${i}. ${rule}`).join("\n");
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: BRAIN_MAX_TOKENS,
      system: SYSTEM_PROMPT,
      output_config: { effort: "low", format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
      messages: [{ role: "user", content: `Brand rules:\n${numbered}\n\nCopy:\n${text}` }],
    });
    if (response.stop_reason !== "end_turn") {
      throw new Error(`unexpected stop_reason ${response.stop_reason}`);
    }
    this.stats.input_tokens += response.usage?.input_tokens ?? 0;
    this.stats.output_tokens += response.usage?.output_tokens ?? 0;
    const block = response.content.find((b) => b.type === "text");
    const data = JSON.parse(block?.text ?? "") as { verdicts: Array<{ rule_index: number; verdict: BrainVerdict["verdict"]; evidence: string }> };
    const byIndex = new Map(data.verdicts.map((v) => [v.rule_index, v]));
    // A rule the model skipped is "unsure", never silently "ok".
    return rules.map((rule, i) => {
      const answer = byIndex.get(i);
      return answer
        ? { rule, verdict: answer.verdict, evidence: answer.evidence }
        : { rule, verdict: "unsure" as const, evidence: "model gave no answer for this rule" };
    });
  }

  private store(key: string, client: string, text: string, rules: string[], verdicts: BrainVerdict[]) {
    this.cache.set(key, { model: this.model, client, rules, text, source: this.model, verdicts });
    if (this.cachePath) {
      writeFileSync(this.cachePath, JSON.stringify([...this.cache.values()], null, 1), "utf-8");
    }
  }
}
