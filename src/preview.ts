// A self-contained HTML page that shows a gate run the way people would see it:
// the squad digest in Slack, each brief's ClickUp task, the #int alert and the
// client draft. It renders the real run output; nothing is mocked here.
// The page itself lives in preview-template.html; this file only injects the data.

import { readFileSync } from "node:fs";

const TEMPLATE = readFileSync(new URL("./preview-template.html", import.meta.url), "utf-8");

export function previewHtml(results: unknown, clickup: unknown, squadOf: Record<string, string>): string {
  const data = JSON.stringify({ results, clickup, squadOf });
  // Keep "</script>" inside strings from closing the script tag.
  return TEMPLATE.replace("__DATA__", () => data.replaceAll("</", "<\/"));
}
