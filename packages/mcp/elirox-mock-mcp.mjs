#!/usr/bin/env node
/**
 * Elirox Mock MCP — локальный аналог боевого MCP для тестов скилла/онбординга.
 * Без зависимостей: stdio + JSON-RPC 2.0 (newline-delimited), как требует MCP.
 *
 * Запуск:        node elirox-mock-mcp.mjs
 * Сценарий ключа: ELIROX_MOCK_SCENARIO = full (по умолч.) | readonly | no-key
 *   full    — все scopes (запуск ботов и сделки разрешены)
 *   readonly— только *:read (write-операции вернут ошибку прав)
 *   full,   readonly эмулируют разные API-ключи; no-key — будто ключ не дан (для онбординга)
 *
 * ВАЖНО: stdout — это канал протокола. Любые логи — только в stderr.
 */

const SCENARIO = process.env.ELIROX_MOCK_SCENARIO || "full";
const log = (...a) => process.stderr.write("[mock] " + a.join(" ") + "\n");

// ── фейковое состояние (в памяти на время сессии) ──────────────────────────
const SCOPES = {
  full: ["account:read", "bots:read", "bots:write", "limits:read", "trading:read", "trading:write", "quotes:read"],
  readonly: ["account:read", "bots:read", "limits:read", "trading:read", "quotes:read"],
  "no-key": [],
}[SCENARIO] || [];

const ACCOUNT = {
  id: "66fd6c98900d0d73161d87aa", login: "999618761727884400000",
  broker: "Demo", status: "active", brokerAccountType: "demo",
  tradingProvider: "DEMO_EXCHANGE", currency: "USD",
  balance: 53025.72, availableToLaunch: 44172.2,
  accountInfo: { currency: "USD", balance: 53025.72, equity: 48181.05, freeMargin: 47867.06,
                 leverage: 1000, tradeAllowed: true, availableToRobots: 44172.2, investedToRobots: 1684 },
};

const ASSETS = [
  { id: "US30", description: "Dow Jones 30 Index", group: "INDICES", strategies: ["DCA", "GRID"] },
  { id: "GER40", description: "DAX 40 Index", group: "INDICES", strategies: ["DCA", "GRID"] },
  { id: "XAUUSD", description: "Gold vs US Dollar", group: "METALS", strategies: ["DCA", "GRID"] },
  { id: "EURUSD", description: "Euro vs US Dollar", group: "FOREX", strategies: ["DCA", "GRID"] },
  { id: "BTCUSD", description: "Bitcoin vs US Dollar", group: "CRYPTO", strategies: ["DCA", "GRID"] },
  { id: "AAPL.NAS", description: "Apple Inc", group: "STOCKS", strategies: ["DCA"] },
  { id: "AMZN.NAS", description: "Amazon.com Inc", group: "STOCKS", strategies: ["DCA"] },
  { id: "MSFT.NAS", description: "Microsoft Corp", group: "STOCKS", strategies: ["DCA"] },
];

const PRICES = { US30: 51854.1, GER40: 24887.0, XAUUSD: 4010.3, EURUSD: 1.1369, BTCUSD: 61650.5, "AAPL.NAS": 293.08 };

let bots = [];
let orders = [];
let seq = 1;
const id6 = (p) => p + String(seq++).padStart(6, "0");

const need = (scope) => {
  if (SCENARIO === "no-key") return "NO_KEY";
  if (!SCOPES.includes(scope)) return "FORBIDDEN";
  return null;
};

