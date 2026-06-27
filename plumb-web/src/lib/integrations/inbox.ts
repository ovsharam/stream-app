import type { IntegrationProvider } from "@/lib/types";

export interface InboxThread {
  id: string;
  provider: IntegrationProvider;
  subject: string;
  preview: string;
  receivedAt: string;
}

/** Swappable connector — stub returns demo threads until OAuth is wired. */
export async function fetchInboxThreads(
  _orgId: string,
  provider: IntegrationProvider,
): Promise<InboxThread[]> {
  if (provider === "gmail") {
    return [
      {
        id: "gmail-demo-1",
        provider: "gmail",
        subject: "Re: Atlas onboarding timeline",
        preview:
          "Can we confirm SSO requirements before the build kickoff next week?",
        receivedAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "gmail-demo-2",
        provider: "gmail",
        subject: "Northwind — Salesforce sandbox access",
        preview: "Attached OAuth scopes doc. Let us know if 200ms SLA is feasible.",
        receivedAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
  }

  return [];
}
