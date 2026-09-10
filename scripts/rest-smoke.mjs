import assert from "node:assert/strict";

const baseUrl =
  process.env.SFMC_API_SMOKE_URL ?? "http://127.0.0.1:3000/api/sfmc";
const token = process.env.MCP_GATEWAY_TOKEN ?? "ci-test-token";

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function readJson(response, label) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${label} returned non-JSON: ${text.slice(0, 500)}`);
  }
  assert.ok(response.ok, `${label} failed (${response.status}): ${text}`);
  return payload;
}

const configurationResponse = await fetch(`${baseUrl}?action=configuration`, {
  headers: authHeaders(),
});
const configuration = await readJson(
  configurationResponse,
  "configuration endpoint",
);
assert.equal(configuration.status, "ok");
assert.equal(configuration.runtime, "bluewolf-martech-api");
assert.equal(configuration.configured.gatewayTokenConfigured, true);

const dryRunResponse = await fetch(`${baseUrl}?action=createJourneyDraft`, {
  method: "POST",
  headers: authHeaders({ "content-type": "application/json" }),
  body: JSON.stringify({
    name: "POC SABESP - REST Journey Draft CI",
    key: "POC_SABESP_REST_DRAFT_CI",
    description: "CI REST dry-run. Must not write to Salesforce.",
    approved: false,
    dryRun: true,
    approvalReference: "CI-REST-CONTRACT-TEST",
  }),
});
const dryRun = await readJson(dryRunResponse, "Journey draft dry-run endpoint");
assert.equal(dryRun.status, "dry_run");
assert.equal(dryRun.writeExecuted, false);
assert.equal(dryRun.keyGenerated, true);
assert.match(
  dryRun.salesforceJourneyKey,
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);

console.log(
  JSON.stringify(
    {
      status: "ok",
      tests: [
        "GET /api/sfmc?action=configuration",
        "POST /api/sfmc?action=createJourneyDraft dry-run",
      ],
    },
    null,
    2,
  ),
);
