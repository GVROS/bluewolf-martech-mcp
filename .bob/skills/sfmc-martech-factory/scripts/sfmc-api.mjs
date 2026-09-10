#!/usr/bin/env node

const baseUrl =
  process.env.BLUEWOLF_SFMC_API_URL ??
  "https://bluewolf-martech-mcp.vercel.app/api/sfmc";
const token = process.env.MCP_GATEWAY_TOKEN;

function usage() {
  console.log(`Usage:
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs configuration
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs health
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs journeys [pageSize]
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs data-extensions [limit]
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs automations [limit]
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs journey <id>
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs de-fields <customerKey>
  node .bob/skills/sfmc-martech-factory/scripts/sfmc-api.mjs draft-dry-run <name>

Required environment variable:
  MCP_GATEWAY_TOKEN

Optional:
  BLUEWOLF_SFMC_API_URL`);
}

if (!token) {
  console.error(
    "MCP_GATEWAY_TOKEN is not set. Configure it locally as an environment variable. Do not paste secrets into chat or commit them to Git.",
  );
  process.exit(2);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

async function readJson(response) {
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!response.ok) {
    const err = new Error(
      `HTTP ${response.status} ${response.statusText}: ${JSON.stringify(body)}`,
    );
    err.status = response.status;
    throw err;
  }

  return body;
}

async function get(action, params = {}) {
  const url = new URL(baseUrl);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return readJson(
    await fetch(url, {
      method: "GET",
      headers,
    }),
  );
}

async function post(action, body) {
  const url = new URL(baseUrl);
  url.searchParams.set("action", action);
  return readJson(
    await fetch(url, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
}

function intArg(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

const [command, ...args] = process.argv.slice(2);

try {
  let result;

  switch (command) {
    case "configuration":
      result = await get("configuration");
      break;

    case "health":
      result = await get("health");
      break;

    case "journeys":
      result = await get("journeys", {
        page: 1,
        pageSize: intArg(args[0], 5, 1, 50),
      });
      break;

    case "data-extensions":
      result = await get("dataExtensions", {
        limit: intArg(args[0], 10, 1, 200),
      });
      break;

    case "automations":
      result = await get("automations", {
        limit: intArg(args[0], 10, 1, 200),
      });
      break;

    case "journey":
      if (!args[0]) throw new Error("Journey id is required.");
      result = await get("journey", { id: args[0] });
      break;

    case "de-fields":
      if (!args[0]) throw new Error("Data Extension customerKey is required.");
      result = await get("dataExtensionFields", { customerKey: args[0] });
      break;

    case "draft-dry-run": {
      const name = args.join(" ").trim();
      if (!name) throw new Error("Journey name is required.");
      result = await post("createJourneyDraft", {
        name,
        description:
          "Bob technical dry-run through Bluewolf MarTech API. No publish and no activation.",
        approved: false,
        dryRun: true,
        approvalReference: "BOB-DRY-RUN",
      });
      break;
    }

    default:
      usage();
      process.exit(command ? 1 : 0);
  }

  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
