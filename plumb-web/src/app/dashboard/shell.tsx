"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/pipeline", label: "Pipeline" },
  { href: "/dashboard/llm", label: "LLM Traces" },
  { href: "/dashboard/telemetry", label: "Behavior" },
  { href: "/dashboard/cicd", label: "CI / CD" },
  { href: "/dashboard/product-graph", label: "Product Graph" },
  { href: "/dashboard/integrations", label: "Integrations" },
];

const CSS = `
  :root {
    --db-bg:            #0a0a0a;
    --db-surface:       #0e0e0e;
    --db-surface-2:     #141414;
    --db-border:        #1c1c1c;
    --db-border-alt:    #2a2a2a;
    --db-text:          #e0e0e0;
    --db-text-2:        #c9c9c9;
    --db-text-3:        #888888;
    --db-text-4:        #555555;
    --db-text-5:        #444444;
    --db-text-6:        #383838;
    --db-overlay-sm:    rgba(255,255,255,0.02);
    --db-overlay-md:    rgba(255,255,255,0.05);
    --db-overlay-hover: rgba(255,255,255,0.04);
    --db-input-bg:      #141414;
    --db-input-border:  #222222;
  }
  html.db-light {
    --db-bg:            #f5f5f4;
    --db-surface:       #ffffff;
    --db-surface-2:     #f0efed;
    --db-border:        #e5e5e5;
    --db-border-alt:    #d4d4d4;
    --db-text:          #111111;
    --db-text-2:        #333333;
    --db-text-3:        #666666;
    --db-text-4:        #888888;
    --db-text-5:        #aaaaaa;
    --db-text-6:        #bbbbbb;
    --db-overlay-sm:    rgba(0,0,0,0.02);
    --db-overlay-md:    rgba(0,0,0,0.04);
    --db-overlay-hover: rgba(0,0,0,0.03);
    --db-input-bg:      #fafaf9;
    --db-input-border:  #e0e0e0;
  }

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--db-bg); transition: background 0.15s; }

  .db-shell { display: flex; min-height: 100vh; background: var(--db-bg); color: var(--db-text-2); font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; font-size: 13px; line-height: 1.5; transition: background 0.15s, color 0.15s; }
  .db-sidebar { width: 200px; background: var(--db-surface); border-right: 1px solid var(--db-border); display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; z-index: 20; transition: background 0.15s, border-color 0.15s; }
  .db-wordmark { padding: 16px 16px 12px; border-bottom: 1px solid var(--db-border); }
  .db-wordmark-name { font-size: 13px; font-weight: 600; color: var(--db-text); letter-spacing: -0.01em; }
  .db-wordmark-sub { font-size: 10px; color: var(--db-text-5); margin-top: 1px; letter-spacing: 0.05em; text-transform: uppercase; }
  .db-nav { flex: 1; padding: 6px 0; }
  .db-nav-item { display: flex; align-items: center; padding: 6px 14px; font-size: 12.5px; color: var(--db-text-4); text-decoration: none; border-left: 2px solid transparent; transition: color 0.1s; }
  .db-nav-item:hover { color: var(--db-text-3); }
  .db-nav-item.active { color: var(--db-text); background: var(--db-overlay-md); border-left-color: #cc785c; font-weight: 500; }
  .db-user { padding: 12px 14px; border-top: 1px solid var(--db-border); }
  .db-user-email { font-size: 10.5px; color: var(--db-text-5); margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .db-user-actions { display: flex; gap: 6px; align-items: center; }
  .db-signout { flex: 1; background: none; border: 1px solid var(--db-border); border-radius: 4px; padding: 4px 0; font-size: 11px; color: var(--db-text-5); cursor: pointer; transition: color 0.1s, border-color 0.1s; }
  .db-signout:hover { color: var(--db-text-3); border-color: var(--db-border-alt); }
  .db-theme-toggle { background: none; border: 1px solid var(--db-border); border-radius: 4px; padding: 4px 7px; font-size: 12px; cursor: pointer; color: var(--db-text-5); transition: color 0.1s, border-color 0.1s; line-height: 1; }
  .db-theme-toggle:hover { color: var(--db-text-3); border-color: var(--db-border-alt); }
  .db-main { flex: 1; margin-left: 200px; display: flex; flex-direction: column; min-height: 100vh; }
  .db-topbar { height: 40px; border-bottom: 1px solid var(--db-border); display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
  .db-topbar-title { font-size: 12px; font-weight: 500; color: var(--db-text-3); }
  .db-live { font-size: 10px; color: #3ecf8e; display: flex; align-items: center; gap: 4px; }
  .db-live::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: #3ecf8e; display: block; }
  .db-refresh { background: var(--db-surface-2); border: 1px solid var(--db-border-alt); border-radius: 4px; padding: 3px 10px; font-size: 11px; color: var(--db-text-4); cursor: pointer; }
  .db-refresh:hover { color: var(--db-text-3); }
  .db-stat-row { display: flex; border-bottom: 1px solid var(--db-border); flex-shrink: 0; }
  .db-stat { padding: 14px 20px; border-right: 1px solid var(--db-border); flex: 1; }
  .db-stat-label { font-size: 10px; font-weight: 500; color: var(--db-text-5); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 5px; }
  .db-stat-value { font-size: 20px; font-weight: 600; color: var(--db-text); letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
  .db-stat-value.warn { color: #e05c45; }
  .db-stat-sub { font-size: 10px; color: var(--db-text-6); margin-top: 2px; }
  .db-panes { flex: 1; display: grid; overflow: hidden; }
  .db-pane { border-right: 1px solid var(--db-border); display: flex; flex-direction: column; overflow: hidden; }
  .db-pane:last-child { border-right: none; }
  .db-pane-head { padding: 9px 16px; border-bottom: 1px solid var(--db-border); display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  .db-pane-title { font-size: 10px; font-weight: 600; color: var(--db-text-5); text-transform: uppercase; letter-spacing: 0.07em; }
  .db-pane-link { font-size: 11px; color: var(--db-text-6); text-decoration: none; }
  .db-pane-link:hover { color: var(--db-text-3); }
  .db-pane-body { flex: 1; overflow-y: auto; }
  .db-row { display: flex; align-items: center; padding: 7px 16px; border-bottom: 1px solid var(--db-surface-2); gap: 10px; }
  .db-row:hover { background: var(--db-surface-2); }
  .db-row a { text-decoration: none; display: flex; align-items: center; width: 100%; gap: 10px; }
  .db-tag { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
  .db-tag.thinking { background: rgba(204,120,92,0.15); color: #cc785c; }
  .db-tag.normal { background: var(--db-surface-2); color: var(--db-text-5); }
  .db-text-main { font-size: 12px; color: var(--db-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .db-text-mono { font-size: 11px; color: #3ecf8e; font-variant-numeric: tabular-nums; flex-shrink: 0; font-family: "JetBrains Mono", "Fira Code", monospace; }
  .db-text-dim { font-size: 10px; color: var(--db-text-6); flex-shrink: 0; }
  .db-empty { padding: 28px 16px; font-size: 12px; color: var(--db-text-6); line-height: 1.6; }
  .db-error-banner { margin: 12px 16px; background: rgba(224,82,82,0.06); border: 1px solid rgba(224,82,82,0.18); border-radius: 5px; padding: 10px 12px; font-size: 11px; color: #885555; line-height: 1.5; }
  .db-signal-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--db-surface-2); }
  .db-signal-card { background: var(--db-surface-2); border-radius: 4px; padding: 10px 6px; text-align: center; }
  .db-signal-num { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .db-signal-lbl { font-size: 9px; color: var(--db-text-5); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
  .db-bar-row { display: flex; align-items: center; gap: 8px; padding: 5px 16px; }
  .db-bar-label { font-size: 11px; color: var(--db-text-4); width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
  .db-bar-track { flex: 1; height: 3px; background: var(--db-surface-2); border-radius: 2px; overflow: hidden; }
  .db-bar-fill { height: 100%; background: #cc785c; border-radius: 2px; }
  .db-bar-count { font-size: 10px; color: var(--db-text-5); width: 18px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
  .db-ci-latest { padding: 10px 14px; border-bottom: 1px solid var(--db-border); background: var(--db-surface); flex-shrink: 0; }
  .db-ci-branch { font-size: 11px; font-weight: 500; color: var(--db-text-2); }
  .db-ci-commit { font-size: 10px; color: var(--db-text-5); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
  .db-section-label { padding: 10px 16px 6px; font-size: 10px; font-weight: 500; color: var(--db-text-6); text-transform: uppercase; letter-spacing: 0.07em; }
`;

