import { getConfigurationStatus } from "../../lib/sfmc";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "bluewolf-martech-mcp",
    product: "Bluewolf MarTech Journey Factory",
    version: "0.3.0",
    mcpEndpoint: "/mcp",
    toolCount: 14,
    sfmc: getConfigurationStatus(),
    dataCloud: {
      connectedByThisGateway: false,
      status: "extension_point",
    },
    governance: {
      defaultWriteMode: "dry-run",
      autoPublish: false,
      humanApprovalRequired: true,
    },
    timestamp: new Date().toISOString(),
  });
}
