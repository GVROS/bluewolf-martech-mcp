import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
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

const SERVER_NAME = "bluewolf-martech-mcp";
const SERVER_VERSION = "0.5.0";

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
        text: JSON.stringify({ status: "error", message }, null, 2),
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function createServer() {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions:
        "End-to-end MarTech Journey Factory for IBM Consulting Advantage and Salesforce Marketing Cloud. Prefer diagnostic and read/context tools first. Never expose credentials. Never perform real SFMC writes unless the tool's explicit approval and dry-run gates are satisfied.",
    },
  );

  server.registerTool(
    "ica_echo",
    {
      title: "ICA MCP Echo",
      description:
        "Compatibility test for IBM Consulting Advantage. Returns exactly the content sent by the caller and does not access Salesforce. The argument is optional so a lost payload can be diagnosed without schema rejection.",
      inputSchema: {
        content: z.string().optional(),
      },
    },
    async ({ content }) => success(content ?? "ICA_ECHO_ARGUMENT_NOT_RECEIVED"),
  );

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
        gateway: SERVER_NAME,
        product: "Bluewolf MarTech Journey Factory",
        message:
          "IBM Consulting Advantage successfully reached the Bluewolf MCP Gateway.",
        environment:
          process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        responseMode: "json",
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
        gateway: SERVER_NAME,
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
          gateway: SERVER_NAME,
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

  server.registerTool(
    "sfmc_create_journey_draft",
    {
      title: "Create SFMC Journey Draft",
      description:
        "Creates only a basic Journey Builder draft shell. Safe by default: dryRun=true. Real write requires approved=true and dryRun=false. It never publishes or activates the journey. Salesforce Journey keys are UUIDs; a UUID is generated automatically when the supplied key is missing or not a UUID.",
      inputSchema: {
        name: z.string().trim().min(1),
        key: z.string().trim().optional(),
        description: z.string().default(""),
        approved: z.boolean().default(false),
        dryRun: z.boolean().default(true),
        approvalReference: z.string().default(""),
      },
    },
    async ({ name, key, description, approved, dryRun, approvalReference }) => {
      try {
        const requestedKey = key?.trim() || "";
        const journeyKey = isUuid(requestedKey) ? requestedKey : randomUUID();
        const payload = {
          key: journeyKey,
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
            requestedKey: requestedKey || null,
            salesforceJourneyKey: journeyKey,
            keyGenerated: !isUuid(requestedKey),
            proposedRequest: {
              method: "POST",
              path: "/interaction/v1/interactions",
              payload,
            },
            nextStep:
              "Após aprovação explícita, execute novamente com approved=true e dryRun=false. Você pode reutilizar salesforceJourneyKey para manter exatamente a chave validada no dry-run. A jornada será criada apenas como draft, sem publicação.",
          });
        }

        if (!approvalReference.trim()) {
          throw new Error(
            "approvalReference is required for a real SFMC write. Provide a ticket, approval ID, meeting reference or equivalent governance evidence.",
          );
        }

        const result = await createJourneyDraft({
          name,
          key: journeyKey,
          description: payload.description,
        });

        return success({
          status: "draft_created",
          writeExecuted: true,
          published: false,
          activated: false,
          approvalReference,
          requestedKey: requestedKey || null,
          salesforceJourneyKey: journeyKey,
          keyGenerated: !isUuid(requestedKey),
          result,
          warning:
            "O draft precisa passar por ajustes manuais, QA técnico, QA de dados/canais e aprovação final antes de qualquer publicação.",
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}

function tokenMatches(expected: string, received: string) {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function addCors(headers: Headers) {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Mcp-Session-Id, MCP-Protocol-Version",
  );
  headers.set("Cache-Control", "no-store");
  return headers;
}

function errorResponse(
  status: number,
  code: number,
  message: string,
  id: string | number | null = null,
) {
  return Response.json(
    {
      jsonrpc: "2.0",
      id,
      error: { code, message },
    },
    {
      status,
      headers: addCors(new Headers()),
    },
  );
}

function requestMetadata(body: unknown) {
  if (!body || typeof body !== "object") {
    return {
      id: null as string | number | null,
      method: null as string | null,
      tool: null as string | null,
    };
  }

  const value = body as Record<string, unknown>;
  const id =
    typeof value.id === "string" || typeof value.id === "number"
      ? value.id
      : null;
  const method = typeof value.method === "string" ? value.method : null;
  const params =
    value.params && typeof value.params === "object"
      ? (value.params as Record<string, unknown>)
      : null;
  const tool =
    method === "tools/call" && params && typeof params.name === "string"
      ? params.name
      : null;

  return { id, method, tool };
}

async function handleMcpPost(request: Request) {
  const rawBody = await request.text();
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(
      400,
      -32700,
      "Parse error: request body must be valid JSON.",
    );
  }

  const meta = requestMetadata(parsedBody);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-type", "application/json");

  const accept = requestHeaders.get("accept") ?? "";
  if (
    !accept.includes("application/json") ||
    !accept.includes("text/event-stream")
  ) {
    requestHeaders.set("accept", "application/json, text/event-stream");
  }

  const normalizedRequest = new Request(request.url, {
    method: "POST",
    headers: requestHeaders,
    body: rawBody,
  });

  console.log(
    "[MCP REQUEST]",
    JSON.stringify({
      method: meta.method,
      tool: meta.tool,
      protocolVersion: request.headers.get("mcp-protocol-version"),
      acceptOriginal: request.headers.get("accept"),
      responseMode: "json",
    }),
  );

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  const server = createServer();

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(normalizedRequest);
    const body = await response.arrayBuffer();
    const headers = addCors(new Headers(response.headers));

    console.log(
      "[MCP RESPONSE]",
      JSON.stringify({
        method: meta.method,
        tool: meta.tool,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bytes: body.byteLength,
      }),
    );

    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error("[MCP HANDLER ERROR]", error);
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(
      500,
      -32603,
      `Internal MCP gateway error: ${message}`,
      meta.id,
    );
  } finally {
    await server.close().catch(() => undefined);
  }
}

