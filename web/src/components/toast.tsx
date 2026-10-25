"use client";

import { CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";

/** One quiet confirmation at a time, announced politely to screen readers. */
const Ctx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [key, setKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    setKey((k) => k + 1);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {msg && (
          <div
            key={key}
            role="status"
            className="toast-in flex items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0_12px_32px_-12px_rgb(20_22_27/0.5)]"
          >
            <CircleCheck size={17} strokeWidth={2} className="text-mastery-mark" aria-hidden />
            {msg}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
