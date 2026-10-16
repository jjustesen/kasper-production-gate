# Kāsper AI Tech Lead: Technical Test (v2)

**Time:** about 6 hours in total: about 4.5 hours building one option, and about 1.5 hours on two one-page designs (about 45 minutes each). Submit within 3 days. **Then:** a 30-minute call to walk us through it.

## 1. Who we are
Kāsper is a creative subscription agency for DTC and e-commerce brands. We make static and video ads, including UGC, for clients in the US and UK. Most of our creative team is in Brazil. We work in two squads. Each squad has a **Squad Lead**, who owns delivery, capacity, deadlines and QA, and a **Creative Lead**, who owns the client relationship and the creative strategy. Every task moves through a fixed pipeline in ClickUp:

`Queued → In Progress → Ready For Review (Squad Lead QC) → With Quality Control → Sent to Client → Revisions or Approved`

Our rules include:
- Reply to clients within 2 hours.
- Get clarifications the same day.
- Tell the client before a task is late, never after.
- Nothing goes into production until the brief is ready.

## 2. Our infrastructure (read this before you design anything)

### The tools we already pay for
- **ClickUp:** one Space per client. Every creative task lives here, with statuses, assignees, due dates, comments and full status history. ClickUp has its own **native automations** ("when the status changes to X, assign Y / post a comment / move the task"). They're included in our plan, up to a monthly action limit.
- **Slack:** a shared channel per client (`#ext-<client>`), an internal channel per client (`#int-<client>`) and squad channels.
- **Google Drive:** the Client Folders shared drive holds brand assets, briefs and delivered work.
- **Pipedrive:** our CRM. A deal marked *Won* is when a client becomes real.
- **Supabase (Postgres) + Vercel:** the database and hosting behind our internal apps. Scheduled jobs (cron) and small serverless functions are close to free at our scale.

### Kāsper Creative Studio
Our in-house AI image and video generation tool (studio.heykasper.com). It runs on Next.js, Supabase and Vercel, and calls third-party model APIs such as Kie, Higgsfield and fal.ai. A designer picks a client, and the Studio loads that client's **brand kit** (colours, fonts, logos), **product catalog** (SKUs, packshots, prices) and **Client Brain**, then generates statics and videos. It has an **MCP server**, so AI assistants can create clients, import catalogs and start generations.
- Almost all Studio code is written by AI coding agents (Claude Code and Codex) working from ClickUp tasks and opening PRs. We're stabilising it right now, so **any change to the Studio itself is a PR that someone has to review**. Prefer to call it rather than change it.
- Every generation costs real money in model-API fees, so anything that triggers generations automatically needs a spend limit.

### Client Brain
A live wiki doc for each client (a Google Doc). It's the single source of truth for "what do we know about this client": brand rules, approvers, claims we can and can't make, product notes, preferences and history.
- **Every fact carries a source link** (a Slack message, a call transcript timestamp, a ClickUp comment, an email). A fact without a source doesn't go in.
- When two sources disagree, the newer, more authoritative one wins, and the conflict is noted for the Creative Lead.
- The Brain is read by people, by the Studio, and by the bots. A wrong fact in the Brain spreads everywhere.

### Grok Bot
Our AI agent platform. A Grok Bot is an agent with a job description, connected to ClickUp, Slack, Gmail, Drive, Notion and Pipedrive. It runs on a schedule or when something happens. It can read across all those tools, reason and take actions. That makes it powerful, and also **the most expensive way we have to do anything**. Each run uses a frontier model plus tool calls, and the same bot running every hour, for every person, adds up fast. Bots running today:
- **Client Health:** flags at-risk clients from slow replies, tone and stalled requests.
- **Call Prep and Call Wrap:** briefs before client calls, notes and follow-ups after.
- **Kāsper Brain:** keeps each client's Brain current from Slack, calls and ClickUp.
- **Studio bots:** uptime, test health, releases, and feeding the coding agents.
- **A personal chief of staff** for one founder (not team-facing).

