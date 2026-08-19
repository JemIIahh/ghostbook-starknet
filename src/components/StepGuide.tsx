"use client";

/**
 * Where am I, and what do I do next?
 *
 * Trading privately has a required order — connect, shield, then trade — and skipping a step fails
 * on-chain rather than in the UI. This reflects real state (wallet, network, shielded balance,
 * deployment) and always points at exactly one next action.
 */

import Link from "next/link";
import { Check } from "lucide-react";

export type StepState = "done" | "current" | "todo";

export type Step = {
  label: string;
  state: StepState;
  /** Shown under the label when this is the step to do. */
  hint?: string;
  href?: string;
};

export default function StepGuide({ steps }: { steps: Step[] }) {
  return (
    <ol className="grid sm:grid-cols-3 gap-px bg-border border border-border">
      {steps.map((step, index) => {
        const body = (
          <>
            <div className="flex items-center gap-2.5">
              <span
                className={`w-5 h-5 shrink-0 grid place-items-center rounded-full border text-[10px] mono ${
                  step.state === "done"
                    ? "border-primary bg-primary text-white"
                    : step.state === "current"
                      ? "border-primary text-primary"
                      : "border-border text-text-ghost"
                }`}
              >
                {step.state === "done" ? <Check className="w-3 h-3" /> : index + 1}
              </span>
              <span
                className={`text-[13px] font-medium ${
                  step.state === "todo" ? "text-text-tertiary" : "text-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
            {step.state === "current" && step.hint ? (
              <p className="mt-2 pl-[30px] hint">{step.hint}</p>
            ) : null}
          </>
        );

        const interactive = step.href && step.state !== "done";
        return (
          <li key={step.label} className="bg-background px-4 py-3.5">
            {interactive ? (
              <Link href={step.href!} className="block group hover:opacity-90 transition-opacity">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
