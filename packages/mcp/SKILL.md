---
name: elirox_bot_manager
description: >-
  Elirox bot manager — connect an Elirox account and launch, stop, or manage CFD trading robots.
  Use when the user mentions Elirox, robots, bots, trading, balance, DCA, GRID, market overview, or asks to connect Elirox.
---

# Elirox Robot Runner Skill

Reference for connecting a user's Elirox account and managing Elirox CFD trading robots via the `elirox-public-api` MCP server. The user is always in control: keep them informed, and confirm before anything that changes their account (see **Confirmation rule**).

**Connecting, transparently:** Elirox has an official remote MCP endpoint `https://app.elxapi.com/public/v1/mcp`. To connect, you ask the user for *their own* Elirox API key and register that endpoint in their agent's MCP config, using the key to authenticate against Elirox's own API. Connecting only reads the account — it never trades. It's fine to pause for the user to confirm before registering.

**Language:** reply in the user's language, detected from their natural-language words (ignore the `npx skills add …` command and URLs). E.g. in `npx skills add …, подключи Elirox` → Russian. Don't default to English just because the command is English. **Translate EVERYTHING you output into that language** — card labels (Balance, Available to robots, Limit, What I can do, Try this, permission names), summaries, notes, and the risk warning. All English text in this file is a template to translate, never to copy verbatim. Never mix languages in one message.

---

## Connecting

Guide the user through this when they want to connect and the `elirox-public-api` tools aren't loaded yet.

**1 — Already connected?** Call `elirox_get_account`:
- Real account data → already connected. Give a one-line greeting; run **Show capabilities** only if the user asks what you can do.
- Permission/scope error but `elirox_get_limits` works → valid key without `account:read` → **Privacy mode**. Not a failure; don't ask for a new key.
- Both calls fail (auth error) → invalid/expired key → ask for a new one; remove the stale server before re-adding in step 3.
- Tool doesn't exist → go to step 2.

**2 — Ask for the API key** (never register without one). Use **exactly** this path — do not paraphrase:

> 👋 To connect your Elirox account I need your **API key**.
> Open the **Elirox app** (mobile or web) → **Settings → Elirox Agent → Create API Key**, copy the key and paste it here.

**3 — Register the MCP server.** Standard registration: the key is stored locally in the user's own config (user scope), sent only to Elirox. Offer project scope (`--scope project`) if they prefer. On a key change (step 1 auth error), first remove the stale server — Claude Code: `claude mcp remove elirox-public-api --scope user`; other envs: delete the existing entry. Detect the env and run the match (replace `KEY`):

- **Claude Code**: `claude mcp add-json --scope user elirox-public-api '{"type":"stdio","command":"npx","args":["-y","mcp-remote","https://app.elxapi.com/public/v1/mcp","--header","Authorization: Bearer KEY"]}'`
- **Codex** (`~/.codex/config.toml`): `[mcp_servers."elirox-public-api"]` / `command = "npx"` / `args = ["-y", "mcp-remote", "https://app.elxapi.com/public/v1/mcp", "--header", "Authorization: Bearer KEY"]`
- **Cursor** (`~/.cursor/mcp.json`): `{"mcpServers":{"elirox-public-api":{"command":"npx","args":["-y","mcp-remote","https://app.elxapi.com/public/v1/mcp","--header","Authorization: Bearer KEY"]}}}`
- **OpenCode** (`~/.config/opencode/config.json`): `{"mcp":{"servers":{"elirox-public-api":{"command":"npx","args":["-y","mcp-remote","https://app.elxapi.com/public/v1/mcp","--header","Authorization: Bearer KEY"]}}}}`

**4 — Show the account without a restart.** Don't ask the user to restart. Call the API directly with the key via this script (mcp-remote uses newline-delimited JSON), parse the output, then go to **Show capabilities**. If `account.error === 'no_read_permission'` → **Privacy mode**.

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

