// Run the production gate on a batch of briefs and write the outputs.
//
//   npm run gate                               # test data, cached Brain answers only
//   npm run gate -- --live                     # also call the model on cache misses
//   npm run gate -- --now 2026-10-14T09:00:00Z

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { BrainChecker } from "./brain.ts";
import { isoUtc } from "./dates.ts";
import { Gate } from "./gate.ts";
import { BLOCKED, PASS, kindOf, type Brief, type Client, type Quota } from "./models.ts";
import { previewHtml } from "./preview.ts";
import { clickupAction, groupBySquad, markdownReport, shortReason, slackAlert, slackDigest, slug } from "./render.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values: args } = parseArgs({
    args: argv,
    options: {
      data: { type: "string", default: join(ROOT, "data", "option_b_gate") },
      out: { type: "string", default: join(ROOT, "out") },
      cache: { type: "string", default: join(ROOT, "cache", "brain_cache.json") },
      now: { type: "string" },
      live: { type: "boolean", default: false }, // call the model on Brain-cache misses (needs Anthropic credentials)
    },
  });

  const briefs = readJson<Brief[]>(join(args.data, "briefs.json"));
  const clients = new Map(readJson<Client[]>(join(args.data, "clients.json")).map((c) => [c.client, c]));
  const brain = new BrainChecker({ cachePath: args.cache, live: args.live });
  const gate = new Gate(clients, brain, args.now ? new Date(args.now) : undefined);
  const verdicts = await gate.run(briefs);
  const now = gate.now;

  const quotas: Record<string, Quota> = {};
  for (const name of clients.keys()) quotas[name] = gate.quotaSnapshot(name);
  const results = {
    checked_at: isoUtc(now),
    summary: {
      checked: verdicts.length,
      queued: verdicts.filter((v) => v.status === PASS).length,
      blocked: verdicts.filter((v) => v.status === BLOCKED).length,
      brain: brain.stats,
    },
    quota_after_run: quotas,
    briefs: verdicts.map((v) => ({ ...v, kind: kindOf(v) })),
  };
  const clickup = verdicts.map((v) => clickupAction(v, now));

  writeJson(join(args.out, "results.json"), results);
  writeJson(join(args.out, "clickup_actions.json"), clickup);
  for (const [squad, group] of groupBySquad(verdicts)) {
    const squadQuotas = Object.fromEntries(Object.entries(quotas).filter(([name]) => clients.get(name)!.squad === squad));
    writeJson(join(args.out, "slack", `digest_${slug(squad)}.json`), slackDigest(squad, group, squadQuotas, now));
  }
  writeJson(join(args.out, "slack", "alerts.json"), verdicts.filter((v) => v.status === BLOCKED).map(slackAlert));
  writeFileSync(join(args.out, "report.md"), markdownReport(verdicts, quotas, brain.stats, now), "utf-8");
  const squadOf = Object.fromEntries([...clients].map(([name, c]) => [name, c.squad]));
  writeFileSync(join(args.out, "preview.html"), previewHtml(results, clickup, squadOf), "utf-8");

  const blocked = verdicts.filter((v) => v.status === BLOCKED);
  console.log(`${verdicts.length} briefs: ${verdicts.length - blocked.length} queued, ${blocked.length} blocked. Outputs in ${args.out}`);
  for (const v of blocked) console.log(`  ${v.brief_id.padEnd(6)} ${v.client.padEnd(16)} ${shortReason(v)}`);
  return 0;
}

// Run only when executed directly (node src/cli.ts), not when a test imports main().
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
