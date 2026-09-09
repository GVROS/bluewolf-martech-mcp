# Bluewolf MarTech MCP Gateway

Read-only POC MCP gateway between IBM Consulting Advantage and Salesforce Marketing Cloud Engagement.

## Endpoints
- `/mcp` — MCP Streamable HTTP
- `/health` — health/config status

## Tools
- `sfmc_health`
- `sfmc_list_journeys`
- `sfmc_get_journey`
- `sfmc_list_data_extensions`
- `sfmc_get_data_extension_fields`
- `sfmc_list_automations`

## Environment variables
Configure in Vercel and never commit secrets:
- `SFMC_CLIENT_ID`
- `SFMC_CLIENT_SECRET`
- `SFMC_ACCOUNT_ID`
- `SFMC_AUTH_BASE_URI`
- `SFMC_REST_BASE_URI`
- `SFMC_SOAP_BASE_URI`
- `MCP_GATEWAY_TOKEN`

## ICA configuration
- Transport: `STREAMABLE HTTP`
- Authentication Type: `Bearer Token`
- MCP Server URL: `https://<project>.vercel.app/mcp`
