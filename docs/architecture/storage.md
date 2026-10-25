# Storage

Private Supabase Storage buckets created by the baseline migration (`public = false`):

| Bucket | Contents | Path (server-chosen) |
| --- | --- | --- |
| `task-files` | rubrics/screenshots (student), deliverables (hired tutor) | `<task_id>/<file_id>/<filename>` |
| `tutor-documents` | qualification uploads | `<tutor_id>/<doc_id>/<filename>` |

- No `storage.objects` policies grant `anon`/`authenticated` anything, so clients cannot list
  or read objects directly.
- FastAPI authorizes, picks the path, and returns a short-lived **signed upload URL**
  (`/object/upload/sign/...`) or **signed download URL** (`/object/sign/...`, 300 s) using the
  server-only secret key. Filenames are restricted to `[\w.\- ()]` (no traversal).
- Access: task files → student, hired tutor, admin; approved tutors browsing an open task may
  see the rubric only. Qualification docs → the tutor and admins.

Tests: `test_task_files_are_private`, `test_tutor_documents_private`.
