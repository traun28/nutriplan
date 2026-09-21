/**
 * Landing page sections (composed by src/app/page.tsx).
 * Server components — interactivity is delegated to small client
 * primitives (Reveal, Button).
 */
import {
  ArrowRight,
  CalendarClock,
  ChartPie,
  Check,
  ClipboardList,
  Cpu,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Badge, Button, SectionHeader } from "@/components/ui/core";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

export function HomeHero() {
  return (
    <section className="relative overflow-hidden">
      {/* Soft decorative blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-200/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 top-40 h-80 w-80 rounded-full bg-accent-200/40 blur-3xl"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_0.95fr] lg:pb-28 lg:pt-20">
        <div>
          <Reveal>
            <Badge tone="brand">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Smart nutrition, made personal
            </Badge>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]">
              Your Diet.{" "}
              <span className="text-brand-700">Your Goals.</span> Your Plan.
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              Create a personalised meal plan based on your lifestyle,
              nutritional goals, food preferences and dietary requirements.
            </p>
          </Reveal>
          <Reveal delay={240}>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button href="/planner" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
                Create My Diet Plan
              </Button>
              <Button href="#how-it-works" size="lg" variant="outline">
                Learn How It Works
              </Button>
            </div>
          </Reveal>
          <Reveal delay={320}>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
              {[
                "No medical jargon",
                "Privacy-friendly by design",
                "Free to use",
              ].map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-2 text-sm font-medium text-muted"
                >
                  <Check className="h-4 w-4 text-brand-600" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={200} className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-card border border-line bg-brand-50 shadow-lift">
            {/* next/image: served resized + compressed per device, with the
                intrinsic ratio reserved above so the layout never shifts. */}
            <Image
              src="/images/hero-bowl.svg"
              alt="Fresh balanced meal bowl with vegetables, greens and grains"
              fill
              priority
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover"
            />
          </div>
          <div className="absolute -bottom-5 -left-3 rounded-card border border-line bg-white/95 p-4 shadow-pop backdrop-blur sm:-left-6">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-700">
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold text-ink">
                  Allergy-aware by design
                </p>
                <p className="text-xs text-muted">
                  Declared allergens stay out of your plan
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Short introduction                                                  */
/* ------------------------------------------------------------------ */

const INTRO_POINTS = [
  {
    title: "Share your details",
    text: "A friendly questionnaire collects your profile, goals and food preferences.",
  },
  {
    title: "We organise it",
    text: "Your answers become one structured, validated nutrition profile.",
  },
  {
    title: "Plan with confidence",
    text: "Later stages turn that profile into a clear, personalised diet chart.",
  },
];

export function HomeIntro() {
  return (
    <section className="border-y border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <Reveal>
          <SectionHeader
            eyebrow="What is this?"
            title="A structured path to better eating"
            description="The Personalised Diet Planner takes the guesswork out of healthy eating. Instead of a generic chart, it builds a plan around you — your body, your routine, your taste, and your restrictions."
          />
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {INTRO_POINTS.map((point, index) => (
            <Reveal key={point.title} delay={index * 90}>
              <div className="h-full rounded-card border border-line bg-canvas p-6">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-brand-600">
                  0{index + 1}
                </span>
                <h3 className="mt-2 text-base font-bold text-ink">
                  {point.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {point.text}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works                                                        */
/* ------------------------------------------------------------------ */

const WORKFLOW_STEPS = [
  {
    number: "01",
    title: "Enter Your Details",
    text: "Tell us about yourself — age, height, weight, activity and routine.",
    status: "Ready",
    icon: UserRound,
    live: true,
  },
  {
    number: "02",
    title: "Set Your Preferences",
    text: "Choose your goal, dietary pattern, allergies and favourite foods.",
    status: "Ready",
    icon: SlidersHorizontal,
    live: true,
  },
  {
    number: "03",
    title: "We Process Your Information",
    text: "Your profile is validated, saved and turned into nutrition targets.",
    status: "Ready",
    icon: Cpu,
    live: true,
  },
  {
    number: "04",
    title: "Generate Your Personalised Plan",
    text: "A meal plan is built around your goals, tastes and restrictions.",
    status: "Ready",
    icon: Sparkles,
    live: true,
  },
  {
    number: "05",
    title: "View Your Diet Chart",
    text: "See meals, timings, calories and recommendations in one place.",
    status: "Ready",
    icon: ClipboardList,
    live: true,
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <SectionHeader
            eyebrow="How it works"
            title="From your details to your diet chart"
            description="Five clear steps take you from your details to a personalised, printable diet chart."
          />
        </Reveal>

        <ol className="mt-12 grid gap-5 md:grid-cols-5">
          {WORKFLOW_STEPS.map((step, index) => (
            <Reveal key={step.number} delay={index * 80} className="h-full">
              <li className="relative flex h-full flex-col rounded-card border border-line bg-white p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "grid h-10 w-10 place-items-center rounded-[10px]",
                      step.live
                        ? "bg-brand-600 text-white"
                        : "bg-line/70 text-muted",
                    )}
                  >
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-2xl font-extrabold tracking-tight text-line">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-4 text-sm font-bold leading-snug text-ink">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-xs leading-relaxed text-muted">
                  {step.text}
                </p>
                <span className="mt-auto pt-4">
                  <Badge tone={step.live ? "brand" : "neutral"}>
                    {step.status}
                  </Badge>
                </span>
              </li>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Features                                                            */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    title: "Personalised Planning",
    text: "Meals are chosen around your profile instead of a one-size-fits-all chart.",
    tag: "Ready",
    icon: ClipboardList,
  },
  {
    title: "Goal-Based Nutrition",
    text: "Your plan adapts to whether you want to lose, maintain or gain.",
    tag: "Ready",
    icon: Target,
  },
  {
    title: "Dietary Preferences",
    text: "Vegetarian, vegan, eggetarian and more — captured now, applied later.",
    tag: "Ready",
    icon: SlidersHorizontal,
  },
  {
    title: "Allergy Awareness",
    text: "Declared allergens and intolerances are stored as strict exclusions.",
    tag: "Ready",
    icon: ShieldAlert,
  },
  {
    title: "Nutrition Overview",
    text: "Calories and macronutrients presented clearly on your diet chart.",
    tag: "Ready",
    icon: ChartPie,
  },
  {
    title: "Flexible Meal Planning",
    text: "Preferred meal times and eating patterns are respected by the plan.",
    tag: "Ready",
    icon: CalendarClock,
  },
];

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 border-y border-line bg-white">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <Reveal>
          <SectionHeader
            eyebrow="Key features"
            title="What the planner will provide"
            description="Everything below is live — from nutrition targets to a printable diet chart, document import and a voice assistant."
          />
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Reveal key={feature.title} delay={(index % 3) * 80}>
              <article className="group h-full rounded-card border border-line bg-canvas p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift">
                <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-brand-50 text-brand-700 transition-colors duration-200 group-hover:bg-brand-600 group-hover:text-white">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-4 text-base font-bold text-ink">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {feature.text}
                </p>
                <span className="mt-4 inline-block">
                  <Badge tone={feature.tag === "Ready" ? "brand" : "neutral"}>
                    {feature.tag}
                  </Badge>
                </span>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Why personalisation matters                                         */
/* ------------------------------------------------------------------ */

const WHY_POINTS = [
  "Generic plans ignore your goals, body and routine.",
  "Allergies and intolerances need real exclusions, not footnotes.",
  "Your cuisine and habits decide whether a plan is actually followed.",
  "Steady, sustainable changes beat short, extreme diets.",
];

export function WhyPersonalisation() {
  return (
    <section>
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-2">
        <Reveal>
          <div>
            <SectionHeader
              eyebrow="Why it matters"
              title="A plan that actually fits your life"
              description="Most diet charts are written for an imaginary average person. The Personalised Diet Planner is built around the opposite idea: the plan should adapt to you."
            />
            <p className="mt-5 text-sm leading-relaxed text-muted sm:text-base">
              Every answer you give — your activity level, your goal, the foods
              you love and the ones you must avoid — shapes the plan you will
              eventually receive. That is why the questionnaire comes first,
              and the diet chart comes last.
            </p>
          </div>
        </Reveal>
        <Reveal delay={120}>
          <ul className="grid gap-4">
            {WHY_POINTS.map((point, index) => (
              <li
                key={point}
                className="flex items-start gap-4 rounded-card border border-line bg-white p-5 shadow-card"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
                  <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{point}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Reason {index + 1} of {WHY_POINTS.length}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Call to action                                                      */
/* ------------------------------------------------------------------ */

export function CTASection() {
  return (
    <section className="px-5 pb-24">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-card bg-brand-800 px-8 py-16 text-center shadow-lift sm:px-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-600/60 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-accent-500/20 blur-3xl"
          />
          <div className="relative">
            <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Ready to build a plan that fits you?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-brand-100 sm:text-base">
              It starts with two short steps. Your details and preferences are
              saved as you go — you can review everything before any plan is
              generated.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link
                href="/planner"
                className="inline-flex items-center gap-2 rounded-pill bg-white px-7 py-3.5 text-base font-semibold text-brand-800 shadow-[0_8px_20px_rgba(0,0,0,0.2)] transition-all duration-200 hover:bg-brand-50 hover:shadow-[0_10px_24px_rgba(0,0,0,0.25)] active:translate-y-px"
              >
                Start the Planner
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center rounded-pill border border-white/30 px-7 py-3.5 text-base font-semibold text-white transition-colors duration-200 hover:bg-white/10"
              >
                About the Project
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
