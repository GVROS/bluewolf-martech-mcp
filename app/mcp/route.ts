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
 * =============================================================
 * RESPOSTA MCP
 *
 * Mantemos o retorno propositalmente simples:
 *
 * {
 *   content: [
 *     {
 *       type: "text",
 *       text: "..."
 *     }
 *   ]
 * }
 *
 * Não utilizamos structuredContent neste momento para maximizar
 * a compatibilidade com o IBM Consulting Advantage.
 * =============================================================
 */
function success(data: unknown) {
  const text =
    typeof data === "string"
      ? data
      : JSON.stringify(data, null, 2);

  return {
    isError: false,
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
}

/**
 * =============================================================
 * ERRO MCP
 * =============================================================
 */
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

/**
 * =============================================================
 * MCP SERVER
 * =============================================================
 */
const mcp = createMcpHandler(
  (server) => {
    /**
     * =========================================================
     * TOOL 1
     * MCP PING
     *
     * Não acessa Salesforce.
     *
     * Objetivo:
     * provar:
     *
     * ICA
     *   ->
     * Vercel
     *   ->
     * MCP
     *
     * =========================================================
     */
    server.registerTool(
      "mcp_ping",
      {
        title: "MCP Gateway Ping",
        description:
          "Tests connectivity between IBM Consulting Advantage and the Bluewolf MCP Gateway. Does not access Salesforce Marketing Cloud.",
        inputSchema: z.object({}),
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

    /**
     * =========================================================
     * TOOL 2
     * SFMC CONFIGURATION STATUS
     *
     * Não autentica no SFMC.
     *
     * Apenas verifica se as variáveis obrigatórias existem.
     *
     * Nunca retorna:
     * - Client Secret
     * - Access Token
     * - MCP Token
     * =========================================================
     */
    server.registerTool(
      "sfmc_configuration_status",
      {
        title: "SFMC Configuration Status",
        description:
          "Checks whether the Salesforce Marketing Cloud environment variables required by the gateway are configured. Does not return credentials or secrets.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const configured =
            getConfigurationStatus();

          return success({
            status: "ok",
            gateway: "bluewolf-martech-mcp",
            configured,
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
     * SFMC HEALTH
     *
     * Faz autenticação REAL Server-to-Server no Marketing Cloud.
     * =========================================================
     */
    server.registerTool(
      "sfmc_health",
      {
        title: "SFMC Health Check",
        description:
          "Validates Salesforce Marketing Cloud Server-to-Server authentication without returning credentials, secrets or access tokens.",
        inputSchema: z.object({}),
      },
      async () => {
        try {
          const token =
            await getAccessToken();

          return success({
            status: "ok",

            gateway:
              "bluewolf-martech-mcp",

            configured:
              getConfigurationStatus(),

            authentication: {
              authenticated: true,

              tokenReceived:
                Boolean(token.access_token),

              expiresIn:
                token.expires_in ?? null,
            },

            endpoints: {
              restInstanceUrl:
                token.rest_instance_url ?? null,

              soapInstanceUrl:
                token.soap_instance_url ?? null,
            },

            checkedAt:
              new Date().toISOString(),
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
     *
     * READ ONLY
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
          const data =
            await listJourneys(
              page,
              pageSize,
            );

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
     *
     * READ ONLY
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
            .min(
              1,
              "Journey ID is required",
            ),
        }),
      },

      async ({ id }) => {
        try {
          const data =
            await getJourney(id);

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
     *
     * READ ONLY
     * =========================================================
     */
    server.registerTool(
      "sfmc_list_data_extensions",
      {
        title:
          "List SFMC Data Extensions",

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
          const data =
            await listDataExtensions(
              limit,
            );

          return success(data);
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =========================================================
     * TOOL 7
     * GET DATA EXTENSION FIELDS
     *
     * READ ONLY
     * =========================================================
     */
    server.registerTool(
      "sfmc_get_data_extension_fields",
      {
        title:
          "Get SFMC Data Extension Fields",

        description:
          "Read-only. Retrieves field metadata for a Salesforce Marketing Cloud Data Extension using its Customer Key.",

        inputSchema: z.object({
          customerKey: z
            .string()
            .trim()
            .min(
              1,
              "Data Extension Customer Key is required",
            ),
        }),
      },

      async ({ customerKey }) => {
        try {
          const data =
            await getDataExtensionFields(
              customerKey,
            );

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
     *
     * READ ONLY
     * =========================================================
     */
    server.registerTool(
      "sfmc_list_automations",
      {
        title:
          "List SFMC Automations",

        description:
          "Read-only. Lists Automation Studio automations available in Salesforce Marketing Cloud.",

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
          const data =
            await listAutomations(
              limit,
            );

          return success(data);
        } catch (error) {
          return failure(error);
        }
      },
    );
  },

  /**
   * ===========================================================
   * MCP SERVER CONFIGURATION
   * ===========================================================
   */
  {
    serverInfo: {
      name:
        "bluewolf-martech-mcp",

      version:
        "0.3.0",
    },

    instructions: `
Bluewolf MarTech MCP Gateway.

PURPOSE
Connect IBM Consulting Advantage to Salesforce Marketing Cloud Engagement.

CLIENT
Programa CRM Salesforce SABESP.

ENVIRONMENT
Bluewolf Brazil POC.

GATEWAY AUTHENTICATION
Bearer Token.

SALESFORCE AUTHENTICATION
OAuth 2.0 Server-to-Server.

CURRENT MODE
READ ONLY.

AVAILABLE TOOLS

1. mcp_ping
Tests connectivity between IBM Consulting Advantage and the MCP Gateway.
Does not access Salesforce.

2. sfmc_configuration_status
Checks whether required Salesforce Marketing Cloud environment variables exist.
Does not expose their values.

3. sfmc_health
Authenticates with Salesforce Marketing Cloud using Server-to-Server OAuth.

4. sfmc_list_journeys
Lists Journey Builder journeys.

5. sfmc_get_journey
Retrieves one Journey Builder journey.

6. sfmc_list_data_extensions
Lists Data Extensions.

7. sfmc_get_data_extension_fields
Retrieves Data Extension field metadata.

8. sfmc_list_automations
Lists Automation Studio automations.

SECURITY

Never expose:
- SFMC Client Secret
- SFMC Access Token
- MCP Gateway Token
- passwords
- credentials
- private environment variable values

The gateway is currently read-only.
`.trim(),

    verboseLogs: true,
  },
);

/**
 * =============================================================
 * ICA -> MCP GATEWAY AUTHENTICATION
 *
 * ICA deve enviar:
 *
 * Authorization: Bearer <MCP_GATEWAY_TOKEN>
 *
 * O mesmo token precisa existir no Vercel como:
 *
 * MCP_GATEWAY_TOKEN
 * =============================================================
 */
async function authorized(
  request: Request,
) {
  const expectedToken =
    process.env
      .MCP_GATEWAY_TOKEN
      ?.trim();

  /**
   * Token não configurado no Vercel.
   */
  if (!expectedToken) {
    console.error(
      "[MCP AUTH] MCP_GATEWAY_TOKEN is not configured.",
    );

    return Response.json(
      {
        error:
          "server_configuration_error",

        message:
          "MCP_GATEWAY_TOKEN is not configured on the gateway.",
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  /**
   * Header recebido do ICA.
   */
  const authorization =
    request.headers
      .get("authorization")
      ?.trim() ?? "";

  /**
   * Bearer Token.
   */
  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  const receivedToken =
    match?.[1]?.trim();

  /**
   * Token não enviado.
   */
  if (!receivedToken) {
    console.warn(
      "[MCP AUTH] Bearer token was not received.",
    );

    return Response.json(
      {
        error:
          "unauthorized",

        message:
          "Bearer token is required.",
      },
      {
        status: 401,

        headers: {
          "WWW-Authenticate":
            "Bearer",

          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  /**
   * Token incorreto.
   */
  if (
    receivedToken !==
    expectedToken
  ) {
    console.warn(
      "[MCP AUTH] Invalid MCP Gateway token.",
    );

    return Response.json(
      {
        error:
          "unauthorized",

        message:
          "Invalid MCP Gateway token.",
      },
      {
        status: 401,

        headers: {
          "WWW-Authenticate":
            "Bearer",

          "Cache-Control":
            "no-store",
        },
      },
    );
  }

  console.log(
    `[MCP] ${request.method} /mcp authorized`,
  );

  /**
   * Envia requisição ao MCP Handler.
   */
  try {
    const response =
      await mcp(request);

    console.log(
      `[MCP] ${request.method} /mcp -> ${response.status}`,
    );

    return response;
  } catch (error) {
    console.error(
      "[MCP HANDLER ERROR]",
      error,
    );

    return Response.json(
      {
        error:
          "mcp_handler_error",

        message:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}

/**
 * =============================================================
 * CORS / PREFLIGHT
 * =============================================================
 */
async function options() {
  return new Response(
    null,
    {
      status: 204,

      headers: {
        "Access-Control-Allow-Origin":
          "*",

        "Access-Control-Allow-Methods":
          "GET, POST, DELETE, OPTIONS",

        "Access-Control-Allow-Headers":
          [
            "Authorization",
            "Content-Type",
            "Accept",
            "Mcp-Session-Id",
            "MCP-Protocol-Version",
            "Last-Event-ID",
          ].join(", "),

        "Access-Control-Expose-Headers":
          [
            "Mcp-Session-Id",
            "MCP-Protocol-Version",
          ].join(", "),

        "Access-Control-Max-Age":
          "86400",

        "Cache-Control":
          "no-store",
      },
    },
  );
}

/**
 * =============================================================
 * NEXT.JS ROUTE HANDLERS
 * =============================================================
 */
export {
  authorized as GET,
  authorized as POST,
  authorized as DELETE,
  options as OPTIONS,
};