### Team-lead bots (where we're going)
Each **Squad Lead** and **Creative Lead** will get their own Grok Bots, built from **shared templates and SOPs** (for example, "Squad Lead morning briefing" or "Creative Lead client follow-ups"). One template becomes N copies, so a template that costs about $0.25 a run, 10 runs a day, for 6 leads, is roughly $450 a month. Today we have 3 people in those roles; assume 6 once we reach about 25 clients. The cost grows with every template and lead we add. The tech lead decides what goes into those templates, and, just as important, what gets done before the bot runs, so that the bot only does the part that needs judgment.

### Hosted LLM APIs (allowed)
You may call **cheap, small hosted models through their APIs** (any provider) for any part that needs language understanding but not a frontier model or a Grok Bot. Examples: classifying a message, pulling fields out of a transcript, or checking copy against a rule list. You may also call frontier models through their APIs where they're really needed. Name the model and say what it costs.

### Pick the cheapest tool that does each job reliably
Our order of preference for every part of a solution:

**rules or plain code → native ClickUp automations → a cheap API model → a frontier model → a Grok Bot**

Step up a level only when the cheaper option can't do that part reliably, and say why. Grok Bot is expensive to run as a routine, so it should be the last step: the judgment-heavy, multi-tool part, and only after code has done the filtering.

**Cost assumptions to use** (made-up but realistic. Use them so answers are comparable, or replace them with your own and say so):

| Option | Assume |
|---|---|
| Scheduled script or serverless function on our stack | ~$0 at our volume |
| ClickUp native automation | Included, up to 10,000 actions a month |
| Cheap API model (short call, ~1–2k tokens) | ~$0.001 per call |
| Frontier model API (typical 10–20k token job) | ~$0.02–$0.10 per call |
| Grok Bot run (reads several tools, reasons, acts) | ~$0.10–$0.50 per run |

**Our volume:** about 1,500 tasks and 3,000 client Slack messages a month, about 400 briefs a month, 2–3 new clients a month, 6 active clients in this data set (about 25 in real life), and 12 people across 2 squads.

## 3. The options
Pick **one** option to **build** (about 4.5 hours). For the other two, write a **one-page design** each (about 45 minutes each). All the data is made up. Assume "today" is **Tuesday 2026-10-13, 09:00 UTC**. Status-history timestamps are in UTC. People work in their own time zones (`data/option_c_health/people.json`).

### Option A: Automated onboarding for a new client (Halden Outdoor)
**Problem:** onboarding a new client takes about 6 hours of manual work across 3 people (`kasper_onboarding_sop.md`). Facts get copied wrong from the intake form into the Brain and the Studio, and conflicts are found only when the client rejects the first batch.

**Your job:** Halden Outdoor's deal was marked *Won* yesterday. Build the tool that turns a won deal into a ready-to-produce client:
1. **The setup plan:** the exact actions to create the ClickUp Space and lists, the Slack channels, the Drive folders, the Studio client (brand kit and catalog import) and the recurring tasks. Output these as a dry-run list of API calls or actions. You don't need real API access.
2. **A first draft of the Client Brain**, with a source on **every** fact.
3. **A conflicts-and-gaps list** for the Creative Lead to resolve before production, ranked by risk.
4. **The welcome message** to the client channel.

**Data:** `data/option_a_onboarding/`: the Pipedrive deal, the intake form, the kickoff call transcript, the product catalog, the 2024 brand guidelines, emails and our SOP. The sources disagree with each other on purpose.

### Option B: Production gate (30 briefs)
**Problem:** briefs enter production with missing formats, banned claims, discontinued products or impossible deadlines. The designer finds out halfway through, or the client rejects the work.

**Your job:** build the gate that checks every new brief against our Definition of Ready (`definition_of_ready.md`) and decides whether it **passes** or is **blocked**. Every block needs a clear reason and a ready-to-send clarification message for the client. Run it on the 30 briefs in `briefs.json`, using `clients.json` (plans, usage, catalogs, banned claims, Brain rules). Some briefs look wrong but are fine, and some look fine but aren't.

