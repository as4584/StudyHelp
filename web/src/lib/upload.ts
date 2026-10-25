"use client";

import { api } from "./api";

type UploadOut = { file_id: string; upload_url: string; token: string; path: string };

/** Ask FastAPI for a signed upload URL (server-chosen path), then PUT the file to storage. */
export async function uploadToSignedUrl(endpoint: string, file: File, kind?: string): Promise<string> {
  const signed = await api<UploadOut>(endpoint, {
    body: { filename: file.name.replace(/[^\w.\- ()]/g, "_"), ...(kind ? { kind } : {}) },
  });
  const res = await fetch(signed.upload_url, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return signed.file_id;
}
