"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PlumbLogo } from "@/app/plumb-logo";
import Link from "next/link";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const signInWithGoogle = async () => {
    setGoogleLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (authError) throw authError;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#fff", display: "flex", flexDirection: "column" }}>

      {/* Nav strip */}
      <nav style={{ borderBottom: "1px solid #e8e8e8", padding: "0 32px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ textDecoration: "none" }}>
          <PlumbLogo size={22} />
        </Link>
        <a href="mailto:hello@useplumb.ai" style={{ fontSize: 13, color: "#aaa", textDecoration: "none" }}>
          hello@useplumb.ai
        </a>
      </nav>

      {/* Main */}
      <div style={{ flex: 1, display: "flex" }}>

        {/* Left — brand context (hidden on small screens via CSS) */}
        <div className="login-left" style={{ width: 420, background: "#0c0c0c", padding: "64px 56px", display: "flex", flexDirection: "column", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <PlumbLogo size={24} light />
            <p style={{ marginTop: 48, fontSize: 22, fontWeight: 400, color: "#fff", lineHeight: 1.5, letterSpacing: "-0.02em", fontFamily: "var(--font-lora), Georgia, serif" }}>
              Meeting ends.<br />Build deploys.
            </p>
            <p style={{ marginTop: 20, fontSize: 13.5, color: "rgba(255,255,255,0.4)", lineHeight: 1.75 }}>
              The workspace where FDEs turn discovery calls into shipped deployments — same day.
            </p>

            <div style={{ marginTop: 48, display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                "Intake from Gong calls automatically",
                "Context gate scores scope before build",
                "Build prompt dispatched on approval",
                "Customer live before end of day",
              ].map((item) => (
                <div key={item} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <span style={{ color: "#1db584", fontSize: 11, marginTop: 2, flexShrink: 0 }}>▸</span>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", lineHeight: 1.6 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <p style={{ fontSize: 11, color: "rgba(255,255,255,0.15)", fontFamily: "var(--font-jetbrains), monospace" }}>
            © 2026 Applied Scope
          </p>
        </div>

        {/* Right — form */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 32px" }}>
          <div style={{ width: "100%", maxWidth: 380 }}>

            {sent ? (
              <div>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(29,181,132,0.1)", border: "1px solid rgba(29,181,132,0.3)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                  <span style={{ color: "#1db584", fontSize: 16 }}>✓</span>
                </div>
                <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 10 }}>
                  Check your inbox
                </h1>
                <p style={{ fontSize: 14, color: "#888", lineHeight: 1.65 }}>
                  We sent a magic link to <strong style={{ color: "#0c0c0c" }}>{email}</strong>.
                  Click it to sign in — no password needed.
                </p>
                <button
                  type="button"
                  onClick={() => { setSent(false); setEmail(""); }}
                  style={{ marginTop: 24, fontSize: 13, color: "#aaa", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  Use a different email
                </button>
              </div>
            ) : (
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 8 }}>
                  Sign in to Plumb
                </h1>
                <p style={{ fontSize: 14, color: "#888", marginBottom: 32, lineHeight: 1.6 }}>
                  Enter your work email and we&apos;ll send you a sign-in link.
                </p>

                {/* Google OAuth */}
                <button
                  type="button"
                  onClick={() => void signInWithGoogle()}
                  disabled={googleLoading}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    width: "100%",
                    padding: "11px 14px",
                    border: "1px solid #e0e0e0",
                    borderRadius: 8,
                    background: "#fff",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#0c0c0c",
                    cursor: googleLoading ? "not-allowed" : "pointer",
                    marginBottom: 20,
                    fontFamily: "var(--font-inter), sans-serif",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#0c0c0c"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e0e0e0"; }}
                >
                  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.29-8.16 2.29-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                    <path fill="none" d="M0 0h48v48H0z"/>
                  </svg>
                  {googleLoading ? "Redirecting…" : "Continue with Google"}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1, height: 1, background: "#e8e8e8" }} />
                  <span style={{ fontSize: 12, color: "#ccc" }}>or</span>
                  <div style={{ flex: 1, height: 1, background: "#e8e8e8" }} />
                </div>

                <form onSubmit={submit}>
                  <label htmlFor="email" style={{ display: "block", fontSize: 11.5, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#aaa", marginBottom: 8 }}>
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "11px 14px",
                      fontSize: 14,
                      border: "1px solid #e0e0e0",
                      borderRadius: 8,
                      outline: "none",
                      color: "#0c0c0c",
                      background: "#fff",
                      boxSizing: "border-box",
                      transition: "border-color 0.15s",
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                    onFocus={(e) => { e.target.style.borderColor = "#0c0c0c"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#e0e0e0"; }}
                  />

                  {error && (
                    <p style={{ marginTop: 10, fontSize: 13, color: "#ef4444" }}>{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={loading || !email.trim()}
                    style={{
                      display: "block",
                      width: "100%",
                      marginTop: 14,
                      padding: "11px 14px",
                      background: loading || !email.trim() ? "#888" : "#0c0c0c",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: "-0.01em",
                      cursor: loading || !email.trim() ? "not-allowed" : "pointer",
                      transition: "background 0.15s",
                      fontFamily: "var(--font-inter), sans-serif",
                    }}
                  >
                    {loading ? "Sending…" : "Send magic link"}
                  </button>
                </form>

                <p style={{ marginTop: 28, fontSize: 12.5, color: "#ccc", lineHeight: 1.6 }}>
                  Don&apos;t have access yet?{" "}
                  <Link href="/" style={{ color: "#888", textDecoration: "underline" }}>
                    Request early access
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
