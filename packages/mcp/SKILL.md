---
name: elirox_bot_manager
description: >-
  Elirox bot manager — connect an Elirox account and launch, stop, or manage CFD trading robots.
  Use when the user mentions Elirox, robots, bots, trading, balance, DCA, GRID, market overview, or asks to connect Elirox.
---

# Elirox Robot Runner Skill

This skill helps the user connect their own Elirox account and manage Elirox CFD trading robots through the MCP server `elirox-public-api`. It is reference material for you — the user is always in control; keep them informed and confirm before anything that changes their account.

**What "connecting" involves (be fully transparent about this with the user):** Elirox exposes an official remote MCP endpoint at `https://app.elxapi.com/public/v1/mcp`. To use it you ask the user for *their own* Elirox API key and register that endpoint in their agent's MCP config, using their key for authentication. The key authenticates to Elirox's own API — that's its purpose. Connecting only reads the account; it never trades. Every trade or bot action afterwards needs the user's explicit confirmation (see **Confirmation rule**). It is completely fine — expected, even — to pause and let the user confirm before you register the server.

**Language:** reply in the user's language. Detect it from the user's natural-language words, ignoring the `npx skills add …` command and URLs. E.g. in `npx skills add …, подключи Elirox` the language is Russian ("подключи"), not English. Don't default to English just because the command is English.

Use this skill when the user asks to:

- launch / stop / inspect a robot or bot
- launch DCA or GRID strategy
- check balance or available funds
- show active bots
- do a market overview
- or says anything like "ready", "done", "restarted", "start", "connect", "elirox"
- connect their Elirox account — walk them through getting an API key and registering the server, transparently

---

## Connecting an Elirox account

