import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  getAccessToken,
  getConfigurationStatus,
  getDataExtensionFields,
  getJourney,
  listAutomations,
  listDataExtensions,
  listJourneys,
} from "../../lib/sfmc";

export const runtime = "nodejs";
export const maxDuration = 60;

const success = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const failure = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
});

const mcp = createMcpHandler(
  (server) => {
    server.registerTool(
      "sfmc_health",
      {
        title: "SFMC Health Check",
        description: "Validates the SFMC Server-to-Server configuration without returning secrets.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const t = await getAccessToken();
          return success({
            configured: getConfigurationStatus(),
            authenticated: true,
            expiresIn: t.expires_in,
            restInstanceUrl: t.rest_instance_url,
            soapInstanceUrl: t.soap_instance_url,
          });
        } catch (e) {
          return failure(e);
        }
      },
    );

    server.registerTool(
      "sfmc_list_journeys",
      {
        title: "List SFMC Journeys",
        description: "Read-only. Lists Journey Builder journeys.",
        inputSchema: z.object({
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(50).default(20),
        }),
      },
      async ({ page, pageSize }) => {
        try {
          return success(await listJourneys(page, pageSize));
        } catch (e) {
          return failure(e);
        }
      },
    );

    server.registerTool(
      "sfmc_get_journey",
      {
        title: "Get SFMC Journey",
        description: "Read-only. Retrieves one Journey by ID.",
        inputSchema: z.object({ id: z.string().min(1) }),
      },
      async ({ id }) => {
        try {
          return success(await getJourney(id));
        } catch (e) {
          return failure(e);
        }
      },
    );

    server.registerTool(
      "sfmc_list_data_extensions",
      {
        title: "List SFMC Data Extensions",
        description: "Read-only. Lists Data Extensions.",
        inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
      },
      async ({ limit }) => {
        try {
          return success(await listDataExtensions(limit));
        } catch (e) {
          return failure(e);
        }
      },
    );

    server.registerTool(
      "sfmc_get_data_extension_fields",
      {
        title: "Get SFMC Data Extension Fields",
        description: "Read-only. Retrieves field metadata by Data Extension Customer Key.",
        inputSchema: z.object({ customerKey: z.string().min(1) }),
      },
      async ({ customerKey }) => {
        try {
          return success(await getDataExtensionFields(customerKey));
        } catch (e) {
          return failure(e);
        }
      },
    );

    server.registerTool(
      "sfmc_list_automations",
      {
        title: "List SFMC Automations",
        description: "Read-only. Lists Automation Studio automations.",
        inputSchema: z.object({ limit: z.number().int().min(1).max(200).default(50) }),
      },
      async ({ limit }) => {
        try {
          return success(await listAutomations(limit));
        } catch (e) {
          return failure(e);
        }
      },
    );
  },
  {
    serverInfo: { name: "bluewolf-martech-mcp", version: "0.1.0" },
    instructions: "Read-only Salesforce Marketing Cloud gateway for IBM Consulting Advantage POC.",
  },
);

async function authorized(request: Request) {
  const expected = process.env.MCP_GATEWAY_TOKEN;
  if (!expected) {
    return Response.json({ error: "MCP_GATEWAY_TOKEN is not configured" }, { status: 500 });
  }

  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
    );
  }

  return mcp(request);
}

export { authorized as GET, authorized as POST };
