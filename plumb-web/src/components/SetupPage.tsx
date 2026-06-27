import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function SetupPage({ message }: { message?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-lg rounded-xl border border-line bg-panel p-8 space-y-4">
        <h1 className="text-xl font-semibold text-text">Database setup needed</h1>
        <p className="text-sm text-text-muted">
          Auth is wired, but the FDE board needs a Postgres connection string.
        </p>
        {message && (
          <pre className="text-xs font-mono text-amber bg-bg border border-line rounded p-3 overflow-x-auto">
            {message}
          </pre>
        )}
        <ol className="text-sm text-text-muted list-decimal list-inside space-y-2">
          <li>
            Supabase → Project Settings → Database → copy the{" "}
            <strong className="text-text">URI</strong> connection string
          </li>
          <li>
            Set <code className="font-mono text-signal">DATABASE_URL</code> in{" "}
            <code className="font-mono">plumb-web/.env.local</code>
          </li>
          <li>
            Run <code className="font-mono">supabase/migrations/001_initial.sql</code>{" "}
            in the Supabase SQL editor
          </li>
          <li>
            Run <code className="font-mono">npm run db:seed</code> from{" "}
            <code className="font-mono">plumb-web/</code>
          </li>
        </ol>
        <p className="text-xs text-text-muted">
          Also add redirect URL{" "}
          <code className="font-mono text-signal">http://localhost:3002/auth/callback</code>{" "}
          under Supabase → Authentication → URL configuration.
        </p>
        <Button asChild variant="secondary">
          <Link href="/login">Back to login</Link>
        </Button>
      </div>
    </div>
  );
}
