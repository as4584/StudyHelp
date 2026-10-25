# Spec: Marketplace (tasks, bids, hiring, delivery, reviews)

Source: client Developer Brief/RFP + Master Strategy (2026-10). Requirement ids are stable.

| Id | Requirement | Verified by |
| --- | --- | --- |
| MKT-1 | Students create tasks: subject, title, description, budget ($5–$5,000), honor-code acknowledgement required | `test_honor_code_required`, E2E |
| MKT-2 | Students may attach a rubric/screenshot (private file) | `test_task_files_are_private`, E2E form |
| MKT-3 | Only **approved, active** tutors see open tasks and bid; one bid per tutor per task (DB unique) | `test_unapproved_tutor_cannot_see_or_bid`, `test_duplicate_bid_rejected` |
| MKT-4 | Task owner sees all bids with tutor name + rating; a tutor sees only their own bid | `test_tutor_sees_only_own_bid` |
| MKT-5 | Hiring accepts one bid, rejects the rest, closes bidding, opens a conversation | `test_hire_rejects_other_bids_and_closes_task` |
| MKT-6 | Only the hired tutor marks delivery, and only after payment is held | `test_only_hired_tutor_delivers_and_only_after_payment` |
| MKT-7 | One review (1–5) per completed task; tutor rating aggregates update; tutor list sorted by rating | `test_full_marketplace_loop_with_review_updates_rating`, `test_rating_bounds` |
| MKT-8 | Student or hired tutor can open a dispute on paid/delivered tasks; one open dispute per task | `test_disputed_task_cannot_be_released` |
| MKT-9 | Open tasks can be cancelled; hired tasks cannot (checkout may be in flight) | `test_hired_task_cannot_be_cancelled` |
| MKT-10 | Users can't see/act on tasks they don't participate in (404, no existence oracle) | `test_other_student_cannot_see_or_hire` |

Positioning: tutoring/explanations only. No school-portal credential fields anywhere.