// ── реализация тулов ────────────────────────────────────────────────────────
const TOOLS = {
  elirox_get_account: {
    description: "Read the account bound to the API key (balance, available funds).",
    run: () => SCENARIO === "no-key"
      ? { error: "Missing or invalid API key" }
      : ACCOUNT,
  },
  elirox_get_limits: {
    description: "Read API key scopes, rate limits and current usage.",
    run: () => SCENARIO === "no-key"
      ? { error: "Missing or invalid API key" }
      : { keyId: "6a33c0007c5fabc255449247", accountId: ACCOUNT.id, scopes: SCOPES,
          limits: { rpm: 60, rpd: 1000, writeRpd: 100 },
          usage: { minute: { used: 1, remaining: 59 }, day: { used: 3, remaining: 997 }, writeDay: { used: 0, remaining: 100 } } },
  },
  elirox_get_assets: {
    description: "Broker instrument list. Map a user symbol to a real id from here.",
    run: () => ({ assets: ASSETS }),
  },
  elirox_get_active_bots: {
    description: "List currently running bots.",
    run: () => ({ bots }),
  },
  elirox_get_last_price: {
    description: "Last price for a symbol. Requires { symbol }.",
    run: (a) => a?.symbol ? { symbol: a.symbol, price: PRICES[a.symbol] ?? 100.0 }
                          : { error: "symbol is required" },
  },
  elirox_get_opened_orders: { description: "List opened orders.", run: () => ({ orders: orders.filter(o => o.status === "open") }) },
  elirox_get_pending_orders: { description: "List pending orders.", run: () => ({ orders: orders.filter(o => o.status === "pending") }) },

  elirox_launch_dca_bot: {
    description: "Launch a DCA bot. { symbol, direction, budget, preset, presetType, entryMode }",
    scope: "bots:write",
    run: (a) => {
      const bot = { id: id6("6a3d0e94c739509a4ef72"), strategy: "DCA", symbol: a?.symbol,
                    direction: a?.direction, budget: a?.budget, presetType: a?.presetType || "conservative",
                    volume: 0.07, status: "running" };
      bots.push(bot); return bot;
    },
  },
  elirox_launch_grid_bot: {
    description: "Launch a GRID bot. { symbol, direction, budget, preset, presetType }",
    scope: "bots:write",
    run: (a) => {
      const bot = { id: id6("7b4e1f05d840610b5fg83"), strategy: "GRID", symbol: a?.symbol,
                    direction: a?.direction, budget: a?.budget, presetType: a?.presetType || "conservative",
                    status: "running" };
      bots.push(bot); return bot;
    },
  },
  elirox_stop_bot: {
    description: "Stop a bot by id. { botId }",
    scope: "bots:write",
    run: (a) => {
      const bot = bots.find(b => b.id === a?.botId);
      if (!bot) return { error: "bot not found: " + a?.botId };
      bot.status = "stopped"; bots = bots.filter(b => b.id !== a.botId);
      return { id: bot.id, status: "stopped" };
    },
  },
  elirox_create_order: {
    description: "Open a market order. { symbol, side, volume }",
    scope: "trading:write",
    run: (a) => {
      const o = { orderId: id6("ord"), symbol: a?.symbol, side: a?.side || "BUY",
                  volume: a?.volume, price: PRICES[a?.symbol] ?? 100.0, status: "open" };
      orders.push(o); return o;
    },
  },
  elirox_close_order: {
    description: "Close an order by id. { orderId }",
    scope: "trading:write",
    run: (a) => {
      const o = orders.find(x => x.orderId === a?.orderId);
      if (!o) return { error: "order not found: " + a?.orderId };
      o.status = "closed"; return { orderId: o.orderId, status: "closed" };
    },
  },
  elirox_cancel_order: {
    description: "Cancel a pending order by id. { orderId }",
    scope: "trading:write",
    run: (a) => ({ orderId: a?.orderId, status: "cancelled" }),
  },
};

function callTool(name, args) {
  const tool = TOOLS[name];
  if (!tool) return { isError: true, data: { error: "unknown tool: " + name } };
  // проверка прав по сценарию
  const gate = tool.scope ? need(tool.scope) : (SCENARIO === "no-key" ? need("account:read") : null);
  if (gate === "NO_KEY") return { isError: true, data: { error: "Missing or invalid API key" } };
  if (gate === "FORBIDDEN") return { isError: true, data: { error: `Permission denied: key lacks '${tool.scope}'` } };
  return { isError: false, data: tool.run(args || {}) };
}

// ── JSON-RPC / MCP stdio ─────────────────────────────────────────────────────
function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }

function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return send({ jsonrpc: "2.0", id, result: {
      protocolVersion: params?.protocolVersion || "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "elirox-mock", version: "0.1.0" },
    }});
  }
  if (method === "notifications/initialized") return; // notification, без ответа
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  if (method === "tools/list") {
    return send({ jsonrpc: "2.0", id, result: {
      tools: Object.entries(TOOLS).map(([name, t]) => ({
        name, description: t.description,
        inputSchema: { type: "object", properties: {}, additionalProperties: true },
      })),
    }});
  }
  if (method === "tools/call") {
    const { isError, data } = callTool(params?.name, params?.arguments);
    return send({ jsonrpc: "2.0", id, result: {
      content: [{ type: "text", text: JSON.stringify(data) }],
      isError,
    }});
  }
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + method } });
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    try { handle(JSON.parse(line)); }
    catch (e) { log("parse error:", e.message); }
  }
});
process.stdin.on("end", () => process.exit(0));
log(`ready · scenario=${SCENARIO} · scopes=[${SCOPES.join(",") || "—"}]`);
