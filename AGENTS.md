# Bluewolf MarTech Journey Factory — Bob Project Context

## Purpose

This repository is the runtime bridge between IBM Consulting workflows and Salesforce Marketing Cloud Engagement (SFMC). The application is deployed on Vercel and exposes controlled interfaces for SFMC discovery and Journey Builder draft creation.

## Architecture

- `lib/sfmc.ts`: SFMC authentication and API client logic.
- `app/mcp/route.ts`: primary MCP Streamable HTTP endpoint.
- `app/mcp-ica/route.ts`: IBM Consulting Advantage / ContextForge compatibility endpoint.
- `app/api/sfmc/route.ts`: protected direct REST adapter for Bob, diagnostics and deterministic SFMC operations.
- `app/health/`: runtime health/configuration surface.
- `.bob/skills/sfmc-martech-factory/`: Bob skill for operating this project safely.

Runtime flow:

`Bob or ICA -> Vercel runtime -> lib/sfmc.ts -> Salesforce Marketing Cloud APIs`

GitHub is source control only. It is not the runtime that calls Salesforce.

## Production endpoints

- Application: `https://bluewolf-martech-mcp.vercel.app`
- Primary MCP: `https://bluewolf-martech-mcp.vercel.app/mcp`
- ICA compatibility MCP: `https://bluewolf-martech-mcp.vercel.app/mcp-ica`
- Direct SFMC adapter: `https://bluewolf-martech-mcp.vercel.app/api/sfmc`
- Health: `https://bluewolf-martech-mcp.vercel.app/health`

## Security rules

1. Never print, commit, paste or log SFMC client secrets, Salesforce access tokens, OpenAI API keys or `MCP_GATEWAY_TOKEN` values.
2. Secrets live only in environment variables or an approved secret manager.
3. Prefer read-only discovery before any SFMC write.
4. Journey creation is draft-only. Never publish or activate automatically.
5. A real Journey draft write requires explicit user approval plus a traceable `approvalReference`.
6. When testing, use dry-run first.
7. Never invent Salesforce object names, IDs, Customer Keys, Journeys, Data Extensions or Automation results.

## Working approach in Bob

For SFMC tasks, use the `sfmc-martech-factory` skill. Start with configuration/health checks, then read the real SFMC context, then propose or dry-run changes. Only perform an approved real draft after the user explicitly authorizes it.

## Current POC scope

Supported operational areas include:

- SFMC configuration and authentication health
- Journey listing and Journey retrieval
- Data Extension listing and field metadata
- Automation listing
- MarTech context discovery
- Journey blueprint/briefing support through MCP
- controlled Journey Builder draft creation

Data Cloud is a separate integration extension point and must not be claimed as connected unless separately configured and verified.
