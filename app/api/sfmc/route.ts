import { randomUUID, timingSafeEqual } from "node:crypto";

import {
  createJourneyDraft,
  getAccessToken,
  getConfigurationStatus,
  getDataExtensionFields,
  getJourney,
  listAutomations,
  listDataExtensions,
  listJourneys,
} from "../../../lib/sfmc";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function tokenMatches(expected: string, received: string) {
  const expectedBytes = Buffer.from(expected, "utf8");
  const receivedBytes = Buffer.from(received, "utf8");
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

function authorize(request: Request) {
  const expectedToken = process.env.MCP_GATEWAY_TOKEN?.trim();
  if (!expectedToken) {
    return {
      ok: false as const,
      response: Response.json(
        { status: "error", message: "Gateway token is not configured." },
        { status: 500 },
      ),
    };
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const receivedToken = match?.[1]?.trim() ?? "";

  if (!receivedToken || !tokenMatches(expectedToken, receivedToken)) {
    return {
      ok: false as const,
      response: Response.json(
        { status: "error", message: "Valid Bearer token is required." },
        {
          status: 401,
          headers: { "WWW-Authenticate": "Bearer" },
        },
      ),
    };
  }

  return { ok: true as const };
}

function numberParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "configuration").trim();

  try {
    switch (action) {
      case "configuration":
        return json({
          status: "ok",
          runtime: "bluewolf-martech-api",
          configured: getConfigurationStatus(),
          checkedAt: new Date().toISOString(),
        });

      case "health": {
        const token = await getAccessToken();
        return json({
          status: "ok",
          runtime: "bluewolf-martech-api",
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
      }

      case "journeys": {
        const page = numberParam(url.searchParams.get("page"), 1, 1, 10000);
        const pageSize = numberParam(
          url.searchParams.get("pageSize"),
          20,
          1,
          50,
        );
        return json(await listJourneys(page, pageSize));
      }

      case "journey": {
        const id = url.searchParams.get("id")?.trim() ?? "";
        if (!id) {
          return json(
            { status: "error", message: "Query parameter id is required." },
            400,
          );
        }
        return json(await getJourney(id));
      }

      case "dataExtensions": {
        const limit = numberParam(url.searchParams.get("limit"), 50, 1, 200);
        return json(await listDataExtensions(limit));
      }

      case "dataExtensionFields": {
        const customerKey =
          url.searchParams.get("customerKey")?.trim() ?? "";
        if (!customerKey) {
          return json(
            {
              status: "error",
              message: "Query parameter customerKey is required.",
            },
            400,
          );
        }
        return json(await getDataExtensionFields(customerKey));
      }

      case "automations": {
        const limit = numberParam(url.searchParams.get("limit"), 50, 1, 200);
        return json(await listAutomations(limit));
      }

      default:
        return json(
          {
            status: "error",
            message: "Unknown action.",
            allowedActions: [
              "configuration",
              "health",
              "journeys",
              "journey",
              "dataExtensions",
              "dataExtensionFields",
              "automations",
            ],
          },
          400,
        );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SFMC DIRECT API ERROR]", { action, message });
    return json({ status: "error", action, message }, 502);
  }
}

export async function POST(request: Request) {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const action = (url.searchParams.get("action") ?? "").trim();

  if (action !== "createJourneyDraft") {
    return json(
      {
        status: "error",
        message: "POST supports only action=createJourneyDraft.",
      },
      400,
    );
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const requestedKey =
      typeof body.key === "string" ? body.key.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";
    const approved = body.approved === true;
    const dryRun = body.dryRun !== false;
    const approvalReference =
      typeof body.approvalReference === "string"
        ? body.approvalReference.trim()
        : "";

    if (!name) {
      return json(
        { status: "error", message: "Field name is required." },
        400,
      );
    }

    const journeyKey = isUuid(requestedKey) ? requestedKey : randomUUID();
    const normalizedDescription =
      description ||
      "Draft created through the Bluewolf MarTech direct SFMC API.";

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
      return json({
        status: "dry_run",
        writeExecuted: false,
        requestedKey: requestedKey || null,
        salesforceJourneyKey: journeyKey,
        keyGenerated: !isUuid(requestedKey),
        approvalReference: approvalReference || null,
        proposedRequest: {
          method: "POST",
          path: "/interaction/v1/interactions",
          payload,
        },
      });
    }

    if (!approvalReference) {
      return json(
        {
          status: "error",
          message:
            "approvalReference is required when approved=true and dryRun=false.",
        },
        400,
      );
    }

    const result = await createJourneyDraft({
      name,
      key: journeyKey,
      description: normalizedDescription,
    });

    return json({
      status: "draft_created",
      writeExecuted: true,
      published: false,
      activated: false,
      approvalReference,
      salesforceJourneyKey: journeyKey,
      result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[SFMC DIRECT API WRITE ERROR]", message);
    return json({ status: "error", message }, 502);
  }
}
