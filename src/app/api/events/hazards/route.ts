import { handleHazardBatchRequest } from "@/features/hazards/server/hazard-batch";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleHazardBatchRequest(request);
}
