"use client";

import { Camera } from "lucide-react";
import { useRef, useState } from "react";

import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";

const SIZE = 256;

/** Square-crop and shrink a photo in the browser so it stays well under the 200 KB limit. */
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't process photos.");
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

/** The signed-in user's avatar; tapping it uploads a new profile photo. */
export function ProfilePhoto() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return null;
  const { display_name, role, avatar_url } = me.profile;

  return (
    <>
      <button
        type="button"
        aria-label={avatar_url ? "Change profile photo" : "Add a profile photo"}
        title={avatar_url ? "Change profile photo" : "Add a profile photo"}
        disabled={busy}
        onClick={() => input.current?.click()}
        className="group relative shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tutor disabled:opacity-60"
      >
        <Avatar name={display_name} tone={role === "tutor" ? "tutor" : "muted"} src={avatar_url} />
        <span className="absolute -right-1 -bottom-1 inline-flex size-4 items-center justify-center rounded-full border border-rule bg-sheet text-ink-2 transition-colors group-hover:text-tutor">
          <Camera size={9} strokeWidth={2.25} aria-hidden />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          try {
            await api("/me", { method: "PATCH", body: { avatar_url: await toAvatarDataUrl(file) } });
            await refresh();
            toast("Profile photo updated");
          } catch {
            toast("That photo couldn't be used — try a JPG or PNG");
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
