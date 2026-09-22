import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { AssistantProvider } from "@/context/AssistantContext";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export const metadata: Metadata = {
  title: "Personal AI Assistant",
  description:
    "Your Personal Nutrition Assistant — ask about your diet, nutrition targets, foods, and meal planning.",
};

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const initialPrompt = typeof q === "string" && q.trim().length > 0 && q.length <= 200 ? q.trim() : undefined;
  return (
    <RequireAuth>
      <div className="mx-auto flex h-[calc(100dvh-8rem)] min-h-[420px] w-full max-w-4xl flex-col px-2 py-3 sm:px-5 sm:py-5">
        <AssistantProvider>
          <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
            <AssistantChat initialPrompt={initialPrompt} />
          </div>
        </AssistantProvider>
      </div>
    </RequireAuth>
  );
}
