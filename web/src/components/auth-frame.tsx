import { PathLine, type Stage } from "./path-line";
import { Sheet } from "./ui";

/**
 * Frame for sign-in, sign-up and onboarding. With `path`, desktop shows one quiet StudyHelp
 * element beside the form: an editorial line and the study path it describes.
 */
export function AuthFrame({
  title,
  lede,
  children,
  footer,
  path,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  path?: { heading: string; body: string; stages: Stage[] };
}) {
  const form = (
    <div className="w-full max-w-[26rem]">
      <h1 className="font-serif text-[2.4rem] leading-[1.05] font-medium tracking-[-0.03em] text-ink">{title}</h1>
      {lede && <p className="mt-3 text-[16px] text-ink-2">{lede}</p>}
      <Sheet className="mt-7 p-6 shadow-[0_1px_2px_rgb(20_22_27/0.05),0_24px_48px_-30px_rgb(30_27_75/0.3)]">
        {children}
      </Sheet>
      {footer && <div className="mt-5 text-[14px] text-muted">{footer}</div>}
    </div>
  );
  if (!path) return <div className="mx-auto max-w-[26rem] pt-8 sm:pt-16">{form}</div>;
  return (
    <div className="grid items-center gap-16 pt-8 sm:pt-16 lg:grid-cols-[26rem_1fr] lg:gap-24">
      {form}
      <aside className="hidden border-l border-rule pl-16 lg:block" aria-hidden>
        <p className="max-w-[18ch] font-serif text-[2.25rem] leading-[1.1] font-medium tracking-[-0.025em] text-ink-2">
          {path.heading}
        </p>
        <p className="mt-4 max-w-[40ch] text-[15px] text-muted">{path.body}</p>
        <div className="mt-10 max-w-[28rem]">
          <PathLine stages={path.stages} />
        </div>
      </aside>
    </div>
  );
}
