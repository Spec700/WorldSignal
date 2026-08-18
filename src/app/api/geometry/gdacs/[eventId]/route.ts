import { handleGdacsGeometryRequest } from "@/features/hazards/server/gdacs-geometry";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return handleGdacsGeometryRequest(request, context);
}
