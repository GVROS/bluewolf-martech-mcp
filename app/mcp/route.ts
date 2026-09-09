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

/**
 * Padroniza respostas de sucesso para o MCP.
 *
 * content:
 *   Compatibilidade padrão MCP.
 *
 * structuredContent:
 *   Facilita consumo por clientes que trabalham melhor com
 *   respostas estruturadas, como agentes e gateways.
 */
function success(data: unknown) {
  const text = JSON.stringify(data, null, 2);

  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
    structuredContent: {
      success: true,
      data,
    },
  };
}

/**
 * Padroniza erros de Tool no formato MCP.
 */
function failure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    structuredContent: {
      success: false,
      error: message,
    },
  };
}

/**
 * MCP Server
 */
const mcp = createMcpHandler(
  (server) => {
    /**
     * =========================================================
     * TOOL 1
     * TESTE ICA -> VERCEL -> MCP
     *
     * NÃO acessa Salesforce.
     * Serve para provar que o ICA consegue executar uma Tool.
     * =========================================================
     */
    server.registerTool(
      "mcp_ping",
      {
        title: "MCP Gateway Ping",
        description:
          "Tests the connection between IBM Consulting Advantage and the Bluewolf MCP Gateway. Does not access Salesforce.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          return success({
            status: "ok",
            gateway: "bluewolf-martech-mcp",
            message: "IBM Consulting Advantage successfully reached the MCP Gateway.",
            serverTime: new Date().toISOString(),
            environment:
              process.env.VERCEL_ENV ??
              process.env.NODE_ENV ??
              "unknown",
          });
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =========================================================
     * TOOL 2
     * STATUS DAS VARIÁVEIS
     *
     * NÃO retorna Client Secret,
     * Client ID ou token.
     *
     * Retorna apenas se cada configuração existe.
     * =========================================================
     */
    server.registerTool(
      "sfmc_configuration_status",
      {
        title: "SFMC Configuration Status",
        description:
          "Checks whether the Salesforce Marketing Cloud environment variables required by the gateway are configured. Does not return secrets.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          return success({
            gateway: "bluewolf-martech-mcp",
            configured: getConfigurationStatus(),
            checkedAt: new Date().toISOString(),
          });
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =========================================================
     * TOOL 3
     * HEALTH CHECK SFMC
     *
     * Aqui realmente solicita um Access Token no SFMC.
     * =========================================================
     */
    server.registerTool(
      "sfmc_health",
      {
        title: "SFMC Health Check",
        description:
          "Validates the Salesforce Marketing Cloud Server-to-Server configuration and authentication without returning credentials or secrets.",
        inputSchema: z.object({}),
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
              expiresIn: token.expires_in,
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

    /**
     * =========================================================
     * TOOL 4
     * LIST JOURNEYS
     * =========================================================
     */
    server.registerTool(
      "sfmc_list_journeys",
      {
        title: "List SFMC Journeys",
        description:
          "Read-only. Lists Journey Builder journeys available in Salesforce Marketing Cloud.",
        inputSchema: z.object({
          page: z
            .number()
            .int()
            .min(1)
            .default(1),

          pageSize: z
            .number()
            .int()
            .min(1)
            .max(50)
            .default(20),
        }),
      },
      async ({ page, pageSize }) => {
        try {
          const data = await listJourneys(page, pageSize);

          return success(data);
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =========================================================
     * TOOL 5
     * GET JOURNEY
     * =========================================================
     */
    server.registerTool(
      "sfmc_get_journey",
      {
        title: "Get SFMC Journey",
        description:
          "Read-only. Retrieves one Journey Builder journey by ID.",
        inputSchema: z.object({
          id: z
            .string()
            .trim()
            .min(1),
        }),
      },
      async ({ id }) => {
        try {
          const data = await getJourney(id);

          return success(data);
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =========================================================
     * TOOL 6
     * LIST DATA EXTENSIONS
     * =========================================================
     */
    server.registerTool(
      "sfmc_list_data_extensions",
      {
        title: "List SFMC Data Extensions",
        description:
          "Read-only. Lists Salesforce Marketing Cloud Data Extensions.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .default(50),
        }),
      },
      async ({ limit }) => {
        try {
          const data = await listDataExtensions(limit);

          return success(data);
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =========================================================
     * TOOL 7
     * DATA EXTENSION FIELDS
     * =========================================================
     */
    server.registerTool(
      "sfmc_get_data_extension_fields",
      {
        title: "Get SFMC Data Extension Fields",
        description:
          "Read-only. Retrieves field metadata for a Data Extension using its Customer Key.",
        inputSchema: z.object({
          customerKey: z
            .string()
            .trim()
            .min(1),
        }),
      },
      async ({ customerKey }) => {
        try {
          const data =
            await getDataExtensionFields(customerKey);

          return success(data);
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =========================================================
     * TOOL 8
     * LIST AUTOMATIONS
     * =========================================================
     */
    server.registerTool(
      "sfmc_list_automations",
      {
        title: "List SFMC Automations",
        description:
          "Read-only. Lists Automation Studio automations from Salesforce Marketing Cloud.",
        inputSchema: z.object({
          limit: z
            .number()
            .int()
            .min(1)
            .max(200)
            .default(50),
        }),
      },
      async ({ limit }) => {
        try {
          const data = await listAutomations(limit);

          return success(data);
        } catch (error) {
          return failure(error);
        }
      },
    );
  },

  {
    serverInfo: {
      name: "bluewolf-martech-mcp",
      version: "0.2.0",
    },

    instructions: `
Bluewolf MarTech MCP Gateway.

Purpose:
Connect IBM Consulting Advantage to Salesforce Marketing Cloud Engagement.

Environment:
Bluewolf Brazil POC.

Security:
Bearer Token authentication is required at the gateway.

Salesforce authentication:
Server-to-Server OAuth 2.0.

Current operating mode:
READ ONLY.

Available capabilities:
- Test MCP connectivity
- Validate SFMC configuration
- Validate Salesforce authentication
- List Journey Builder journeys
- Retrieve a Journey
- List Data Extensions
- Retrieve Data Extension fields
- List Automation Studio automations

The gateway must never expose:
- Client Secret
- Salesforce access token
- MCP Gateway Token
- credentials
- private environment variable values
`.trim(),

    verboseLogs: true,
  },
);

/**
 * =============================================================
 * GATEWAY AUTHENTICATION
 *
 * ICA envia:
 *
 * Authorization: Bearer MCP_GATEWAY_TOKEN
 *
 * O token precisa ser EXATAMENTE o mesmo configurado no Vercel.
 * =============================================================
 */
async function authorized(request: Request) {
  const expectedToken =
    process.env.MCP_GATEWAY_TOKEN?.trim();

  /**
   * Token não configurado no Vercel.
   */
  if (!expectedToken) {
    console.error(
      "[MCP AUTH] MCP_GATEWAY_TOKEN is not configured.",
    );

    return Response.json(
      {
        error: "server_configuration_error",
        message:
          "MCP_GATEWAY_TOKEN is not configured on the gateway.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  /**
   * Authorization recebido do ICA.
   */
  const authorization =
    request.headers.get("authorization")?.trim() ?? "";

  /**
   * Aceita somente Bearer Token.
   */
  const match =
    authorization.match(/^Bearer\s+(.+)$/i);

  const receivedToken =
    match?.[1]?.trim();

  if (!receivedToken) {
    console.warn(
      "[MCP AUTH] Bearer token was not received.",
    );

    return Response.json(
      {
        error: "unauthorized",
        message:
          "Bearer token is required.",
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

  /**
   * Valida token ICA -> Gateway.
   */
  if (receivedToken !== expectedToken) {
    console.warn(
      "[MCP AUTH] Invalid MCP Gateway token.",
    );

    return Response.json(
      {
        error: "unauthorized",
        message:
          "Invalid MCP Gateway token.",
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

  console.log(
    `[MCP] ${request.method} request authorized`,
  );

  /**
   * Entrega a requisição para o mcp-handler.
   */
  return mcp(request);
}

/**
 * Alguns clientes/proxies podem fazer preflight.
 */
async function options() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods":
        "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, Content-Type, Accept, Mcp-Session-Id",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Next.js Route Handlers
 */
export {
  authorized as GET,
  authorized as POST,
  options as OPTIONS,
};
