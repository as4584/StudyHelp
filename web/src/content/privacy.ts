/**
 * The Privacy Policy, shown at /privacy. Same body format as policies.ts (blank lines separate
 * blocks; "## " starts a heading). Not an accepted-at-sign-up policy, so it has no version or
 * rules. Going final: paste the attorney's text into `body` and set `final: true`.
 */
import { BUSINESS } from "./site";

export const PRIVACY = {
  title: "Privacy Policy",
  final: false,
  updated: "Draft of November 27, 2026 · pending attorney review · effective November 30, 2026",
  body: `
This policy explains what information Global Study Help Tutor LLC ("the Company," "we," "us") collects when you use Global Study Help Tutor, how we use it, and the choices you have. Questions: ${BUSINESS.email}.

## 1. What We Collect

Account details: your email address, display name, role (student, parent/guardian or tutor), preferred language and, if you add one, a profile photo.

Sign-up and consent records: the policies you accepted and when, your full name and date of birth, and — for students under 18 — the parent or guardian's name and consent.

Tutor applications: subjects, levels, experience, rate, bio and any documents you upload for vetting.

Learning activity: the help requests you post, offers, messages between students and tutors (and their translations), files you share in a session, questions you ask the AI study helper, reviews, and dispute reports.

Video sessions: sessions may be recorded for safety and quality, as described in the Student and Tutor policies.

Payments: payments are processed by our payment processor, Stripe. We receive the payment status and amounts; we never see or store your full card number.

Technical data: basic logs needed to run and secure the service, such as request times and error reports.

## 2. How We Use It

To run the service: matching students with tutors, holding and releasing payments, translating chat, and answering study questions.

To keep people safe: vetting tutors, enforcing the academic-integrity and conduct rules, reviewing reports and disputes, and protecting minors.

To communicate with you about your account, sessions and payments.

We do not sell your personal information, and we do not use it for third-party advertising.

## 3. Who We Share It With

The other person in your session sees what they need: your display name, photo, messages, shared files and session details.

Service providers that run parts of the platform for us (for example payments, hosting, translation and video) process information only to provide that service.

Authorities, when the law requires it or when someone may be in danger.

## 4. Students Under 18

Students under 13 may not use the service. Students aged 13–17 need a parent or guardian's consent before booking a session. Parents and guardians may ask to review information about their own child's sessions by writing to ${BUSINESS.email}.

## 5. Your Choices

You can update your name, language and photo at any time in the app. You can ask us for a copy of your information, to correct it, or to delete your account by writing to ${BUSINESS.email}. Some records — such as payment and safety records — may be kept for as long as the law requires.

## 6. Security

Information is sent over encrypted connections, access is limited to people who need it, and payment card details stay with the payment processor.

## 7. Changes

If we change this policy in a meaningful way, we will update the date above and tell you in the app or by email.

${BUSINESS.name} · ${BUSINESS.email} · ${BUSINESS.phone}
`,
};
