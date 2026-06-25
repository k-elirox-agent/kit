# Elirox Agent Kit

Skills and setup for using **Elirox** from any AI agent (Claude Code, Codex, Cursor, OpenCode, …).

## Install the skill

Paste this **single message** to your agent:

```
Install the skill: npx skills add k-elirox-agent/kit/packages/mcp — then connect my Elirox account
```

The agent will install the skill and immediately ask for your API key — no extra steps.

To pick specific agents explicitly:

```
Install the skill: npx skills add k-elirox-agent/kit/packages/mcp -a claude-code -a codex -g -y — then connect my Elirox account
```

## Repo layout

```
kit/
└── packages/
    └── mcp/
        └── SKILL.md   # onboarding + bot-manager rules
```
