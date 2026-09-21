"use client";

/**
 * Part 9 — profile conflict summary.
 *
 * Explains how contradictory answers will be resolved WITHOUT silently
 * editing the user's saved profile. Renders nothing when there are no
 * conflicts, so it never adds noise to a clean profile.
 */
import { Info, PencilLine } from "lucide-react";
import { useMemo } from "react";
import { useProfile } from "@/context/ProfileContext";
import { describeConflicts } from "@/lib/conflicts";
import { Button, Card, CardBody } from "@/components/ui/core";

export function ConflictNotice({ className }: { className?: string }) {
  const { profile } = useProfile();
  const notes = useMemo(() => describeConflicts(profile), [profile]);

  if (notes.length === 0) return null;

  return (
    <Card className={className}>
      <CardBody>
        <div className="flex items-start gap-3">
          <Info
            className="mt-0.5 h-5 w-5 shrink-0 text-accent-600"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-ink">
              How your preferences were applied
            </h2>
            <ul className="mt-2 space-y-1.5">
              {notes.map((note) => (
                <li key={note} className="text-xs leading-relaxed text-muted">
                  · {note}
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Button
                href="/planner?step=2"
                variant="outline"
                size="sm"
                icon={<PencilLine className="h-3.5 w-3.5" />}
              >
                Review Preferences
              </Button>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
