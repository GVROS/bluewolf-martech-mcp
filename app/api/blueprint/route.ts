import { buildJourneyBlueprint, type JourneyBriefing } from "../../../lib/martech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    const briefing: JourneyBriefing = {
      name: String(body.name ?? "").trim(),
      objective: String(body.objective ?? "").trim(),
      audience: String(body.audience ?? "").trim(),
      offer: String(body.offer ?? "").trim(),
      channels: stringArray(body.channels),
      entryCriteria: String(body.entryCriteria ?? "").trim(),
      exitCriteria: String(body.exitCriteria ?? "").trim(),
      businessRules: String(body.businessRules ?? "").trim(),
      dataNeeds: stringArray(body.dataNeeds),
      kpis: stringArray(body.kpis),
      requester: String(body.requester ?? "").trim(),
      technicalOwner: String(body.technicalOwner ?? "").trim(),
      approver: String(body.approver ?? "").trim(),
      notes: String(body.notes ?? "").trim(),
    };

    const missing = [
      ["name", briefing.name],
      ["objective", briefing.objective],
      ["audience", briefing.audience],
      ["offer", briefing.offer],
    ]
      .filter(([, value]) => !value)
      .map(([field]) => field);

    if (!briefing.channels.length) missing.push("channels");

    if (missing.length) {
      return Response.json(
        {
          status: "invalid_briefing",
          missing,
          message: `Preencha os campos obrigatórios: ${missing.join(", ")}.`,
        },
        { status: 400 },
      );
    }

    return Response.json(buildJourneyBlueprint(briefing), {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
