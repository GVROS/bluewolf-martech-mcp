import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

import {
  buildJourneyBlueprint,
  getMartechCapabilities,
  validateBriefing,
  type JourneyBriefing,
} from "../../lib/martech";
import {
  createJourneyDraft,
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
 * Keep tool results deliberately conservative for maximum interoperability
 * with IBM Consulting Advantage / ContextForge and older MCP clients.
 *
 * `content` is the required MCP CallToolResult field. We intentionally do not
 * emit structuredContent here because the ICA federation layer must first be
 * stable on the baseline CallToolResult contract.
 */
function success(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text" as const, text }],
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
        text: JSON.stringify(
          {
            status: "error",
            message,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function settled<T>(result: PromiseSettledResult<T>) {
  if (result.status === "fulfilled") {
    return { ok: true, data: result.value };
  }
  return {
    ok: false,
    error:
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
  };
}

const handler = createMcpHandler(
  (server) => {
    /**
     * =============================================================
     * CAMADA 0 — TESTE DE INTEROPERABILIDADE ICA <-> MCP
     * =============================================================
     */
    server.registerTool(
      "ica_echo",
      {
        title: "ICA MCP Echo",
        description:
          "Compatibility test for IBM Consulting Advantage. Returns exactly the content sent by the caller and does not access Salesforce.",
        inputSchema: {
          content: z.string().trim().min(1, "content is required"),
        },
      },
      async ({ content }) =>
        success({
          status: "ok",
          tool: "ica_echo",
          content,
          gateway: "bluewolf-martech-mcp",
          serverTime: new Date().toISOString(),
        }),
    );

    /**
     * =============================================================
     * CAMADA 1 — CONECTIVIDADE E DIAGNÓSTICO
     * =============================================================
     */
    server.registerTool(
      "mcp_ping",
      {
        title: "MCP Gateway Ping",
        description:
          "Tests connectivity between IBM Consulting Advantage and the Bluewolf MCP Gateway. Does not access Salesforce Marketing Cloud.",
        inputSchema: {},
      },
      async () =>
        success({
          status: "ok",
          gateway: "bluewolf-martech-mcp",
          product: "Bluewolf MarTech Journey Factory",
          message:
            "IBM Consulting Advantage successfully reached the Bluewolf MCP Gateway.",
          environment:
            process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
          serverTime: new Date().toISOString(),
        }),
    );

    server.registerTool(
      "sfmc_configuration_status",
      {
        title: "SFMC Configuration Status",
        description:
          "Checks whether required Salesforce Marketing Cloud environment variables are configured. Never returns credential values.",
        inputSchema: {},
      },
      async () =>
        success({
          status: "ok",
          gateway: "bluewolf-martech-mcp",
          configured: getConfigurationStatus(),
          checkedAt: new Date().toISOString(),
        }),
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

    /**
     * =============================================================
     * CAMADA 2 — CONTEXTO REAL DO MARKETING CLOUD
     * =============================================================
     */
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

    server.registerTool(
      "martech_context_snapshot",
      {
        title: "MarTech Context Snapshot",
        description:
          "Reads a compact live snapshot of Journeys, Data Extensions and Automations so ICA can ground a new strategy in the current Marketing Cloud context.",
        inputSchema: {
          limit: z.number().int().min(1).max(30).default(10),
        },
      },
      async ({ limit }) => {
        try {
          const [journeys, dataExtensions, automations] = await Promise.allSettled([
            listJourneys(1, Math.min(30, limit)),
            listDataExtensions(limit),
            listAutomations(limit),
          ]);

          return success({
            status: "ok",
            purpose:
              "Contextualizar uma nova demanda com objetos reais já existentes no Salesforce Marketing Cloud.",
            sources: {
              journeys: settled(journeys),
              dataExtensions: settled(dataExtensions),
              automations: settled(automations),
            },
            guidance: [
              "Use este snapshot como contexto, não como autorização para alterar objetos.",
              "Antes de reutilizar uma DE, valide Customer Key, campos, finalidade e granularidade.",
              "Antes de reutilizar uma jornada, avalie versão, status, regras e dependências.",
            ],
            capturedAt: new Date().toISOString(),
          });
        } catch (error) {
          return failure(error);
        }
      },
    );

    /**
     * =============================================================
     * CAMADA 3 — ESTEIRA MARTECH: DEMANDA -> BRIEFING -> ESTRATÉGIA
     * =============================================================
     */
    server.registerTool(
      "martech_capabilities",
      {
        title: "MarTech Journey Factory Capabilities",
        description:
          "Explains the complete end-to-end operating model of the application, from demand intake to learning after go-live.",
        inputSchema: {},
      },
      async () => success(getMartechCapabilities()),
    );

    server.registerTool(
      "martech_generate_blueprint",
      {
        title: "Generate MarTech Journey Blueprint",
        description:
          "Builds a complete journey blueprint from a marketing briefing: strategy, journey flow, data plan, Data Cloud role, automations, SQL drafts, governance, approvals and next actions. It does not write to Salesforce.",
        inputSchema: {
          name: z.string().trim().min(1),
          objective: z.string().trim().min(1),
          audience: z.string().trim().min(1),
          offer: z.string().trim().min(1),
          channels: z.array(z.string().trim().min(1)).min(1).default(["Email"]),
          entryCriteria: z.string().default(""),
          exitCriteria: z.string().default(""),
          businessRules: z.string().default(""),
          dataNeeds: z.array(z.string()).default([]),
          kpis: z.array(z.string()).default([]),
          requester: z.string().default(""),
          technicalOwner: z.string().default(""),
          approver: z.string().default(""),
          notes: z.string().default(""),
        },
      },
      async (args) => {
        try {
          const briefing: JourneyBriefing = {
            ...args,
            channels: args.channels,
          };
          return success(buildJourneyBlueprint(briefing));
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "martech_validate_briefing",
      {
        title: "Validate MarTech Briefing",
        description:
          "Checks whether a marketing briefing is ready for technical discovery and identifies blockers or warnings before any SFMC build.",
        inputSchema: {
          name: z.string().default(""),
          objective: z.string().default(""),
          audience: z.string().default(""),
          offer: z.string().default(""),
          channels: z.array(z.string()).default([]),
          entryCriteria: z.string().default(""),
          dataNeeds: z.array(z.string()).default([]),
          approver: z.string().default(""),
        },
      },
      async (args) => {
        try {
          const briefing: JourneyBriefing = {
            name: args.name,
            objective: args.objective,
            audience: args.audience,
            offer: args.offer,
            channels: args.channels,
            entryCriteria: args.entryCriteria,
            dataNeeds: args.dataNeeds,
            approver: args.approver,
          };
          const validation = validateBriefing(briefing);
          return success({
            status: validation.some((item) => item.status === "blocked")
              ? "blocked"
              : validation.some((item) => item.status === "warning")
                ? "review_required"
                : "ready",
            validation,
            rule:
              "Somente avance para criação de draft após validação técnica e aprovação de negócio.",
          });
        } catch (error) {
          return failure(error);
        }
      },
    );

    server.registerTool(
      "martech_data_cloud_readiness",
      {
        title: "Data Cloud Readiness",
        description:
          "Explains how Salesforce Data Cloud participates in the journey factory and what must be validated before connecting or activating segments. Does not claim a Data Cloud connection that is not configured.",
        inputSchema: {},
      },
      async () =>
        success({
          status: "integration_extension_point",
          connectedByThisGateway: false,
          currentRole: [
            "modelar a entidade correta de ativação",
            "validar DLO/DMO e relacionamentos",
            "construir ou validar segmentos",
            "ativar somente os atributos necessários no Marketing Cloud",
            "preservar consentimento, identidade e granularidade do caso de uso",
          ],
          requiredBeforeConnection: [
            "definir método de autenticação Salesforce Platform/Data Cloud",
            "definir org e ambiente",
            "definir objetos e segmentos permitidos",
            "definir política de leitura/escrita e aprovação",
            "mapear Identity Resolution apenas quando o caso exigir",
          ],
          note:
            "O SFMC está integrado neste gateway; Data Cloud é um conector separado e deve ser adicionado sem reutilizar indevidamente as credenciais do Marketing Cloud Engagement.",
        }),
    );

    /**
     * =============================================================
     * CAMADA 4 — ESCRITA CONTROLADA
     * =============================================================
     */
    server.registerTool(
      "sfmc_create_journey_draft",
      {
        title: "Create SFMC Journey Draft",
        description:
          "Creates only a basic Journey Builder draft shell. Safe by default: dryRun=true. Real write requires approved=true and dryRun=false. It never publishes or activates the journey.",
        inputSchema: {
          name: z.string().trim().min(1),
          key: z
            .string()
            .trim()
            .min(1)
            .regex(/^[A-Za-z0-9_-]+$/, "Use only letters, numbers, underscore or hyphen"),
          description: z.string().default(""),
          approved: z.boolean().default(false),
          dryRun: z.boolean().default(true),
          approvalReference: z.string().default(""),
        },
      },
      async ({ name, key, description, approved, dryRun, approvalReference }) => {
        try {
          const payload = {
            key,
            name,
            description:
              description ||
              "Draft created by IBM Consulting Advantage through Bluewolf MarTech MCP Gateway.",
            workflowApiVersion: 1,
            triggers: [],
            goals: [],
            activities: [],
          };

          if (!approved || dryRun) {
            return success({
              status: "dry_run",
              writeExecuted: false,
              reason: !approved
                ? "approved=false. A aprovação técnica/de negócio é obrigatória."
                : "dryRun=true. Nenhuma escrita foi executada.",
              approvalReference: approvalReference || null,
              proposedRequest: {
                method: "POST",
                path: "/interaction/v1/interactions",
                payload,
              },
              nextStep:
                "Após aprovação explícita, execute novamente com approved=true e dryRun=false. A jornada será criada apenas como draft, sem publicação.",
            });
          }

          if (!approvalReference.trim()) {
            throw new Error(
              "approvalReference is required for a real SFMC write. Provide a ticket, approval ID, meeting reference or equivalent governance evidence.",
            );
          }

          const result = await createJourneyDraft({
            name,
            key,
            description: payload.description,
          });

          return success({
            status: "draft_created",
            writeExecuted: true,
            published: false,
            activated: false,
            approvalReference,
            result,
            warning:
              "O draft precisa passar por ajustes manuais, QA técnico, QA de dados/canais e aprovação final antes de qualquer publicação.",
          });
        } catch (error) {
          return failure(error);
        }
      },
    );
  },
  {
    serverInfo: {
      name: "bluewolf-martech-mcp",
      version: "0.4.0",
    },
    capabilities: {
      tools: {},
    },
    instructions:
      "End-to-end MarTech Journey Factory for IBM Consulting Advantage and Salesforce Marketing Cloud. Prefer diagnostic and read/context tools first. Never expose credentials. Never perform real SFMC writes unless the tool's explicit approval and dry-run gates are satisfied.",
  },
  {
    basePath: "",
    maxDuration: 60,
    verboseLogs: true,
  },
);

function extractRequestId(request: Request): Promise<string | number | null> {
  if (request.method !== "POST") return Promise.resolve(null);
  return request
    .json()
    .then((body) => {
      if (!body || typeof body !== "object") return null;
      const id = (body as Record<string, unknown>).id;
      return typeof id === "string" || typeof id === "number" ? id : null;
    })
    .catch(() => null);
}

async function protocolError(request: Request, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const id = await extractRequestId(request);

  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: "Internal MCP gateway error",
        data: {
          message,
        },
      },
    },
    {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

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

  const errorRequest = request.clone();

  console.log(
    "[MCP REQUEST]",
    JSON.stringify({
      method: request.method,
      protocolVersion: request.headers.get("mcp-protocol-version"),
      hasSession: Boolean(request.headers.get("mcp-session-id")),
      accept: request.headers.get("accept"),
    }),
  );

  try {
    const response = await handler(request);
    console.log(
      "[MCP RESPONSE]",
      JSON.stringify({
        method: request.method,
        status: response.status,
        contentType: response.headers.get("content-type"),
        hasSession: Boolean(response.headers.get("mcp-session-id")),
      }),
    );
    return response;
  } catch (error) {
    console.error("[MCP HANDLER ERROR]", error);
    return protocolError(errorRequest, error);
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
