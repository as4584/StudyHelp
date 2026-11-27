"use client";

import { useEffect } from "react";

import { Button, LinkButton, Sheet } from "@/components/ui";

/** Shown instead of Next's bare "Application error" when a page crashes while rendering. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page error", error.digest ?? "", error.name);
  }, [error]);
  return (
    <div className="mx-auto max-w-[32rem] pt-10">
      <Sheet className="p-7">
        <h1 className="font-serif text-[1.75rem] leading-tight text-ink">Something went wrong on this page.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Nothing you saved was lost. Try again, or go back to your desk.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => reset()}>Try again</Button>
          <LinkButton href="/dashboard" variant="secondary">
            Go to your desk
          </LinkButton>
        </div>
      </Sheet>
    </div>
  );
}
