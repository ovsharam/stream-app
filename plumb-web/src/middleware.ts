import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

const DASHBOARD_ALLOWED_EMAILS = (
  process.env.DASHBOARD_ALLOWED_EMAILS ?? "apoorva.from.suno@gmail.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase());

export async function middleware(request: NextRequest) {
  const res = await updateSession(request);

  // Extra gate: /dashboard requires an allowed email
  if (request.nextUrl.pathname.startsWith("/dashboard")) {
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll: () => {},
        },
      }
    );
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    if (!DASHBOARD_ALLOWED_EMAILS.includes(user.email.toLowerCase())) {
      return new NextResponse("Forbidden — this dashboard is private.", {
        status: 403,
      });
    }
  }

  return res;
}

export const config = {
  matcher: ["/app/:path*", "/dashboard/:path*", "/login", "/auth/:path*"],
};
