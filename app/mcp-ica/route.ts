import { randomUUID, timingSafeEqual } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

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

const SERVER_NAME = "bluewolf-martech-mcp-ica";
const SERVER_VERSION = "0.6.0";

/**
 * IBM Consulting Advantage / ContextForge compatibility envelope.
 *
 * MCP requires `content` in CallToolResult. Some intermediary clients also
 * behave better when a structured result is advertised and returned. Every
 * tool therefore returns BOTH:
 *   1) standard MCP text content; and
 *   2) structuredContent with a stable top-level `content` field.
 */
const ICA_OUTPUT_SCHEMA = {
  content: z.unknown(),
};

function success(data: unknown) {
  const normalized = data ?? null;
  const text =
    typeof normalized === "string"
      ? normalized
      : JSON.stringify(normalized, null, 2);

  return {
    content: [{ type: "text" as const, text }],
    structuredContent: { content: normalized },
  };
}

function failure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  const payload = { status: "error", message };
  console.error("[ICA MCP TOOL ERROR]", message);

  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: { content: payload },
  };
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

function createServer() {
  const server = new McpServer(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: { tools: {} },
      instructions:
        "ICA compatibility gateway for Salesforce Marketing Cloud. Use diagnostic/read tools first. Never expose credentials. Real SFMC writes require explicit approval and dryRun=false. Never publish or activate a journey automatically.",
    },
  );

  server.registerTool(
    "ica_echo",
    {
      title: "ICA Compatibility Echo",
      description:
        "Tests ICA/ContextForge tool invocation without calling Salesforce. Returns the received content. If the argument is lost by an intermediary, returns ICA_ECHO_ARGUMENT_NOT_RECEIVED.",
      inputSchema: {
        content: z.string().optional(),
      },
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
    },
    async ({ content }) => success(content ?? "ICA_ECHO_ARGUMENT_NOT_RECEIVED"),
  );

  server.registerTool(
    "mcp_ping",
    {
      title: "MCP Gateway Ping",
      description:
        "Tests connectivity from ICA to the public Bluewolf MCP runtime. Does not access Salesforce Marketing Cloud.",
      inputSchema: {},
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
    },
    async () =>
      success({
        status: "ok",
        gateway: SERVER_NAME,
        version: SERVER_VERSION,
        product: "Bluewolf MarTech Journey Factory",
        environment:
          process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
        responseMode: "json+structuredContent",
        serverTime: new Date().toISOString(),
      }),
  );

  server.registerTool(
    "sfmc_configuration_status",
    {
      title: "SFMC Configuration Status",
      description:
        "Checks only whether required SFMC environment variables exist. Never returns credential values.",
      inputSchema: {},
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
    },
    async () =>
      success({
        status: "ok",
        configured: getConfigurationStatus(),
        checkedAt: new Date().toISOString(),
      }),
  );

  server.registerTool(
    "sfmc_health",
    {
      title: "SFMC Authentication Health",
      description:
        "Performs a real Server-to-Server OAuth authentication against Salesforce Marketing Cloud without returning secrets or access tokens.",
      inputSchema: {},
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
    },
    async () => {
      try {
        const token = await getAccessToken();
        return success({
          status: "ok",
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
        "Read-only. Calls the Journey Builder interaction service and lists journeys available to the configured Marketing Cloud Business Unit.",
      inputSchema: {
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(50).default(20),
      },
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
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
      description: "Read-only. Retrieves one Journey Builder journey by ID.",
      inputSchema: {
        id: z.string().trim().min(1, "Journey ID is required"),
      },
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
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
        "Read-only. Lists Salesforce Marketing Cloud Data Extensions through the SOAP API.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50),
      },
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
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
        "Read-only. Retrieves Data Extension field metadata using its Customer Key.",
      inputSchema: {
        customerKey: z
          .string()
          .trim()
          .min(1, "Data Extension Customer Key is required"),
      },
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
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
        "Read-only. Lists Automation Studio automations through the SFMC SOAP API.",
      inputSchema: {
        limit: z.number().int().min(1).max(200).default(50),
      },
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: READ_ONLY,
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
    "sfmc_create_journey_draft",
    {
      title: "Create SFMC Journey Draft",
      description:
        "Creates only a basic Journey Builder DRAFT shell. Safe by default. A real write requires approved=true, dryRun=false and approvalReference. It never publishes or activates the journey.",
      inputSchema: {
        name: z.string().trim().min(1),
        key: z.string().trim().optional(),
        description: z.string().default(""),
        approved: z.boolean().default(false),
        dryRun: z.boolean().default(true),
        approvalReference: z.string().default(""),
      },
      outputSchema: ICA_OUTPUT_SCHEMA,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ name, key, description, approved, dryRun, approvalReference }) => {
      try {
        const requestedKey = key?.trim() || "";
        const journeyKey = isUuid(requestedKey) ? requestedKey : randomUUID();
        const normalizedDescription =
          description.trim() ||
          "Draft created by IBM Consulting Advantage through Bluewolf MarTech Gateway.";

        const payload = {
          key: journeyKey,
          name,
          description: normalizedDescription,
          workflowApiVersion: 1,
          triggers: [],
          goals: [],
          activities: [],
        };

        if (!approved || dryRun) {
          return success({
            status: "dry_run",
            writeExecuted: false,
            approvalReference: approvalReference || null,
            requestedKey: requestedKey || null,
            salesforceJourneyKey: journeyKey,
            keyGenerated: !isUuid(requestedKey),
            proposedRequest: {
              method: "POST",
              path: "/interaction/v1/interactions",
              payload,
            },
          });
        }

        if (!approvalReference.trim()) {
          throw new Error(
            "approvalReference is required for a real SFMC write.",
          );
        }

        const result = await createJourneyDraft({
          name,
          key: journeyKey,
          description: normalizedDescription,
        });

        return success({
          status: "draft_created",
          writeExecuted: true,
          published: false,
          activated: false,
          approvalReference,
          salesforceJourneyKey: journeyKey,
          result,
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
    "[ICA MCP REQUEST]",
    JSON.stringify({
      method: meta.method,
      tool: meta.tool,
      protocolVersion: request.headers.get("mcp-protocol-version"),
      acceptOriginal: request.headers.get("accept"),
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
    const responseBody = await response.arrayBuffer();
    const headers = addCors(new Headers(response.headers));

    console.log(
      "[ICA MCP RESPONSE]",
      JSON.stringify({
        method: meta.method,
        tool: meta.tool,
        status: response.status,
        contentType: response.headers.get("content-type"),
        bytes: responseBody.byteLength,
      }),
    );

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error("[ICA MCP HANDLER ERROR]", error);
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
    return errorResponse(
      500,
      -32603,
      "MCP_GATEWAY_TOKEN is not configured on the gateway.",
    );
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const receivedToken = match?.[1]?.trim() ?? "";

  if (!receivedToken || !tokenMatches(expectedToken, receivedToken)) {
    const headers = addCors(new Headers());
    headers.set("WWW-Authenticate", "Bearer");
    return Response.json(
      { error: "unauthorized", message: "Valid Bearer token is required." },
      { status: 401, headers },
    );
  }

  if (request.method === "POST") {
    return handleMcpPost(request);
  }

  return errorResponse(
    405,
    -32000,
    "Method not allowed. Use POST for Streamable HTTP MCP requests.",
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