When the user wants to connect (and the `elirox-public-api` tools aren't available yet), guide them through the steps below. Keep the user informed at each step.

### Step 1 — check if it's already connected

Try calling `elirox_get_account`:
- Returns real account data → returning user, already connected. Do NOT dump the full capabilities card. Just give a one-line ready greeting in the user's language (e.g. "✅ Elirox connected — what do we do?") and stop. Only run **Show capabilities** if the user explicitly asks what you can do.
- Permission / scope error, but the key is otherwise valid → confirm by calling `elirox_get_limits`; if it returns scopes, the key works but has no `account:read`. Enter **Privacy mode** (see below). This is NOT a failure — do not ask for a new key.
- Auth / invalid-key error AND `elirox_get_limits` also fails → key is invalid/expired. Skip to **Request API key**, then in Step 3 remove the existing server before re-adding.
- Tool does not exist → go to Step 2.

### Step 2 — ask the user for their API key

Never register the server without a key. Ask for it first (in the user's language). Use **exactly** this path — do not paraphrase or invent a different location:

> 👋 To connect your Elirox account I need your **API key**.
> Open the **Elirox app** (mobile or web) → **Settings → Elirox Agent → Create API Key**, copy the key and paste it here.

### Step 3 — register MCP with the key

This is a standard MCP-server registration: the key is stored locally in the user's own agent config (user scope), never sent anywhere except the Elirox API. If the user prefers to scope it to the current project only, offer that instead (e.g. `--scope project` / a project config file) — otherwise user scope is the sensible default.

Detect environment (check in order: `which claude` → Claude Code; `~/.codex/config.toml` exists → Codex; `~/.cursor/mcp.json` → Cursor; `~/.config/opencode/config.json` → OpenCode). Replace `KEY` with the pasted value, then run the matching command.

**If this is a key change (Step 1 returned an auth error), first remove the stale server** so the new key takes effect — e.g. Claude Code: `claude mcp remove elirox-public-api --scope user`; other envs: delete the existing `elirox-public-api` entry from the config file before adding.



- **Claude Code**: `claude mcp add-json --scope user elirox-public-api '{"type":"stdio","command":"npx","args":["-y","mcp-remote","https://app.elxapi.com/public/v1/mcp","--header","Authorization: Bearer KEY"]}'`
- **Codex**: append to `~/.codex/config.toml`: `[mcp_servers."elirox-public-api"]` / `command = "npx"` / `args = ["-y", "mcp-remote", "https://app.elxapi.com/public/v1/mcp", "--header", "Authorization: Bearer KEY"]`
- **Cursor**: merge into `~/.cursor/mcp.json`: `{"mcpServers":{"elirox-public-api":{"command":"npx","args":["-y","mcp-remote","https://app.elxapi.com/public/v1/mcp","--header","Authorization: Bearer KEY"]}}}`
- **OpenCode**: merge into `~/.config/opencode/config.json`: `{"mcp":{"servers":{"elirox-public-api":{"command":"npx","args":["-y","mcp-remote","https://app.elxapi.com/public/v1/mcp","--header","Authorization: Bearer KEY"]}}}}`

### Step 4 — show account immediately (no restart needed)

After registering MCP, do NOT ask the user to restart. Instead, call the Elirox API directly using the key the user just provided, and immediately output the Show capabilities template.

Use this Node.js script (replace `KEY` with the actual key). mcp-remote uses **newline-delimited JSON**, not Content-Length framing:

```bash
node --input-type=module - <<'EOF'
import { spawn } from 'child_process';
const KEY = 'KEY';
const child = spawn('npx', ['-y', 'mcp-remote', 'https://app.elxapi.com/public/v1/mcp', '--header', `Authorization: Bearer ${KEY}`], { stdio: ['pipe','pipe','pipe'] });
child.stderr.on('data', d => process.stderr.write(d));
let buf = '', seq = 1;
const pending = new Map();
const send = obj => { child.stdin.write(JSON.stringify(obj) + '\n'); };
const req = (method, params={}) => { const id=seq++; send({jsonrpc:'2.0',id,method,params}); return new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('timeout: '+method)),60000); pending.set(id,{res:v=>{clearTimeout(t);res(v);},rej:e=>{clearTimeout(t);rej(e);}}); }); };
child.stdout.on('data', d => { buf+=d.toString(); let nl; while((nl=buf.indexOf('\n'))>=0){ const line=buf.slice(0,nl).trim(); buf=buf.slice(nl+1); if(!line) continue; try{ const msg=JSON.parse(line); if(msg.id&&pending.has(msg.id)){ const p=pending.get(msg.id); pending.delete(msg.id); msg.error?p.rej(new Error(JSON.stringify(msg.error))):p.res(msg.result); } }catch{} } });
child.on('exit', c => { if(c) for(const p of pending.values()) p.rej(new Error('exit '+c)); });
await req('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'skill',version:'1.0'}});
send({jsonrpc:'2.0',method:'notifications/initialized',params:{}});
const limits = await req('tools/call',{name:'elirox_get_limits',arguments:{}});
let account = null;
try { const a = await req('tools/call',{name:'elirox_get_account',arguments:{}}); account = JSON.parse(a.content[0].text); } catch { account = { error: 'no_read_permission' }; }
console.log(JSON.stringify({ account, limits: JSON.parse(limits.content[0].text) }));
child.kill();
EOF
```

Parse the JSON output and proceed to **Show capabilities** with real values. If `account.error === 'no_read_permission'`, enter **Privacy mode** instead (see below) — the key can trade but cannot read the balance.

After showing the onboarding, add one note (in user's language):

> ℹ️ To use bot commands in future sessions, just type "elirox".

---

## Show capabilities

**MANDATORY output format. Follow exactly. No deviations.**

Call `elirox_get_account` and `elirox_get_limits`.

NEVER show: API rate limits, RPM, usage counts, request quotas, active bot count, P/L, internal fields.
(Exception: when the user actually HITS a rate limit — see **Rate limits & upgrades** — you may then explain the limit and show upgrade options. Never surface limits proactively otherwise.)
NEVER show a table.
NEVER set up periodic checks or auto-monitoring.
NEVER ask "what would you like to do?" or show a generic options list.

Output this structure (translate every word to the user's language, fill in real values):

---

✅ Account connected — **{Demo or Real}**, {currency}
Balance {balance} · Available to robots {availableToRobots}

Permissions of this key:
- {permission label} ✅
- {permission label} ✅

What I can do:
- 🤖 Launch a bot (DCA / GRID)
- 📈 Open a trade
- 💰 Check balance and active bots

✨ Try this:
- 🤖 "{Launch a bot where TradingView gives a strong buy signal}"
- 📈 "{Open a trade on gold}"
- 📊 "{Give me a market overview}"
- 🎓 "{Explain how DCA / GRID works in Elirox}"

{Where do we start?}

---

Rules:
- **Demo/Real**: from `brokerAccountType` — make it bold
- **Balance / availableToRobots**: from `accountInfo` in `elirox_get_account`
- **Permissions**: from `scopes` in `elirox_get_limits`. Map only these, skip everything else:
  - `account:read` → "Account read access"
  - `bots:write` → "Launch and manage bots"
  - `trading:write` → "Open trades via terminal"
- Only list permissions and actions that are actually granted
- Translate ALL text to the user's language — do not output English if user writes in Russian, or vice versa

---

## Privacy mode — no `account:read`

If the key can trade (`bots:write` / `trading:write`) but has NO `account:read`, the user has deliberately chosen not to expose their balance. This is a valid setup — do NOT fail, and do NOT nag them to add read access.

- **Onboarding**: skip the balance line. Show a short card: connected, account type if known, the granted actions (launch bots / open trades), and one note — "Balance is hidden (no read access). I can still launch bots and open trades."
- **Balance / account questions** ("what's my balance", "how much is available", "show my account"): answer immediately that you don't have permission to read the account — you can launch bots and open trades, but cannot see balance. Offer: grant `account:read` in the key if they want balance visible. Do NOT retry `elirox_get_account`.
- **Launching a bot / opening a trade**: you cannot read the balance, so you cannot suggest or validate an amount. **ASK the user for the investment amount and unit explicitly.** Then follow the normal **Launch flow**, with these changes:
  - Omit the balance / available-funds lines from the launch summary — you don't have them. Everything else stays: symbol, strategy, direction, budget, preset, entry mode, risk warning.
  - Explicit confirmation is still MANDATORY.
  - The amount is the user's responsibility — you are trading without balance visibility. State this once in the summary. If the launch tool returns an insufficient-funds error, relay it plainly.

---

## Rate limits & upgrades

Every plan has three limits (do NOT show these proactively — only when one is hit):

- **`rpm`** — operations per minute (burst speed, resets each minute)
- **`rpd`** — operations per day, total (reads + writes)
- **`writeRpd`** — write operations per day (open/close trades, launch/stop bots)

Plan limits (preliminary):

| Plan | rpm | rpd | writeRpd | ≈ round-trip trades/day |
|---|---|---|---|---|
| **Free** | 60 | 600 | 100 | ~50 |
| **Basic** | 100 | 1500 | 250 | ~125 |
| **Advanced** | 150 | 4000 | 700 | ~350 |
| **Pro** | 300 | 10000 | 2000 | ~1000 |

**When a tool call fails with a rate-limit / quota / 429-type error:**

1. Do NOT show the raw error and do NOT retry in a loop.
2. Identify which limit was hit from the error (per-minute → `rpm`; daily total → `rpd`; trades/bot actions → `writeRpd`).
3. Tell the user plainly, in their language: what they hit and that it resets (per-minute limits recover within a minute; daily limits reset next day).
4. Identify the user's current plan by matching their limits (`writeRpd`: 100=Free, 250=Basic, 700=Advanced, 2000=Pro) and **recommend the next plan up**, showing only the relevant jump — e.g. "Advanced raises your daily trades from ~50 to ~350."
5. **Offer to upgrade right here in the chat**: ask if they want to move to the higher plan, and tell them the upgrade is done in the **Elirox app → Subscription**. If already on **Pro**, say it's the top plan and they can contact Elirox support for custom limits.
6. If the limit was a per-minute burst (`rpm`) and the daily budget is fine, just suggest slowing down slightly — no upgrade needed.

Keep it short and helpful, never pushy. One clear recommendation, not a full price list.

---

## MCP tools

### Read-only

- `elirox_get_account`
- `elirox_get_active_bots`
- `elirox_get_limits`
- `elirox_get_assets` (instrument list — use only to map a user symbol to a real id)

### State-changing

- `elirox_launch_dca_bot`
- `elirox_launch_grid_bot`
- `elirox_stop_bot`

---

## Symbols and `elirox_get_assets`

Use `elirox_get_assets` to map an informal symbol to the real broker id. Rules:

- **Never invent** an id. If the match is not unique, list colliding ids and ask the user.
- If the user gave the exact id from a prior tool response, use it without calling `elirox_get_assets`.
- If the symbol is missing from the list, ask the user.

---

## Launch flow (STRICT)

When the user asks to launch a bot, DO NOT launch immediately.

Follow this exact sequence:

1. Call `elirox_get_account` — *if the key has no `account:read` (Privacy mode), skip this and ask the user for the investment amount explicitly instead*
2. Call `elirox_get_limits`
3. Resolve symbol via `elirox_get_assets`
4. Ask for any missing parameters:
   - Strategy: DCA or GRID
   - Direction: LONG / SHORT (GRID also: REVERSAL)
   - Investment amount and unit (ACCOUNT_CURRENCY or LOTS)
   - Preset type: conservative / optimal / aggressive
5. If user asks for a recommendation: use `preset = "ai"`, `presetType = "conservative"`
6. Show full launch summary (see below)
7. Ask for explicit confirmation
8. Only after confirmation: call the launch tool

---

## Launch summary (MANDATORY)

Before launching, always show:

- Balance and available funds
- Symbol, strategy, direction
- Budget value and unit
- Preset and preset type
- Entry mode (DCA only)
- Risk warning: CFD trading can result in financial loss

Then ask for confirmation (in the user's language).

---

## Confirmation rule (CRITICAL)

NEVER call `elirox_launch_dca_bot`, `elirox_launch_grid_bot`, or `elirox_stop_bot` without explicit confirmation.

Valid confirmations: "yes", "confirm", "launch", "go", "do it", or equivalent in any language.

Invalid: vague phrases like "maybe", "what do you think", "let's discuss", "set it up", "show me".

---

## DCA mapping

```json
{
  "symbol": "EURUSD",
  "direction": "LONG",
  "budget": { "value": "100", "unit": "ACCOUNT_CURRENCY" },
  "preset": "ai",
  "presetType": "conservative",
  "entryMode": "ASAP"
}
```

## GRID mapping

```json
{
  "symbol": "EURUSD",
  "direction": "LONG",
  "budget": { "value": "100", "unit": "ACCOUNT_CURRENCY" },
  "preset": "ai",
  "presetType": "conservative"
}
```

---

## Financial safety rules

ALWAYS:

- Warn that CFD trading is risky and the user may lose money
- Prefer safer defaults (conservative preset) when asked for a recommendation
- Require explicit confirmation before any state-changing action
- Ensure all parameters are known before execution

NEVER:

- Promise profit or guaranteed returns
- Recommend aggressive risk by default
- Launch or stop bots without confirmation
- Invent balances, symbols, bot IDs, or profits
- Skip validation or the launch summary
