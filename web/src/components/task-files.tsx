"use client";

import { FileText } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { uploadToSignedUrl } from "@/lib/upload";

import { ErrorText, FileButton, Section, useAction } from "./ui";

type FileOut = { id: string; kind: string; filename: string };

export function TaskFiles({
  taskId,
  canUploadRubric,
  canUploadDeliverable,
}: {
  taskId: string;
  canUploadRubric: boolean;
  canUploadDeliverable: boolean;
}) {
  const [files, setFiles] = useState<FileOut[]>([]);
  const a = useAction();
  const load = useCallback(async () => setFiles(await api<FileOut[]>(`/tasks/${taskId}/files`)), [taskId]);
  useEffect(() => {
    load().catch(() => setFiles([]));
  }, [load]);

  const kind = canUploadDeliverable ? "deliverable" : canUploadRubric ? "rubric" : null;
  if (!files.length && !kind) return null;
  return (
    <Section title="Files">
      {files.length > 0 && (
        <ul className="mb-4 divide-y divide-rule">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex min-w-0 items-center gap-2.5">
                <FileText size={16} strokeWidth={1.75} className="shrink-0 text-muted" aria-hidden />
                <span className="truncate text-[15px] text-ink">{f.filename}</span>
                <span className="text-[13px] text-muted capitalize">{f.kind}</span>
              </span>
              <button
                className="text-[14px] font-semibold text-tutor underline-offset-4 hover:underline"
                onClick={() =>
                  a.run(async () => {
                    const { url } = await api<{ url: string }>(`/files/${f.id}/download`);
                    window.open(url, "_blank", "noopener");
                  })
                }
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
      {kind && (
        <FileButton
          label={kind === "rubric" ? "Add a rubric or screenshot" : "Add a deliverable"}
          accept="image/*,.pdf,video/*"
          hint={kind === "rubric" ? "Screenshots only — never share school portal logins." : undefined}
          onFile={(f) => {
            if (f)
              void a.run(async () => {
                await uploadToSignedUrl(`/tasks/${taskId}/files`, f, kind);
                await load();
              });
          }}
        />
      )}
      <ErrorText error={a.error} />
    </Section>
  );
}
