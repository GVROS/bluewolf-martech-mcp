import { getConfigurationStatus } from "../../lib/sfmc";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "bluewolf-martech-mcp",
    sfmc: getConfigurationStatus(),
    timestamp: new Date().toISOString(),
  });
}