export function DashboardShell({ children, user }: { children: React.ReactNode; user: { email: string } }) {
  const path = usePathname();
  const [light, setLight] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("db-theme");
    if (saved === "light") {
      setLight(true);
      document.documentElement.classList.add("db-light");
    }
  }, []);

  function toggleTheme() {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.classList.add("db-light");
      localStorage.setItem("db-theme", "light");
    } else {
      document.documentElement.classList.remove("db-light");
      localStorage.setItem("db-theme", "dark");
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <div className="db-shell">
        <aside className="db-sidebar">
          <div className="db-wordmark">
            <div className="db-wordmark-name">Plumb</div>
            <div className="db-wordmark-sub">Observability</div>
          </div>
          <nav className="db-nav">
            {NAV.map(({ href, label }) => {
              const active = href === "/dashboard" ? path === "/dashboard" : path.startsWith(href);
              return (
                <Link key={href} href={href} className={`db-nav-item${active ? " active" : ""}`}>
                  {label}
                </Link>
              );
            })}
          </nav>
          <div className="db-user">
            <div className="db-user-email">{user.email}</div>
            <div className="db-user-actions">
              <form action="/api/auth/signout" method="POST" style={{ flex: 1 }}>
                <button type="submit" className="db-signout">Sign out</button>
              </form>
              <button
                className="db-theme-toggle"
                onClick={toggleTheme}
                title={light ? "Switch to dark mode" : "Switch to light mode"}
              >
                {light ? "☾" : "○"}
              </button>
            </div>
          </div>
        </aside>
        <div className="db-main">{children}</div>
      </div>
    </>
  );
}
