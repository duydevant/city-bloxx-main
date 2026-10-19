import { NextResponse } from "next/server"
import { getLiveOpsConfigService } from "@/lib/liveops/service"

export async function GET() {
  const service = getLiveOpsConfigService()
  return NextResponse.json(service.getActiveContentResponse(), {
    status: 200,
    headers: service.getCacheHeaders(),
  })
}
