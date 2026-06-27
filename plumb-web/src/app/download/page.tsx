import { PlumbLogo } from "@/app/plumb-logo";
import Link from "next/link";

const GH_REPO = "ovsharam/stream-app";

type Release = {
  tag_name: string;
  name: string;
  published_at: string;
  assets: { name: string; browser_download_url: string; size: number }[];
};

async function getLatestRelease(): Promise<Release | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return null;
    return res.json() as Promise<Release>;
  } catch {
    return null;
  }
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const dmg = release?.assets.find((a) => a.name.endsWith(".dmg"));

  return (
    <div style={{ minHeight: "100vh", background: "#0c0c0c", color: "#f0efed", fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", display: "flex", flexDirection: "column" }}>

      {/* Nav */}
      <nav style={{ borderBottom: "1px solid #1e1e1e", padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <PlumbLogo size={20} light />
        </Link>
        <div style={{ display: "flex", gap: 24 }}>
          <Link href="/login" style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", textDecoration: "none" }}>Sign in</Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", textAlign: "center" }}>

        <div style={{ marginBottom: 24 }}>
          <PlumbLogo size={48} light />
        </div>

        <h1 style={{ fontSize: 42, fontWeight: 700, letterSpacing: "-0.04em", marginBottom: 16, lineHeight: 1.1 }}>
          Download Plumb for Mac
        </h1>
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", maxWidth: 480, lineHeight: 1.7, marginBottom: 48 }}>
          The AI workspace for field engineers — turns discovery calls into live demos, same day.
          Runs natively on macOS.
        </p>

        {dmg ? (
          <div>
            <a
              href={dmg.browser_download_url}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                background: "#f0efed",
                color: "#0c0c0c",
                padding: "14px 28px",
                borderRadius: 10,
                fontSize: 15,
                fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "-0.01em",
                marginBottom: 12,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
              Download for macOS
            </a>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.25)" }}>
              {release?.tag_name} · {formatBytes(dmg.size)} · macOS 13+
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.1)",
              padding: "14px 28px",
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              color: "rgba(255,255,255,0.4)",
              marginBottom: 12,
            }}>
              Coming soon
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
              First release ships when you push a <code style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>v*</code> tag to GitHub
            </div>
          </div>
        )}

        {/* Platform note */}
        <div style={{ marginTop: 60, display: "flex", gap: 32, fontSize: 12, color: "rgba(255,255,255,0.2)" }}>
          <span>macOS 13 Ventura or later</span>
          <span>·</span>
          <span>Apple Silicon + Intel</span>
          <span>·</span>
          <span>Auto-updates</span>
        </div>

        {/* Requirements */}
        <div style={{ marginTop: 64, maxWidth: 560, textAlign: "left" }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 20 }}>
            What you get
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              ["Meeting capture", "Records and transcribes discovery calls in real time — on Zoom, Meet, or any conferencing tool"],
              ["Live feed", "Signal feed from your CRM, calendar, email, and Slack — context that matters, surfaced automatically"],
              ["Build pipeline", "Turns call context into a scoped build prompt. Dispatches to your engineering team on approval"],
              ["AI copilot", "Chat interface powered by Claude with extended reasoning — asks the right follow-up questions"],
            ].map(([title, desc]) => (
              <div key={title} style={{ display: "flex", gap: 16 }}>
                <span style={{ color: "#cc785c", fontSize: 13, marginTop: 1, flexShrink: 0 }}>▸</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 2 }}>{title}</div>
                  <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.3)", lineHeight: 1.6 }}>{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 64, fontSize: 12, color: "rgba(255,255,255,0.15)" }}>
          Need help?{" "}
          <a href="mailto:hello@useplumb.ai" style={{ color: "rgba(255,255,255,0.3)", textDecoration: "none" }}>
            hello@useplumb.ai
          </a>
        </div>
      </div>
    </div>
  );
}