**Data:** `data/option_b_gate/`.

### Option C: Squad and employee health
**Problem:** Squad Leads find out someone is overloaded, slipping or burning out only when deadlines are missed or the person says so. Founders can't see when a squad needs another person.

**Your job:** build a weekly health report from the last 4 weeks of work (Sep 14 – Oct 11):
1. **Per squad**, for the founders: capacity against demand, backlog trend, on-time rate. Does a squad need help?
2. **Per person**, for **their Squad Lead only**: workload against capacity, after-hours and weekend work, quality signals, and who needs a check-in. Say **why** for each flag.

Decide what each output looks like and who sees it.

**Definitions to use:** a task counts in the Monday–Sunday week (UTC) in which it was **first** moved to `Sent to Client`. A task is **late** if that first `Sent to Client` falls on a UTC date after its `due_date`.

**Data:** `data/option_c_health/`: people (roles, time zones, capacity in points a week, start dates), PTO, about 200 delivered tasks with points, assignee history, revisions with reason codes, QC returns and status events, weekly queue snapshots, and a few internal squad Slack messages.

`data/team.json` has the squads and their clients.

## 4. What to deliver
1. **For the option you build:**
   - A **working tool** (any language) that reads the data and produces the outputs above. The outputs are the Slack messages, docs or JSON you would post or create (Markdown or Block Kit is fine). You don't need to post anything for real.
   - **Tests** for the core logic, including the tricky cases you found in the data.
   - A short **`NOTES.md`** with these **5 required sections**:
     1. your approach, and why it's the **cheapest reliable** way to solve this,
     2. a **tool-per-job table**: each part of the solution, the level you chose (rules or code → ClickUp automation → cheap API model → frontier model → Grok Bot), and why the cheaper levels weren't enough,
     3. where (if anywhere) you used an LLM: which model (cheap API, frontier, or Grok Bot), what for, why, and **what it costs a month at our volume**, including what it would cost if it ran in every team-lead bot,
     4. **where it should live:** a ClickUp automation, a scheduled script on our stack, a Grok Bot or team-lead bot template, the Studio (via its MCP or API), or a mix, and why,
     5. every assumption you made about unclear data.

     Optional, a line or two each if you have time: what breaks it and how you'd monitor it, and what you chose **not** to build.
2. **For each of the other two options**, a **one-page design**: the approach, the tool-per-job table, the monthly cost estimate, the traps you'd expect in real data, and the first thing you'd build.

## 5. How we score it (out of 25)
| | Points |
|---|---|
| **Correctness:** the built option works on our data, including the edge cases and traps | 6 |
| **Cost and tool-per-job judgment:** each part uses the cheapest level that does it reliably (rules or code → ClickUp automation → cheap API model → frontier model → Grok Bot), with a realistic monthly cost, including at N team-lead bots. Grok Bot is used only for judgment work, after code has filtered the input. | 6 |
| **Workflow understanding:** the outputs make sense to a Squad Lead, Creative Lead or founder. The thresholds, who sees what, and what happens next are all clear. | 5 |
| **Code quality, tests, clarity** | 4 |
| **The two one-page designs:** sound, costed, and they spot the real risks | 4 |

**Red flags:**
- Sending every record through an LLM.
- Using a frontier model or a Grok Bot where code or a cheap API model would do.
- No cost figures, or costs that ignore the per-lead multiplier.
- Building a platform when a script would do.
- Changing the Studio when calling it would do.
- Letting an LLM decide numbers, quotas or dates.
- Not stating your assumptions.

## 6. Rules
- Use any tools you like, including AI coding assistants. We'll ask you to explain every line.
- If something's unclear, make a sensible assumption and write it down. That's part of the test.
- Submit a GitHub repo link (public, or shared with us).