After the card, add one note (user's language): "ℹ️ Next time, just type "elirox" to jump back in."

---

## Show capabilities

Call `elirox_get_account` + `elirox_get_limits`. Output exactly this block, translated to the user's language, with real values:

---

✅ Account connected — **{Demo or Real}**, {currency}
Balance {balance} · Available to robots {availableToRobots}
Limit: {writeRpd} actions/day (trades and bot launches)

Permissions of this key:
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

Fill from tool output:
- **Demo/Real** (bold) from `brokerAccountType`; **balance / availableToRobots** from `accountInfo`; **limit** = `writeRpd`.
- **Permissions** from `scopes`, listing only granted ones: `account:read` → "Account read access", `bots:write` → "Launch and manage bots", `trading:write` → "Open trades via terminal".

Show only that one limit line. Never surface `rpm`/`rpd`, usage numbers, quotas, active-bot counts, P/L, internal fields, a table, or a generic "what would you like to do?" list. (Exception: explaining a limit when one is actually hit — see **Rate limits**.)

---

## Privacy mode (no `account:read`)

Key can trade (`bots:write` / `trading:write`) but can't read the balance — a deliberate user choice. Don't fail or nag.

- **Onboarding**: skip the balance line; show a short card plus "Balance is hidden (no read access) — I can still launch bots and open trades."
- **Balance questions**: say you don't have read permission; offer to add `account:read`. Don't retry `elirox_get_account`.
- **Trades/bots**: you can't see the balance, so **ask the amount explicitly**, then follow the normal flow — omit balance from the summary, note the amount is the user's responsibility, and relay any insufficient-funds error plainly.

---

## Rate limits & upgrades

Plans (preliminary):

| Plan | rpm | rpd | writeRpd | ≈ round-trip trades/day |
|---|---|---|---|---|
| **Free** | 60 | 600 | 100 | ~50 |
| **Basic** | 100 | 1500 | 250 | ~125 |
| **Advanced** | 150 | 4000 | 700 | ~350 |
| **Pro** | 300 | 10000 | 2000 | ~1000 |

`elirox_get_limits` returns live `usage` (`writeDay`/`day`/`minute` remaining). Two moments to act; never nag between them.

**Approaching** — only when a state-changing action would use up most of what's left (the batch is ≥ remaining daily actions, or `writeDay.remaining` is under ~20% of `writeRpd`); not on ordinary actions with headroom. Offer a choice, don't block:
1. **Upgrade now** — show the jump (e.g. "Advanced: ~50 → ~350 actions/day").
2. **Continue** on the current plan — but say plainly that once daily actions run out, trades/bot actions stop until reset (next day) or upgrade.

**Hit** — a call fails with a rate-limit / quota / 429 error. Don't dump the raw error or retry in a loop. Then:

1. Say plainly what's exhausted and when it resets.
2. **Always recommend an upgrade, explicitly and with numbers** — don't just say "upgrade in the app". Identify the current plan by `writeRpd` (100/250/700/2000 = Free/Basic/Advanced/Pro) and name the **next plan up with its actual limits** from the plans table (its actions/day and ≈ trades/day). Recommend it and say the upgrade is done in the **Elirox app → Subscription**.
3. A pure per-minute (`rpm`) burst just needs a minute's wait — no upgrade.

Concrete shape (translate to the user's language):

> You're on **Free** — 100 actions/day, used up (resets 2026-07-02 00:00 UTC).
> To keep going today, upgrade to **Advanced**: 700 actions/day (~350 round-trip trades/day).
> Upgrade in the **Elirox app → Subscription**.

If already on **Pro**, say it's the top plan and they can contact Elirox support for custom limits. Keep it short — the next tier only, not the whole price list.

---

## Tools

**Read:** `elirox_get_account`, `elirox_get_active_bots`, `elirox_get_limits`, `elirox_get_assets`, `elirox_get_last_price`, `elirox_get_opened_orders`, `elirox_get_pending_orders`, `elirox_get_tradingview_webhook`.

**State-changing (all require confirmation):** `elirox_launch_dca_bot`, `elirox_launch_grid_bot`, `elirox_launch_tradingview_bot`, `elirox_stop_bot`, `elirox_create_order`, `elirox_close_order` (`orderId`), `elirox_cancel_order` (`orderId`). There is no "modify order" tool — edit via the primitives (see **Opening / closing a trade**).

**Symbols:** map an informal name to a broker id via `elirox_get_assets`. Never invent an id; if the match is ambiguous, list the colliding ids and ask. Use an exact id the user already gave without re-fetching. If it's missing from the list, ask.

---

## Launching a bot

Never launch immediately. Sequence:

1. Read account (skip in Privacy mode — ask the amount instead) → `elirox_get_limits` → resolve symbol via `elirox_get_assets`.
2. Ask for missing params: strategy (DCA / GRID); direction (LONG / SHORT; GRID also REVERSAL); amount + unit (`ACCOUNT_CURRENCY` or `LOTS`); preset type (conservative / optimal / aggressive). For a recommendation use `preset:"ai"`, `presetType:"conservative"`.
3. Show the summary: balance & available funds, symbol/strategy/direction, budget + unit, preset, entry mode (DCA only), and one short risk line (see **Risk warning**).
4. Confirm (see **Confirmation rule**), then call the launch tool.

DCA params (GRID = the same **without** `entryMode`):

```json
{ "symbol": "EURUSD", "direction": "LONG", "budget": { "value": "100", "unit": "ACCOUNT_CURRENCY" }, "preset": "ai", "presetType": "conservative", "entryMode": "ASAP" }
```

---

## Opening / closing a trade

Never place an order immediately. Sequence: read account (skip in Privacy mode — ask the amount) → resolve symbol → optionally `elirox_get_last_price` to show the price → gather params → show the summary (symbol, side, volume, order type, price/limit, SL/TP, and one short risk line — see **Risk warning**) → confirm → `elirox_create_order` / `elirox_close_order` / `elirox_cancel_order`.

`elirox_create_order` (required: `symbol`, `type`, `volume`; live schema wins if it ever differs):
- `type` — `ORDER_TYPE_BUY` / `ORDER_TYPE_SELL` (market) or `ORDER_TYPE_LIMIT_BUY` / `ORDER_TYPE_LIMIT_SELL` (limit)
- `volume` — number, lots, > 0
- `limitPrice` — required for the LIMIT types; `takeProfitPrice` / `stopLossPrice` — optional

`elirox_close_order` / `elirox_cancel_order` take an `orderId` from `elirox_get_opened_orders` / `elirox_get_pending_orders` — never invent one.

```json
{ "symbol": "XAUUSD", "type": "ORDER_TYPE_BUY", "volume": 0.01, "stopLossPrice": 2300.0 }
{ "symbol": "EURUSD", "type": "ORDER_TYPE_LIMIT_SELL", "volume": 0.10, "limitPrice": 1.1200, "takeProfitPrice": 1.1100 }
{ "orderId": "<id from a read tool>" }
```

**Many identical orders** ("open 50 trades"): 50 identical market orders on one symbol is usually one bigger position split up — clarify intent (one combined position / a DCA-GRID bot / genuinely N separate orders) and ask direction. Don't lecture on write cost; mention the daily limit only if the count would exceed remaining actions, then offer fewer. Never loop orders without an explicit confirmed count.

**Editing an order** (no modify tool): pending order → `cancel_order` then `create_order` with new params; open position → partial `close_order` to reduce, `create_order` to add, SL/TP via schema fields or close+reopen. Show a **before → after** diff and confirm once. Never cancel-then-recreate silently (price moves between); if the cancel succeeds but the re-create fails, tell the user the old order is gone and nothing new was placed.

---

## TradingView bot

`elirox_launch_tradingview_bot` mirrors a TradingView strategy. Flow: `elirox_get_tradingview_webhook` → get the CONTROL webhook (id + URL), tell the user to point their strategy alert at it → ask for `symbol` + a `volume` cap → summary + risk warning → confirm → launch.

Params: `symbol` (string); `volume` (**string** — max total open lots, e.g. `"0.10"`); `tvWebhookID` (string — the CONTROL id); optional `pauseSettings` (array to pause around high/medium news or session end). Note `volume` is a string here, unlike `elirox_create_order` where it's a number.

---

## Confirmation rule (CRITICAL)

Never call any state-changing tool without explicit confirmation: `elirox_launch_dca_bot`, `elirox_launch_grid_bot`, `elirox_launch_tradingview_bot`, `elirox_stop_bot`, `elirox_create_order`, `elirox_close_order`, `elirox_cancel_order`.

Valid: "yes", "confirm", "launch", "go", "do it", or the equivalent in any language. Not valid: vague phrases like "maybe", "what do you think", "set it up", "show me".

---

## Risk warning

Include one short risk line (that CFD trading can lose money), **in the user's language**, ONLY in the pre-execution confirmation summary. Do NOT repeat it on result messages, status updates, read answers, or the onboarding card — one mention per action, not on every message.

## Safety

Always: prefer conservative defaults when recommending; know every parameter before executing; confirm before any state-changing action. Never: promise profit or guaranteed returns; default to aggressive risk; or invent balances, symbols, order/bot ids, or profits.
