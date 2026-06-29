"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/pipeline", label: "Pipeline" },
  { href: "/dashboard/llm", label: "LLM Traces" },
  { href: "/dashboard/telemetry", label: "Behavior" },
  { href: "/dashboard/cicd", label: "CI / CD" },
  { href: "/dashboard/product-graph", label: "Product Graph" },
];

export function DashboardShell({ children, user }: { children: React.ReactNode; user: { email: string } }) {
  const path = usePathname();

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0a; }
        .db-shell { display: flex; min-height: 100vh; background: #0a0a0a; color: #c9c9c9; font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; font-size: 13px; line-height: 1.5; }
        .db-sidebar { width: 200px; background: #0e0e0e; border-right: 1px solid #1c1c1c; display: flex; flex-direction: column; position: fixed; top: 0; left: 0; bottom: 0; z-index: 20; }
        .db-wordmark { padding: 16px 16px 12px; border-bottom: 1px solid #1c1c1c; }
        .db-wordmark-name { font-size: 13px; font-weight: 600; color: #e8e8e8; letter-spacing: -0.01em; }
        .db-wordmark-sub { font-size: 10px; color: #444; margin-top: 1px; letter-spacing: 0.05em; text-transform: uppercase; }
        .db-nav { flex: 1; padding: 6px 0; }
        .db-nav-item { display: flex; align-items: center; padding: 6px 14px; font-size: 12.5px; color: #555; text-decoration: none; border-left: 2px solid transparent; transition: color 0.1s; }
        .db-nav-item:hover { color: #999; }
        .db-nav-item.active { color: #e0e0e0; background: rgba(255,255,255,0.04); border-left-color: #cc785c; font-weight: 500; }
        .db-user { padding: 12px 14px; border-top: 1px solid #1c1c1c; }
        .db-user-email { font-size: 10.5px; color: #444; margin-bottom: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .db-signout { width: 100%; background: none; border: 1px solid #1c1c1c; border-radius: 4px; padding: 4px 0; font-size: 11px; color: #444; cursor: pointer; }
        .db-signout:hover { color: #888; border-color: #333; }
        .db-main { flex: 1; margin-left: 200px; display: flex; flex-direction: column; min-height: 100vh; }
        .db-topbar { height: 40px; border-bottom: 1px solid #1c1c1c; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; flex-shrink: 0; }
        .db-topbar-title { font-size: 12px; font-weight: 500; color: #888; }
        .db-live { font-size: 10px; color: #3ecf8e; display: flex; align-items: center; gap: 4px; }
        .db-live::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: #3ecf8e; display: block; }
        .db-refresh { background: #161616; border: 1px solid #222; border-radius: 4px; padding: 3px 10px; font-size: 11px; color: #555; cursor: pointer; }
        .db-refresh:hover { color: #888; }
        .db-stat-row { display: flex; border-bottom: 1px solid #1c1c1c; flex-shrink: 0; }
        .db-stat { padding: 14px 20px; border-right: 1px solid #1c1c1c; flex: 1; }
        .db-stat-label { font-size: 10px; font-weight: 500; color: #444; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 5px; }
        .db-stat-value { font-size: 20px; font-weight: 600; color: #e0e0e0; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
        .db-stat-value.warn { color: #e05c45; }
        .db-stat-sub { font-size: 10px; color: #383838; margin-top: 2px; }
        .db-panes { flex: 1; display: grid; overflow: hidden; }
        .db-pane { border-right: 1px solid #1c1c1c; display: flex; flex-direction: column; overflow: hidden; }
        .db-pane:last-child { border-right: none; }
        .db-pane-head { padding: 9px 16px; border-bottom: 1px solid #1c1c1c; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
        .db-pane-title { font-size: 10px; font-weight: 600; color: #444; text-transform: uppercase; letter-spacing: 0.07em; }
        .db-pane-link { font-size: 11px; color: #383838; text-decoration: none; }
        .db-pane-link:hover { color: #666; }
        .db-pane-body { flex: 1; overflow-y: auto; }
        .db-row { display: flex; align-items: center; padding: 7px 16px; border-bottom: 1px solid #141414; gap: 10px; }
        .db-row:hover { background: #111; }
        .db-row a { text-decoration: none; display: flex; align-items: center; width: 100%; gap: 10px; }
        .db-tag { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 5px; border-radius: 3px; flex-shrink: 0; }
        .db-tag.thinking { background: rgba(204,120,92,0.15); color: #cc785c; }
        .db-tag.normal { background: #1a1a1a; color: #444; }
        .db-text-main { font-size: 12px; color: #888; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
        .db-text-mono { font-size: 11px; color: #3ecf8e; font-variant-numeric: tabular-nums; flex-shrink: 0; font-family: "JetBrains Mono", "Fira Code", monospace; }
        .db-text-dim { font-size: 10px; color: #383838; flex-shrink: 0; }
        .db-empty { padding: 28px 16px; font-size: 12px; color: #383838; line-height: 1.6; }
        .db-error-banner { margin: 12px 16px; background: #1a1111; border: 1px solid #3a1c1c; border-radius: 5px; padding: 10px 12px; font-size: 11px; color: #885555; line-height: 1.5; }
        .db-signal-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; padding: 12px 16px; border-bottom: 1px solid #141414; }
        .db-signal-card { background: #141414; border-radius: 4px; padding: 10px 6px; text-align: center; }
        .db-signal-num { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
        .db-signal-lbl { font-size: 9px; color: #444; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
        .db-bar-row { display: flex; align-items: center; gap: 8px; padding: 5px 16px; }
        .db-bar-label { font-size: 11px; color: #555; width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex-shrink: 0; }
        .db-bar-track { flex: 1; height: 3px; background: #1a1a1a; border-radius: 2px; overflow: hidden; }
        .db-bar-fill { height: 100%; background: #cc785c; border-radius: 2px; }
        .db-bar-count { font-size: 10px; color: #444; width: 18px; text-align: right; flex-shrink: 0; font-variant-numeric: tabular-nums; }
        .db-ci-latest { padding: 10px 14px; border-bottom: 1px solid #1c1c1c; background: #0e0e0e; flex-shrink: 0; }
        .db-ci-branch { font-size: 11px; font-weight: 500; color: #c0c0c0; }
        .db-ci-commit { font-size: 10px; color: #444; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 2px; }
        .db-section-label { padding: 10px 16px 6px; font-size: 10px; font-weight: 500; color: #383838; text-transform: uppercase; letter-spacing: 0.07em; }
      `}</style>
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
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="db-signout">Sign out</button>
            </form>
          </div>
        </aside>
        <div className="db-main">{children}</div>
      </div>
    </>
  );
}