async function authorized(request: Request) {
  const expectedToken = process.env.MCP_GATEWAY_TOKEN?.trim();

  if (!expectedToken) {
    console.error("[MCP AUTH] MCP_GATEWAY_TOKEN is not configured.");
    return errorResponse(
      500,
      -32603,
      "MCP_GATEWAY_TOKEN is not configured on the gateway.",
    );
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const receivedToken = match?.[1]?.trim() ?? "";

  if (!receivedToken) {
    console.warn("[MCP AUTH] Bearer token was not received.");
    const headers = addCors(new Headers());
    headers.set("WWW-Authenticate", "Bearer");
    return Response.json(
      { error: "unauthorized", message: "Bearer token is required." },
      { status: 401, headers },
    );
  }

  if (!tokenMatches(expectedToken, receivedToken)) {
    console.warn("[MCP AUTH] Invalid MCP Gateway token.");
    const headers = addCors(new Headers());
    headers.set("WWW-Authenticate", "Bearer");
    return Response.json(
      { error: "unauthorized", message: "Invalid MCP Gateway token." },
      { status: 401, headers },
    );
  }

  if (request.method === "POST") {
    return handleMcpPost(request);
  }

  return errorResponse(
    405,
    -32000,
    "Method not allowed. This stateless MCP endpoint accepts POST requests; OPTIONS is available for CORS.",
  );
}

function options() {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": [
      "Authorization",
      "Content-Type",
      "Accept",
      "Mcp-Session-Id",
      "MCP-Protocol-Version",
      "Last-Event-ID",
    ].join(", "),
    "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Protocol-Version",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  });

  return new Response(null, { status: 204, headers });
}

export {
  authorized as GET,
  authorized as POST,
  authorized as DELETE,
  options as OPTIONS,
};
