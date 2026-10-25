"use client";

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { uploadToSignedUrl } from "@/lib/upload";

import { Card, ErrorText, useAction } from "./ui";

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
  useEffect(() => void load().catch(() => setFiles([])), [load]);

  const kind = canUploadDeliverable ? "deliverable" : canUploadRubric ? "rubric" : null;
  if (!files.length && !kind) return null;
  return (
    <Card title="Files">
      <ul className="space-y-1 text-sm">
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-2">
            <span className="truncate">
              {f.filename} <span className="text-xs text-muted">({f.kind})</span>
            </span>
            <button
              className="text-brand"
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
      {kind && (
        <label className="mt-3 block text-sm">
          <span className="text-muted">Upload {kind}</span>
          <input
            type="file"
            className="mt-1 block text-sm"
            accept="image/*,.pdf,video/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f)
                void a.run(async () => {
                  await uploadToSignedUrl(`/tasks/${taskId}/files`, f, kind);
                  await load();
                });
            }}
          />
        </label>
      )}
      <ErrorText error={a.error} />
    </Card>
  );
}
