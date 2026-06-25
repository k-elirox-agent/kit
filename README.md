# Elirox Agent Kit

Skills and setup for using **Elirox** from any AI agent (Claude Code, Codex, Cursor, OpenCode, …).

## Install the skill

```bash
npx skills add k-elirox-agent/kit/packages/mcp
```

This installs the `elirox_bot_manager` skill into your agent.

After install, type **`start`** — the agent will ask for your API key and set everything up automatically.

Pick agents explicitly if needed:

```bash
npx skills add k-elirox-agent/kit/packages/mcp -a claude-code -a codex -g -y
```

## Repo layout

```
kit/
└── packages/
    └── mcp/
        └── SKILL.md   # onboarding + bot-manager rules
```
