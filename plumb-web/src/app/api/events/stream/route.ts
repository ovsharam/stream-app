import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/supabase/server";
import { getUserOrg, getLatestEvent } from "@/lib/db/cases";
import { getDb } from "@/lib/db";
import { caseEvents } from "@/lib/db/schema";
import { and, eq, gt } from "drizzle-orm";

// SSE real-time event stream for the sensor rail.
// Complements Supabase realtime — works in any environment, no WS needed.
// Polls the DB every 2s for new events and pushes them as SSE.
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const org = await getUserOrg(user.id);
  if (!org) {
    return NextResponse.json({ error: "No org" }, { status: 403 });
  }

  const { orgId } = org;

  // Baseline cursor: the latest event at connection time
  const initial = await getLatestEvent(orgId);
  let cursor = initial?.createdAt ?? new Date(0);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send the initial event immediately on connect
      if (initial) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(initial)}\n\n`),
        );
      } else {
        controller.enqueue(encoder.encode(": connected\n\n"));
      }

      const poll = async () => {
        try {
          const db = getDb();
          const rows = await db
            .select()
            .from(caseEvents)
            .where(and(eq(caseEvents.orgId, orgId), gt(caseEvents.createdAt, cursor)))
            .orderBy(caseEvents.createdAt)
            .limit(20);

          for (const row of rows) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(row)}\n\n`),
            );
            cursor = row.createdAt;
          }
        } catch {
          // DB unavailable — keep the connection alive with a comment
          controller.enqueue(encoder.encode(": db-idle\n\n"));
        }
      };

      const interval = setInterval(() => void poll(), 2000);

      // Clean up when client disconnects
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
