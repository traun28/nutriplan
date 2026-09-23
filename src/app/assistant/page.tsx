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
      {/* Bounded by the viewport so the chat never needs a second scrollbar,
          but wider than it used to be (max-w-3xl left it looking squeezed
          inside the 72rem page container). Every track is minmax(0,…) and the
          shell is min-w-0 so nothing can push the page past the viewport. */}
      <div className="page-container flex min-w-0 max-w-4xl flex-col py-4 sm:py-5">
        <div className="flex h-[calc(100dvh-9.5rem)] min-h-[420px] flex-col">
          <AssistantProvider>
            <div className="flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
              <AssistantChat initialPrompt={initialPrompt} />
            </div>
          </AssistantProvider>
        </div>
      </div>
    </RequireAuth>
  );
}
