# Client demo script (~8 minutes, phone-friendly)

Accounts (password `demo-password-123`, demo environment only):

| Role | Email | Language |
| --- | --- | --- |
| Student | `student@demo.gsht` | English |
| Tutor | `tutor@demo.gsht` (Prof. Diego Ramírez) | Spanish |
| Tutor | `tutor2@demo.gsht` (Dr. Aisha Bello) | English |
| Applicant | `applicant@demo.gsht` (Ravi Kumar, pending) | Hindi |
| Admin | `admin@demo.gsht` | English |

Reset before each demo: `cd api && uv run python scripts/seed.py --reset`.
Use two devices (or a phone + laptop) side by side: student on one, tutor on the other.

1. **Landing page** — the story: AI first, real experts when stuck, safe payments.
2. **Student** signs in → *Request a tutor* → Calculus, "Understand the chain rule", $40,
   tick the honor-code box (point out: screenshot rubrics, never share school logins).
3. **Tutor** (Spanish) signs in → *Set up payouts* (Stripe Express onboarding; simulated in
   demo mode) → sees the open request → bids $40.
4. **Student** sees the bid with rating → *Hire* → *Pay $40.00 securely* → test checkout.
   Payment card: $40 paid, **25% platform fee $10**, tutor receives **$30**, status *held*.
5. **Chat**: student writes in English; tutor sees it in Spanish (and vice versa). Tap
   "show original". Explain: if translation fails, the original is still delivered.
6. **Tutor** marks delivered (walkthrough + practice set).
7. **Student** *Release payment* → tutor payout created; tip $5 (100% to tutor); 5-star review.
8. **Premium**: student upgrades ($9.99/mo) → AI assistant answers → *Ask a live expert*
   pre-fills a new tutoring request from the AI conversation.
9. **Admin**: fees earned, payouts, held funds, tips; approve the pending applicant; dispute
   tools (release/refund); audit log of every privileged action.

Demo-mode honesty: the payment pages are clearly labelled DEMO MODE until Stripe test keys
are configured; AI/translation show labelled demo output until provider keys are added.
Everything else (auth, database, permissions, ledger, realtime) is the real system.
