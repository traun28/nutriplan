import type { Metadata } from "next";
import { Activity, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { HealthScreeningWorkspace } from "@/components/dataset/HealthScreeningWorkspace";
import { Card, CardBody, SectionHeader } from "@/components/ui/core";

export const metadata: Metadata = {
  title: "Health Screening Analyzer",
  description: "Import student screening data, calculate BMI, and review possible nutrition-related indicators.",
};

export default function HealthScreeningPage() {
  return (
    <RequireAuth>
      <main className="page-container page-section">
        <header className="mb-6">
          <SectionHeader
            eyebrow="Student data tool"
            title="Health Screening Analyzer"
            description="Import a student CSV, calculate screening results, and review possible nutrition-related indicators without changing your personal diet planner."
          />
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Feature icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />} title="Import CSV" text="Preview and validate student screening rows before saving them." />
          <Feature icon={<Activity className="h-5 w-5" aria-hidden="true" />} title="Calculate BMI" text="Use recorded height and weight to classify each student." />
          <Feature icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />} title="Screen safely" text="Show possible indicators, never a medical diagnosis." />
        </div>

        <HealthScreeningWorkspace />

        <p className="mt-5 text-xs leading-relaxed text-muted">
          This workspace is separate from your personal profile, nutrition targets,
          food intake, diet plan, and Personal AI context. Screening indicators are
          based only on the imported student records.
        </p>
      </main>
    </RequireAuth>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <Card>
      <CardBody className="flex gap-3 py-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-brand-50 text-brand-400">{icon}</span>
        <div><p className="text-sm font-bold text-ink">{title}</p><p className="mt-1 text-xs leading-relaxed text-muted">{text}</p></div>
      </CardBody>
    </Card>
  );
}