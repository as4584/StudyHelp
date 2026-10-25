import { Sheet } from "./ui";

/** Narrow, centred frame for sign-in, sign-up and onboarding. */
export function AuthFrame({
  title,
  lede,
  children,
  footer,
}: {
  title: string;
  lede?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[26rem] pt-8 sm:pt-16">
      <h1 className="font-serif text-[2rem] leading-tight font-medium tracking-[-0.02em] text-ink">{title}</h1>
      {lede && <p className="mt-2 text-[15px] text-ink-2">{lede}</p>}
      <Sheet className="mt-6 p-6">{children}</Sheet>
      {footer && <div className="mt-5 text-[14px] text-muted">{footer}</div>}
    </div>
  );
}
