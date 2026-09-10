---
name: sfmc-martech-factory
description: Operate the Bluewolf MarTech Journey Factory for Salesforce Marketing Cloud: validate connectivity, inspect real Journeys/Data Extensions/Automations, generate technical context, and prepare controlled Journey Builder drafts without publishing or activating them.
---

Use this skill whenever the user asks about Salesforce Marketing Cloud, Journey Builder, Data Extensions, Automations, Bluewolf MCP, IBM Consulting Advantage integration, or a controlled MarTech journey build in this repository.

## Operating model

The production runtime is Vercel. GitHub stores source code only.

Preferred Bob path:

`Bob -> https://bluewolf-martech-mcp.vercel.app/api/sfmc -> lib/sfmc.ts -> Salesforce Marketing Cloud`

ICA compatibility path:

`IBM Consulting Advantage -> /mcp-ica -> lib/sfmc.ts -> Salesforce Marketing Cloud`

Do not route Bob through ICA unless the user is explicitly testing ICA interoperability. Bob should normally use the direct SFMC adapter or the local project code.

## Mandatory safety rules

1. Never expose or print `SFMC_CLIENT_SECRET`, Salesforce access tokens, `MCP_GATEWAY_TOKEN`, OpenAI API keys, or any other secret.
2. Never invent SFMC data. If an API call fails, report the failure exactly and stop before proposing that the object exists.
3. Always validate connectivity before making conclusions about the SFMC environment.
4. Use read-only discovery before any write.
5. Use dry-run before a Journey draft write.
6. Never publish or activate a Journey automatically.
7. A real Journey draft requires explicit user approval and a non-empty approval reference.
8. Treat the current environment as Bluewolf/IBM test context unless the API proves otherwise. Do not claim it is the SABESP production BU.

## Recommended sequence

### 1. Local project validation

Read `AGENTS.md`, `README.md`, `lib/sfmc.ts`, and the relevant route before changing code.

Run the build or existing smoke tests before changing integration behavior.

### 2. Bob -> SFMC direct connectivity

Use the helper script in `scripts/sfmc-api.mjs`.

Start with:

- `configuration`
- `health`
- `journeys`
- `data-extensions`
- `automations`

Only return values actually received from the API.

### 3. ICA validation

If testing IBM Consulting Advantage, use the ICA-specific endpoint `/mcp-ica` and validate in this order:

1. `ica_echo`
2. `mcp_ping`
3. `sfmc_configuration_status`
4. `sfmc_health`
5. `sfmc_list_journeys` or `sfmc_list_data_extensions`
6. Journey dry-run
7. approved Journey draft only after all previous tests pass

If ICA returns `content: Field required`, classify this as an ICA/MCP interoperability or tool-schema handling failure unless Vercel/SFMC logs prove otherwise. Do not claim Salesforce failed merely because ICA rejected the tool call.

### 4. Journey creation

For a POC Journey, prefer a minimal draft shell first. Keep `triggers`, `goals`, and `activities` empty unless real IDs and SFMC metadata have already been discovered and validated.

Before adding entry sources, waits by attribute, Content Builder assets, DE-based exit criteria, or complex activities, inspect existing Journey JSON and official API expectations. These objects require real SFMC identifiers and cannot be safely invented.

### 5. Output format

When reporting results, separate:

- DADO REAL CONSULTADO
- INFORMAÇÃO DO BRIEFING
- SUGESTÃO DA IA
- AÇÃO EXECUTADA
- PRÓXIMO PASSO

For errors, include the exact technical error message without secrets.

## Useful commands

Examples from the repository root:

```powershell
$env:MCP_GATEWAY_TOKEN="<set locally; never paste into chat>"
node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs configuration
node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs health
node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs journeys 5
node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs data-extensions 10
node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs automations 10
```

For a dry-run Journey:

```powershell
node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs draft-dry-run "POC SABESP - Journey Draft Teste"
```

Do not add real credentials to `.env.example`, Git, screenshots, chat transcripts, README files, or Bob skill files.
