export const dynamic = "force-dynamic";
import { NextRequest } from "next/server";
import { handleShare } from "@/lib/adminShare";

// Admin-only Share/Unshare toggle (BL-067, §17.4).
export function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  return handleShare("workflow", params.id, req);
}
