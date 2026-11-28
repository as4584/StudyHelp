import type { Metadata } from "next";

import { LinkButton, Sheet } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found — StudyHelp" };

export default function NotFound() {
  return (
    <div className="mx-auto max-w-[32rem] pt-10">
      <Sheet className="p-7">
        <h1 className="font-serif text-[1.75rem] leading-tight text-ink">We couldn&apos;t find that page.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          The link may be old or mistyped. Your sessions and messages are safe.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <LinkButton href="/dashboard">Go to your desk</LinkButton>
          <LinkButton href="/" variant="secondary">
            Home
          </LinkButton>
        </div>
      </Sheet>
    </div>
  );
}
