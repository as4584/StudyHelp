# Spec: Admin

| Id | Requirement | Verified by |
| --- | --- | --- |
| ADM-1 | Admin-only API (`/admin/*`); students/tutors get 403, including via direct API calls | `test_role_guards`, E2E direct-API check |
| ADM-2 | Approve/reject tutor applications; approval immediately grants bidding | `test_admin_tutor_approval_flow_is_audited`, E2E |
| ADM-3 | Suspend/reactivate users; suspension blocks still-valid tokens; no self-suspension | `test_admin_tutor_approval_flow_is_audited`, `test_suspended_user_blocked_immediately` |
| ADM-4 | Resolve disputes by release or refund | `test_disputed_task_cannot_be_released`, `test_admin_can_resolve_dispute_by_release` |
| ADM-5 | Revenue: fees earned/pending, payouts, held, tips, refunds, payment list | `test_admin_can_resolve_dispute_by_release`, E2E stat |
| ADM-6 | Every privileged action writes `audit_logs` (append-only) | audit assertions in admin/payment tests |
| ADM-7 | Admins cannot read private chats or AI chats through the product API | `test_outsiders_cannot_read_or_write_chat` |
