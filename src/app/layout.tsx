import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/context/AuthContext";
import { ProfileProvider } from "@/context/ProfileContext";
import { NutritionProvider } from "@/context/NutritionContext";
import { DietPlanProvider } from "@/context/DietPlanContext";
import { AttachmentsProvider } from "@/context/AttachmentsContext";
import { DayLogProvider } from "@/context/DayLogContext";
import { MealPlanProvider } from "@/context/MealPlanContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FloatingAssistantButton } from "@/components/layout/FloatingAssistantButton";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Personalised Diet Planner",
    template: "%s · Personalised Diet Planner",
  },
  description:
    "Smart nutrition planning based on your personal goals and preferences.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-canvas font-sans text-ink antialiased">
        <AuthProvider>
        <ProfileProvider>
          <NutritionProvider>
            <DietPlanProvider>
              <AttachmentsProvider>
                <DayLogProvider>
                  <MealPlanProvider>
                  <div className="flex min-h-screen flex-col">
                    <Header />
                    <main className="flex-1">{children}</main>
                    <Footer />
                    <FloatingAssistantButton />
                  </div>
                  </MealPlanProvider>
                </DayLogProvider>
              </AttachmentsProvider>
            </DietPlanProvider>
          </NutritionProvider>
        </ProfileProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
