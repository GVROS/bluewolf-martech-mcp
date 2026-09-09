import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const baseUrl = process.env.MCP_SMOKE_URL ?? "http://127.0.0.1:3000/mcp";
const token = process.env.MCP_GATEWAY_TOKEN ?? "ci-test-token";

const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
});

const client = new Client(
  {
    name: "bluewolf-mcp-ci-smoke",
    version: "1.0.0",
  },
  {
    capabilities: {},
  },
);

function textFrom(result) {
  assert.ok(Array.isArray(result.content), "Tool result must contain content array");
  assert.ok(result.content.length > 0, "Tool result content must not be empty");
  const first = result.content[0];
  assert.equal(first.type, "text", "First tool result block must be text");
  assert.equal(typeof first.text, "string", "Text result must be a string");
  return first.text;
}

try {
  await client.connect(transport);

  const toolsResponse = await client.listTools();
  const toolNames = toolsResponse.tools.map((tool) => tool.name);

  for (const requiredTool of [
    "ica_echo",
    "mcp_ping",
    "sfmc_configuration_status",
    "sfmc_health",
    "sfmc_list_data_extensions",
    "sfmc_create_journey_draft",
  ]) {
    assert.ok(toolNames.includes(requiredTool), `Missing MCP tool: ${requiredTool}`);
  }

  const echo = await client.callTool({
    name: "ica_echo",
    arguments: { content: "TESTE_ICA_BLUEWOLF_001" },
  });
  assert.equal(
    textFrom(echo),
    "TESTE_ICA_BLUEWOLF_001",
    "ica_echo must return exactly the argument received",
  );

  const echoWithoutArgument = await client.callTool({
    name: "ica_echo",
    arguments: {},
  });
  assert.equal(
    textFrom(echoWithoutArgument),
    "ICA_ECHO_ARGUMENT_NOT_RECEIVED",
    "ica_echo fallback must diagnose a missing argument without schema rejection",
  );

  const ping = await client.callTool({
    name: "mcp_ping",
    arguments: {},
  });
  const pingPayload = JSON.parse(textFrom(ping));
  assert.equal(pingPayload.status, "ok");
  assert.equal(pingPayload.gateway, "bluewolf-martech-mcp");
  assert.equal(pingPayload.responseMode, "json");

  const config = await client.callTool({
    name: "sfmc_configuration_status",
    arguments: {},
  });
  const configPayload = JSON.parse(textFrom(config));
  assert.equal(configPayload.status, "ok");
  assert.equal(typeof configPayload.configured, "object");
  assert.equal(configPayload.configured.gatewayTokenConfigured, true);

  const dryRun = await client.callTool({
    name: "sfmc_create_journey_draft",
    arguments: {
      name: "POC SABESP - Journey Draft CI",
      key: "POC_SABESP_DRAFT_CI",
      description: "CI contract test. Must not write to Salesforce.",
      approved: false,
      dryRun: true,
      approvalReference: "CI-CONTRACT-TEST",
    },
  });
  const dryRunPayload = JSON.parse(textFrom(dryRun));
  assert.equal(dryRunPayload.status, "dry_run");
  assert.equal(dryRunPayload.writeExecuted, false);
  assert.equal(dryRunPayload.keyGenerated, true);
  assert.match(
    dryRunPayload.salesforceJourneyKey,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  console.log(
    JSON.stringify(
      {
        status: "ok",
        tests: [
          "tools/list",
          "ica_echo with content",
          "ica_echo missing argument fallback",
          "mcp_ping",
          "sfmc_configuration_status without credentials",
          "sfmc_create_journey_draft dry-run without SFMC write",
        ],
        toolCount: toolsResponse.tools.length,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close().catch(() => undefined);
}
