import type { Metadata } from "next";
import { AssistantProvider } from "@/context/AssistantContext";
import { AssistantChat } from "@/components/assistant/AssistantChat";

export const metadata: Metadata = {
  title: "Personal AI Assistant",
  description:
    "Your Personal Nutrition Assistant — ask about your diet, nutrition targets, foods, and meal planning.",
};

export default function AssistantPage() {
  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-3xl flex-col px-5 py-6">
      <AssistantProvider>
        <div className="flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-sm">
          <AssistantChat />
        </div>
      </AssistantProvider>
    </div>
  );
}
