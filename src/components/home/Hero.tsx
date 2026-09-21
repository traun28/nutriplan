"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, ShieldAlert, Sparkles } from "lucide-react";
import { Badge, Button } from "@/components/ui/core";

const POINTS = ["No medical jargon", "Privacy-friendly by design", "Free to use"];

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative isolate overflow-hidden">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        poster="/hero-poster.jpg"
        aria-hidden="true"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-r from-canvas via-canvas/85 to-canvas/35"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-canvas via-transparent to-canvas/40"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-16 lg:grid-cols-[1.15fr_0.85fr] lg:pb-28 lg:pt-24">
        <div>
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          >
            <Badge tone="brand">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Smart nutrition, made personal
            </Badge>
          </motion.div>
          <motion.h1
            className="mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-[3.4rem]"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            Your Diet.{" "}
            <span className="text-brand-400">Your Goals.</span> Your Plan.
          </motion.h1>
          <motion.p
            className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            Create a personalised meal plan based on your lifestyle,
            nutritional goals, food preferences and dietary requirements.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center gap-3"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <Button href="/planner" size="lg" icon={<ArrowRight className="h-4 w-4" />}>
              Create My Diet Plan
            </Button>
            <Button href="#how-it-works" size="lg" variant="outline">
              Learn How It Works
            </Button>
          </motion.div>
          <motion.ul
            className="mt-8 flex flex-wrap gap-x-6 gap-y-2"
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            {POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 text-sm font-medium text-muted"
              >
                <Check className="h-4 w-4 text-brand-400" aria-hidden="true" />
                {point}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div
          className="relative hidden lg:block"
          initial={reduce ? false : { opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="absolute -bottom-2 left-4 rounded-card border border-line bg-surface/90 p-4 shadow-pop backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-brand-400">
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
        </motion.div>
      </div>
    </section>
  );
}
