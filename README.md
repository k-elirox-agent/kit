# Elirox Agent Kit

Skills and setup for using **Elirox** from any AI agent (Claude Code, Codex, Cursor, OpenCode, …).

## Install the skill

```bash
npx skills add k-elirox-agent/kit/packages/mcp
```

This installs the `elirox_bot_manager` skill into your agent. On first run the agent
walks you through connecting your account (API key) and shows what you can do.

Pick agents explicitly if needed:

```bash
npx skills add k-elirox-agent/kit/packages/mcp -a claude-code -a codex -g -y
```

## Repo layout

```
kit/
└── packages/
    └── mcp/
        ├── SKILL.md             # the skill: onboarding + bot-manager rules
        └── elirox-mock-mcp.mjs  # local mock MCP for testing (no backend/key)
```

> Note: `npx skills add` installs the **skill** (instructions). The Elirox **MCP server**
> is connected separately — see the Setup section inside `SKILL.md`.
