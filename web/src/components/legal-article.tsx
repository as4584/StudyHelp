/** A legal text (policy, terms, privacy): public, printable, one shared layout. */
export function LegalArticle({ title, note, body }: { title: string; note: string; body: string }) {
  const blocks = body.trim().split(/\n\s*\n/);
  return (
    <article className="mx-auto max-w-[68ch] pt-8 sm:pt-14">
      <div className="micro text-muted" data-testid="legal-note">
        {note}
      </div>
      <h1 className="mt-3 font-serif text-[2.1rem] leading-[1.1] font-medium tracking-[-0.025em] text-ink sm:text-[2.6rem]">
        {title}
      </h1>
      <div className="mt-8 space-y-4 font-serif text-[18px] leading-[1.65] text-ink-2">
        {blocks.map((b, i) =>
          b.startsWith("## ") ? (
            <h2 key={i} className="pt-4 font-sans text-[17px] font-semibold tracking-normal text-ink">
              {b.slice(3).trim()}
            </h2>
          ) : (
            <p key={i} className="whitespace-pre-line">
              {b.trim()}
            </p>
          ),
        )}
      </div>
    </article>
  );
}
