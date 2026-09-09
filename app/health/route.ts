import { getConfigurationStatus } from "../../lib/sfmc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configured = getConfigurationStatus();
  const values = Object.values(configured);

  return Response.json(
    {
      status: "ok",
      service: "bluewolf-martech-mcp",
      version: "0.5.0",
      product: "Bluewolf MarTech Journey Factory",
      transport: "MCP Streamable HTTP",
      responseMode: "application/json",
      compatibilityMode: "ICA stateless JSON",
      mcpEndpoint: "/mcp",
      toolCount: 15,
      sfmc: configured,
      sfmcConfigurationComplete: values.length > 0 && values.every(Boolean),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
