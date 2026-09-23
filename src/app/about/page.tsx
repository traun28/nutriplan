import {
  ArrowRight,
  Database,
  FileText,
  Info,
  Layers,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import { Card, CardBody, SectionHeader } from "@/components/ui/core";

export const metadata: Metadata = {
  title: "About the Project",
  description:
    "Purpose, workflow and architecture of the Personalised Diet Planner.",
};

const WORKFLOW = [
  "User Input",
  "Validation",
  "Storage",
  "Processing",
  "Personalisation",
  "Diet Plan",
];

const STACK = [
  { name: "Next.js (App Router)", note: "Pages, routing and UI foundation" },
  { name: "React + TypeScript", note: "Components and central profile state" },
  { name: "Tailwind CSS", note: "Design system and responsive styling" },
  { name: "Browser localStorage", note: "Profile, targets and plan stored under separate keys" },
  { name: "Local food dataset", note: "Structured meals with nutrition, allergen and cuisine metadata" },
  { name: "Participant reference dataset", note: "Offline importer with validation, quality flags and analytics" },
  { name: "Universal attachments", note: "PDF/DOCX/CSV/XLSX/JSON/image extraction with review-before-import" },
  { name: "Personal AI", note: "Context-aware assistant with voice input/output and controlled actions" },
  { name: "Drizzle ORM + PostgreSQL", note: "Available for a future server-side store" },
];

const CAPABILITIES = [
  { title: "Personal profile & goals", note: "Age, body measurements, activity, goal and dietary pattern" },
  { title: "Allergies & restrictions", note: "Strict exclusions that no preference can override" },
  { title: "Food intake & habits", note: "Structured meals, timings, hydration and practical constraints" },
  { title: "Nutrition targets", note: "BMI, energy estimate and macronutrient targets from your profile" },
  { title: "Personalised diet plan", note: "Rule-based generation with an independent safety check" },
  { title: "Diet chart & print", note: "Daily plan, target-vs-planned view and a PDF-ready layout" },
  { title: "Documents & photos", note: "Import from PDF, DOCX, CSV, XLSX and more — reviewed before use" },
  { title: "Personal AI & voice", note: "Ask about your plan, search foods and act with confirmation" },
] as const;

export default function AboutPage() {
  return (
    <div className="page-container page-section max-w-5xl">
      <SectionHeader
        eyebrow="About"
        title="Personalised Diet Planner"
        description="A web-based system designed to collect user information and generate a personalised diet plan based on nutritional goals, dietary preferences and lifestyle information."
      />

      {/* Purpose */}
      <Card className="mt-10">
        <CardBody>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-brand-400" aria-hidden="true" />
            <h2 className="text-base font-bold text-ink">Purpose</h2>
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
            Generic diet charts ignore the person using them. This project takes
            the opposite approach: the user first shares who they are, what
            they want to achieve, what they can eat, and what they must avoid.
            The application then structures that information into one validated
            profile, which the application turns into a clear, personalised
            diet chart with meal timings and nutritional recommendations.
          </p>
        </CardBody>
      </Card>

      {/* Workflow */}
      <Card className="mt-5">
        <CardBody>
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-brand-400" aria-hidden="true" />
            <h2 className="text-base font-bold text-ink">How the system works</h2>
          </div>
          <ol className="mt-5 flex flex-wrap items-center gap-y-3">
            {WORKFLOW.map((step, index) => (
              <li key={step} className="flex items-center">
                <span className="rounded-pill border border-brand-400/25 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-300">
                  {step}
                </span>
                {index < WORKFLOW.length - 1 && (
                  <ArrowRight
                    className="mx-2 h-4 w-4 text-muted"
                    aria-hidden="true"
                  />
                )}
              </li>
            ))}
          </ol>
          <p className="mt-5 max-w-3xl text-xs leading-relaxed text-muted">
            The full workflow is implemented: the application collects and
            validates your information, stores it, processes it into BMI,
            energy and macronutrient estimates, generates a personalised meal
            plan with a rule-based engine, independently validates that plan
            and displays it as a printable diet chart. A separate reference
            dataset layer adds analytics and demo sample profiles without ever
            touching your own data.
          </p>
        </CardBody>
      </Card>

      <div className="mt-5 grid gap-5 md:grid-cols-2">
        {/* Architecture */}
        <Card className="h-full">
          <CardBody>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-brand-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-ink">Architecture</h2>
            </div>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                One central <strong className="text-ink">UserProfile</strong> model shared by every page
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                Reusable UI components (buttons, cards, form fields, chips)
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                A dedicated validation layer separate from the UI
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                Deterministic conflict detection for allergies and preferences
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                A single storage service that hides where data is kept
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                A pure nutrition engine, separate from every UI component
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                A rule-based diet generator with an independent safety validator
              </li>
              <li className="flex gap-2">
                <span className="font-bold text-brand-400">·</span>
                An offline dataset importer kept strictly separate from user data
              </li>
            </ul>
          </CardBody>
        </Card>

        {/* Tech stack */}
        <Card className="h-full">
          <CardBody>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-brand-400" aria-hidden="true" />
              <h2 className="text-base font-bold text-ink">Technology stack</h2>
            </div>
            <ul className="mt-4 space-y-3">
              {STACK.map((item) => (
                <li key={item.name}>
                  <p className="text-sm font-semibold text-ink">{item.name}</p>
                  <p className="text-xs text-muted">{item.note}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      {/* Capabilities */}
      <Card className="mt-5">
        <CardBody>
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand-400" aria-hidden="true" />
            <h2 className="text-base font-bold text-ink">What the planner does</h2>
          </div>
          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {CAPABILITIES.map((item) => (
              <li
                key={item.title}
                className="rounded-[10px] border border-line bg-canvas px-4 py-3"
              >
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.note}</p>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Disclaimer */}
      <div className="mt-5 flex gap-3 rounded-card border border-accent-300/40/30 bg-accent-200/30 p-5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-accent-300" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-ink/80">
          <strong>Disclaimer:</strong> this is an educational college project.
          It is not a medical application and must not be used as a substitute
          for professional medical or nutritional advice.
        </p>
      </div>
    </div>
  );
}
