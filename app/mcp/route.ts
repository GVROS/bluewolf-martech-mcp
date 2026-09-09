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
export const dynamic = "force-dynamic";

function success(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          typeof data === "string"
            ? data
            : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function failure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  console.error("[MCP TOOL ERROR]", message);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
  };
}

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "mcp_ping",
      {
        title: "MCP Gateway Ping",
        description:
          "Tests connectivity between IBM Consulting Advantage and the Bluewolf MCP Gateway. Does not access Salesforce Marketing Cloud.",
        inputSchema: {},
      },
      async () => {
        try {
          return success({
            status: "ok",
            gateway: "bluewolf-martech-mcp",
            message:
              "IBM Consulting Advantage successfully reached the Bluewolf MCP Gateway.",
            environment:
              process.env.VERCEL_ENV ??
              process.env.NODE_ENV ??
              "unknown",
            serverTime: new Date().toISOString(),
          });
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "sfmc_configuration_status",
      {
        title: "SFMC Configuration Status",
        description:
          "Checks whether required Salesforce Marketing Cloud environment variables are configured. Never returns credential values.",
        inputSchema: {},
      },
      async () => {
        try {
          return success({
            status: "ok",
            gateway: "bluewolf-martech-mcp",
            configured: getConfigurationStatus(),
            checkedAt: new Date().toISOString(),
          });
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "sfmc_health",
      {
        title: "SFMC Health Check",
        description:
          "Validates real Salesforce Marketing Cloud Server-to-Server authentication without returning credentials, secrets or access tokens.",
        inputSchema: {},
      },
      async () => {
        try {
          const token = await getAccessToken();

          return success({
            status: "ok",
            gateway: "bluewolf-martech-mcp",
            configured: getConfigurationStatus(),
            authentication: {
              authenticated: true,
              tokenReceived: Boolean(token.access_token),
              expiresIn: token.expires_in ?? null,
            },
            endpoints: {
              restInstanceUrl: token.rest_instance_url ?? null,
              soapInstanceUrl: token.soap_instance_url ?? null,
            },
            checkedAt: new Date().toISOString(),
          });
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "sfmc_list_journeys",
      {
        title: "List SFMC Journeys",
        description:
          "Read-only. Lists Journey Builder journeys available in Salesforce Marketing Cloud.",
        inputSchema: {
          page: z.number().int().min(1).default(1),
          pageSize: z.number().int().min(1).max(50).default(20),
        },
      },
      async ({ page, pageSize }) => {
        try {
          return success(await listJourneys(page, pageSize));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "sfmc_get_journey",
      {
        title: "Get SFMC Journey",
        description:
          "Read-only. Retrieves one Journey Builder journey by ID.",
        inputSchema: {
          id: z.string().trim().min(1, "Journey ID is required"),
        },
      },
      async ({ id }) => {
        try {
          return success(await getJourney(id));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "sfmc_list_data_extensions",
      {
        title: "List SFMC Data Extensions",
        description:
          "Read-only. Lists Salesforce Marketing Cloud Data Extensions.",
        inputSchema: {
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ limit }) => {
        try {
          return success(await listDataExtensions(limit));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "sfmc_get_data_extension_fields",
      {
        title: "Get SFMC Data Extension Fields",
        description:
          "Read-only. Retrieves field metadata using the Data Extension Customer Key.",
        inputSchema: {
          customerKey: z
            .string()
            .trim()
            .min(1, "Data Extension Customer Key is required"),
        },
      },
      async ({ customerKey }) => {
        try {
          return success(await getDataExtensionFields(customerKey));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "sfmc_list_automations",
      {
        title: "List SFMC Automations",
        description:
          "Read-only. Lists Automation Studio automations available in Salesforce Marketing Cloud.",
        inputSchema: {
          limit: z.number().int().min(1).max(200).default(50),
        },
      },
      async ({ limit }) => {
        try {
          return success(await listAutomations(limit));
        } catch (error) {
          return failure(error);
        }
      },
    );
  },
  {},
  {
    basePath: "",
    maxDuration: 60,
    verboseLogs: true,
  },
);

async function authorized(request: Request) {
  const expectedToken = process.env.MCP_GATEWAY_TOKEN?.trim();

  if (!expectedToken) {
    console.error("[MCP AUTH] MCP_GATEWAY_TOKEN is not configured.");
    return Response.json(
      {
        error: "server_configuration_error",
        message: "MCP_GATEWAY_TOKEN is not configured on the gateway.",
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const receivedToken = match?.[1]?.trim();

  if (!receivedToken) {
    console.warn("[MCP AUTH] Bearer token was not received.");
    return Response.json(
      {
        error: "unauthorized",
        message: "Bearer token is required.",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (receivedToken !== expectedToken) {
    console.warn("[MCP AUTH] Invalid MCP Gateway token.");
    return Response.json(
      {
        error: "unauthorized",
        message: "Invalid MCP Gateway token.",
      },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  console.log(`[MCP] ${request.method} /mcp authorized`);

  try {
    const response = await handler(request);
    console.log(`[MCP] ${request.method} /mcp -> ${response.status}`);
    return response;
  } catch (error) {
    console.error("[MCP HANDLER ERROR]", error);
    return Response.json(
      {
        error: "mcp_handler_error",
        message: error instanceof Error ? error.message : String(error),
      },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": [
        "Authorization",
        "Content-Type",
        "Accept",
        "Mcp-Session-Id",
        "MCP-Protocol-Version",
        "Last-Event-ID",
      ].join(", "),
      "Access-Control-Expose-Headers": [
        "Mcp-Session-Id",
        "MCP-Protocol-Version",
      ].join(", "),
      "Access-Control-Max-Age": "86400",
      "Cache-Control": "no-store",
    },
  });
}

export {
  authorized as GET,
  authorized as POST,
  authorized as DELETE,
  options as OPTIONS,
};
