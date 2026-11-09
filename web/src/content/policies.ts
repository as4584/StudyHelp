/**
 * Sign-up policy texts, shown at /policies/<slug> and accepted during onboarding.
 * `version` must match VERSIONS in api/app/services/policies.py: bump both together whenever
 * the text changes, so everyone is asked to accept the new version.
 *
 * Body format: blank lines separate blocks; a block starting with "## " is a heading.
 * `rules` are the acknowledgment checkboxes from the policy's signature section; all are required.
 */
export type PolicySlug = "tutor" | "student";

export type Policy = {
  slug: PolicySlug;
  title: string;
  shortTitle: string;
  version: string;
  updated: string;
  rules: { label: string; text: string }[];
  body: string;
};

const DRAFT_NOTE = "Draft of November 8, 2026 · pending attorney review · effective November 30, 2026";

export const POLICIES: Record<PolicySlug, Policy> = {
  tutor: {
    slug: "tutor",
    title: "Tutor Policy and Independent Contractor Agreement",
    shortTitle: "Tutor Policy and Contractor Agreement",
    version: "draft-2026-11-08",
    updated: DRAFT_NOTE,
    rules: [
      {
        label: "Academic integrity",
        text: "I will never complete graded work for a student, never log into a student's school or email accounts, and never take a test or quiz for a student.",
      },
      {
        label: "No off-platform work",
        text: "All bookings, messages, sessions, and payments with platform students stay on the platform.",
      },
      {
        label: "No contact sharing",
        text: "I will never share my personal contact information with students or ask for theirs.",
      },
      {
        label: "Minors and safety",
        text: "I will keep all contact school-focused, never meet a student in person, never send any sexual or romantic content, and will report safety concerns to the Company right away.",
      },
      {
        label: "Recording consent",
        text: "I understand sessions may be recorded for safety and quality, and I consent to being recorded.",
      },
    ],
    body: `
This agreement is between Global Study Help Tutor LLC ("the Company," "we," "us") and you, the tutor ("Tutor," "you"). By signing below, you agree to all of the rules in this document. Please read it fully before you sign. If anything is not clear, ask us at ed@globalstudyhelptutor.com before signing.

## 1. Who This Is — Independent Contractor Status

1.1. Global Study Help Tutor LLC is a company formed in the State of New Jersey, United States. We run an online marketplace where students book 1-on-1 video tutoring sessions.

1.2. You join the platform as an independent contractor. You are not an employee of Global Study Help Tutor LLC. Nothing in this agreement makes you our employee, agent, or business partner.

1.3. As an independent contractor, you:
• Choose your own hours and which sessions to accept.
• Provide your own computer, internet, and work space.
• Are responsible for your own taxes. We do not take taxes out of your pay. Keep your own records and follow the tax laws of your country and state.
• May work for other companies, as long as you follow Section 4 of this agreement (you may not move our students off the platform).

1.4. We may ask you to verify your identity, your qualifications, and your right to work before we approve your account. Approval is at our discretion.

## 2. What Tutors Do

2.1. Your job is to teach, guide, and explain. You help students learn: explain ideas, work through examples together, give practice problems, share study strategies, and review the student's own work with feedback.

2.2. Sessions take place on the platform's video system, at the time booked on the platform.

2.3. Sessions are priced between $15 and $25 per hour, set through the platform.

## 3. Hard Academic Integrity Rules

These are the most serious rules on this platform. There are no second chances for breaking them.

3.1. Never complete a student's graded work. This includes homework, essays, assignments, projects, quizzes, tests, exams, or any work the student will turn in for a grade or credit. You may explain, give similar practice examples, and give feedback on work the student wrote — but the student's graded work must be the student's own.

3.2. Never log into a student's accounts. Never log into, or ask for the password to, a student's school account, learning system (such as Canvas or any other LMS), school email, or any other account that belongs to the student or the student's school.

3.3. Never take a test or quiz for a student, in whole or in part, and never sit in on a test to feed answers.

3.4. If a student asks you to do any of the above, say no, explain that tutoring is for learning, and offer to teach the topic instead. If the student keeps pushing, end the session politely and report it to us at ed@globalstudyhelptutor.com.

3.5. Penalty: Breaking any rule in this section means an immediate, permanent ban from the platform and loss (forfeiture) of any unpaid earnings for the sessions involved in the violation.

## 4. Platform Rules — No Working Off-Platform

4.1. All bookings, messages, sessions, and payments with platform students must stay on the platform. This is how students stay safe and how you get paid.

4.2. Never share personal contact information with a student — no phone numbers, personal email addresses, social media accounts, or messaging apps — and never ask a student for theirs. This rule applies in sessions, in platform messages, and anywhere else.

4.3. Never accept payment outside the platform from a student you met through the platform — no cash, no bank transfer, no payment apps, no gifts in place of payment.

4.4. Circumvention fee. Trying to move a platform student off the platform — to teach them privately, get paid directly, or book them outside the platform — is a serious violation. The result is:
• An immediate, permanent ban, and
• A circumvention fee of $250, or the platform commission on 20 booked hours with that student, whichever is greater. You agree to pay this fee if you break this rule.

4.5. Moving students off the platform may also be treated as fraud or theft of service. The Company may pursue legal action, including in court, to recover the fee and any other losses caused by circumvention or fraud.

4.6. These rules cover every student you first connected with through Global Study Help Tutor, for as long as you tutor them.

## 5. Conduct

5.1. Be professional at all times: be respectful, patient, and prepared. Dress and speak as you would in a classroom.

5.2. No harassment, discrimination, or hate speech of any kind — including based on race, ethnicity, national origin, religion, gender, sexual orientation, disability, or age.

5.3. No sexual or romantic communication with students — ever. No comments, jokes, messages, images, or requests of a sexual or romantic nature. Many students on this platform are minors (under 18). Any sexual content directed at a minor means an immediate permanent ban and a report to law enforcement.

5.4. Never meet a student in person. All contact happens through the platform.

5.5. Sessions happen only through the platform's video system. Do not move a session to a personal video account or any other app.

5.6. Recording. Sessions may be recorded by the platform for safety and quality. By signing this agreement and teaching on the platform, you consent to being recorded during sessions.

5.7. Do not use alcohol, tobacco, or drugs during a session, and do not teach while impaired.

## 6. Minors and Safety

6.1. Many students on this platform are under 18. Keep every session and message focused on school subjects and learning.

6.2. Never ask a minor for personal information beyond what the session needs (for example: no home address, no school name, no photos, no social media).

6.3. If a student tells you something that suggests they may be harmed, may harm themselves, or may harm others — or anything else that worries you — report it to the Company right away at ed@globalstudyhelptutor.com. Do not wait until the end of the week. If someone is in immediate danger, contact local emergency services first, then tell us.

6.4. Follow the child-safety laws that apply where you live, in addition to this agreement.

## 7. Scheduling, Cancellations, and No-Shows

7.1. Show up on time, ready to teach, for every session you accept. Join the session a few minutes early when you can.

7.2. If you must cancel, cancel on the platform at least 12 hours before the session start time.

7.3. A no-show (you do not join and did not cancel) or a late cancellation (less than 12 hours before) can reduce your payout for that session to zero.

7.4. Two or more no-shows or late cancellations can lead to removal from the platform, even without other violations.

7.5. If a real emergency happens, message the student through the platform as early as you can and tell us at ed@globalstudyhelptutor.com.

## 8. Pay

8.1. You keep 75% of the session price for each completed session, plus 100% of any tips the student gives you.

8.2. Pay is sent through Stripe, after the session is completed and the payment is released under the platform's payment process. You must keep a valid Stripe account connected to receive pay. You are responsible for any fees your own bank or Stripe account charges you.

8.3. If a payment is reversed or charged back because of your fraud or violation (for example, you took payment for work that broke Section 3 or Section 4), the reversed amount will be taken out of your current or future payouts.

8.4. Under Section 11, we may hold payouts for up to 30 days while sessions are under investigation for fraud or integrity violations.

## 9. Your Materials and Intellectual Property

9.1. You keep ownership of the teaching materials you create (slides, worksheets, examples, notes).

9.2. By uploading or using your materials on the platform, you give Global Study Help Tutor LLC a license to use, copy, display, and share them as needed to deliver sessions and to promote the platform.

9.3. Do not upload or present other people's copyrighted material as your own — for example, textbook text, test banks, or paid course content you do not have the right to use. You are responsible for the materials you share.

## 10. Confidentiality and Privacy

10.1. Everything you learn about a student — names, school details, grades, family information, recordings, messages — is private. Keep it that way.

10.2. Do not copy, download, share, post, or use student information for any reason outside of tutoring that student on this platform.

10.3. Do not share Company business information (pricing plans, internal messages, other tutors' information) outside the Company.

## 11. Enforcement

11.1. Depending on the violation, enforcement can include:
• Warning — a written notice about the problem.
• Suspension — your account is paused while we review, or for a set time.
• Permanent ban — your account is closed for good.

11.2. Serious violations — including anything in Section 3 (integrity), Section 4 (off-platform), or Section 5.3 (sexual content) — skip the ladder and go straight to a permanent ban.

11.3. While we investigate suspected fraud or integrity violations, we may hold your payouts for up to 30 days. If the investigation confirms a violation covered by Sections 3 or 4, unpaid earnings for the affected sessions are forfeited as described in those sections.

11.4. Ban decisions are final and at the Company's discretion.

## 12. Responsibility, Liability, and Indemnification

12.1. You are responsible for your own conduct — in sessions, in messages, and in everything you upload or share on the platform.

12.2. You agree to indemnify (cover the costs of) Global Study Help Tutor LLC — including legal fees and damages — if a claim, lawsuit, or loss is caused by your violation of this agreement or by your misconduct.

12.3. The Company may pursue damages in court for fraud, circumvention (Section 4), or any harm you cause to a minor.

12.4. Nothing in this section limits any rights the Company has under the law.

## 13. Termination

13.1. You may end this agreement at any time by closing your tutor account or writing to us at ed@globalstudyhelptutor.com.

13.2. The Company may suspend or end this agreement at any time, with or without notice, including for any violation of this agreement. A permanent ban ends this agreement immediately.

13.3. Rules that by their nature should continue — including Sections 3, 4, 10, and 12 for things that happened while you were on the platform — continue after this agreement ends.

## 14. Governing Law, Changes, and the Whole Agreement

14.1. This agreement is governed by the laws of the State of New Jersey, United States.

14.2. This document is the entire agreement between you and the Company about your work as a tutor on the platform. It replaces any earlier promises or understandings about the same topics.

14.3. We may update this agreement from time to time. We will notify you in writing (by email or platform notice) before changes take effect. Continuing to tutor after a change takes effect means you accept the updated agreement.

14.4. If a court finds one part of this agreement unenforceable, the rest of the agreement still stands.

## 15. Acknowledgment and Signature

By signing, you confirm that you read this whole agreement, understood it, and agree to follow it. A typed full legal name counts as your electronic signature and has the same effect as a handwritten signature. When you sign up, you also check each of the 5 hard rules to show you understand them:
• Academic integrity: I will never complete graded work for a student, never log into a student's school or email accounts, and never take a test or quiz for a student.
• No off-platform work: All bookings, messages, sessions, and payments with platform students stay on the platform.
• No contact sharing: I will never share my personal contact information with students or ask for theirs.
• Minors and safety: I will keep all contact school-focused, never meet a student in person, never send any sexual or romantic content, and will report safety concerns to the Company right away.
• Recording consent: I understand sessions may be recorded for safety and quality, and I consent to being recorded.

Global Study Help Tutor LLC · ed@globalstudyhelptutor.com · (551) 239-3476
`,
  },
  student: {
    slug: "student",
    title: "Student and Parent Policy and Terms of Use",
    shortTitle: "Student and Parent Policy",
    version: "draft-2026-11-08",
    updated: DRAFT_NOTE,
    rules: [
      {
        label: "Academic integrity",
        text: "I will not ask a tutor to complete graded work, write essays for me to submit, take tests or quizzes, or log into my school accounts.",
      },
      {
        label: "On-platform payments only",
        text: "I will pay only through the platform and will never pay a tutor directly or off-platform.",
      },
      {
        label: "Cancellation policy",
        text: "I understand the 12-hour rule — cancel 12+ hours ahead for a full refund/credit, less than 12 hours for 50%, and no-shows are charged in full.",
      },
      {
        label: "Recording consent",
        text: "I understand sessions may be recorded for safety and quality, and I consent to that recording.",
      },
    ],
    body: `
These terms are between Global Study Help Tutor LLC ("the Company," "we," "us") and you — the student, and, for students under 18, the parent or guardian who signs below ("you"). By using Global Study Help Tutor or signing below, you agree to these terms. Please read them fully. Questions: ed@globalstudyhelptutor.com.

## 1. What This Service Is

1.1. Global Study Help Tutor is an online platform where students book 1-on-1 video tutoring sessions with independent tutors. Sessions are priced between $15 and $25 per hour. Students may also buy an optional Premium subscription for $9.99 per month, described on the platform.

1.2. Tutoring means help to learn: explanations of ideas, guided practice, worked examples, feedback on your own work, and study guides and study strategies.

1.3. This is not a homework-doing service. Tutors teach and guide. They do not do your schoolwork for you (see Section 2).

1.4. Students must be 13 years or older to use the platform. Students under 18 must have a parent or guardian sign this policy (see Section 7).

## 2. Academic Integrity — The Learning Rules

2.1. You must not ask a tutor to:
• Complete any graded work for you — homework, assignments, projects, or essays you will turn in.
• Write an essay or paper for you to submit as your own work.
• Take, sit for, or help you during a test, quiz, or exam, or give you answers during one.
• Log into your school account, learning system (such as Canvas), or school email, or ask for your passwords.

2.2. Tutors are required to say no to these requests and to teach the topic instead. Do not keep pushing after a tutor says no.

2.3. What happens if you break this rule: first a warning, then suspension of your account, then a permanent ban — with no refund for sessions already used.

2.4. Your schoolwork must be your own. If you submit work as entirely your own that you did not really do or learn, that is your risk with your school, not ours. The Company is not responsible for any school discipline — such as a failing grade, suspension, or expulsion — that results from misusing this service.

## 3. Payments — On the Platform Only

3.1. All payments happen on the platform through our payment processor (Stripe). Session prices are $15–$25 per hour. The Premium subscription is $9.99 per month.

3.2. Never pay a tutor directly or off the platform — no cash, no payment apps, no bank transfers, no side deals, even if a tutor suggests it. If a tutor asks you to pay off-platform, please tell us at ed@globalstudyhelptutor.com.

3.3. Paying off-platform means: your account can be banned, you get no refund, and the Company takes no responsibility for anything that happens off the platform — including lost money, missed sessions, or unsafe contact.

3.4. Keep your payment information accurate and up to date. For students under 18, the parent or guardian who signs below is responsible for payments (see Section 7).

## 4. Cancellations and Refunds

4.1. You cancel 12 hours or more before the session: full refund or full credit — your choice under the platform's refund process.

4.2. You cancel less than 12 hours before the session: you receive 50% back (refund or credit).

4.3. You do not show up (no-show): the session is charged in full.

4.4. The tutor cancels or does not show up: you receive a full refund or a free rebooking.

4.5. Premium subscription: you can cancel anytime. The subscription stays active until the end of the month you already paid for, and then it does not renew. There is no partial-month refund for the current month.

4.6. Refunds go back to the original payment method through our payment processor and may take several business days to appear.

## 5. Conduct

5.1. Treat tutors with respect. No harassment, threats, hate speech, or discrimination of any kind.

5.2. No sexual content — ever. No sexual or romantic messages, images, jokes, or requests to or from a tutor. If the person involved is a minor (under 18), this means an immediate permanent ban and a report to law enforcement.

5.3. One student per account. Do not share your account, login, or password with anyone, and do not let someone else use your sessions.

5.4. Do not exchange personal contact information with tutors — no phone numbers, personal emails, or social media — and do not ask a tutor for theirs. All communication stays on the platform, where it is safer for everyone.

5.5. Keep sessions focused on learning. The Company may end a session early if conduct rules are broken, and that session is charged as used.

## 6. Safety and Recording

6.1. Sessions happen only on the platform's video system. Never move a session to a personal video app or another service.

6.2. Never meet a tutor in person. If a tutor suggests meeting in person or contacting you outside the platform, tell a parent/guardian and report it to us at ed@globalstudyhelptutor.com right away.

6.3. Recording: sessions may be recorded by the platform for safety and quality. By using this service, you (and, for a minor, the parent/guardian) consent to session recording.

6.4. Parents and guardians may ask to review information about their own child's sessions, such as scheduling, attendance, and session summaries, by writing to ed@globalstudyhelptutor.com.

6.5. If you ever feel unsafe during a session, end the session and tell a parent/guardian and the Company right away.

## 7. Parents and Guardians (Students Under 18)

7.1. An account for a student under 18 must be created or approved by a parent or legal guardian.

7.2. By signing below, the parent/guardian:
• Accepts these terms on the student's behalf,
• Accepts responsibility for all payments on the account, and
• Agrees to make sure the student follows these rules.

7.3. The parent/guardian signature in Section 11 is required before a student under 18 can book sessions.

## 8. No Guaranteed Results

8.1. Tutoring can help you learn, but we do not guarantee any result — no guaranteed grades, test scores, course passes, or admission to any school or program.

8.2. Your results depend on your own effort, attendance, and school requirements.

## 9. Enforcement, Fraud, and Chargebacks

9.1. Depending on the violation, enforcement can include a warning, a suspension, or a permanent ban. Serious violations — including sexual content involving a minor and fraud — go straight to a permanent ban.

9.2. A ban does not entitle you to a refund for sessions already used (see Section 2.3).

9.3. Fraud and chargeback abuse: if sessions were actually delivered and a payment is then reversed through a fraudulent chargeback (claiming the service never happened when it did), the account will be banned, and the Company may send the amount to collections or pursue it legally to recover the money owed, plus any fees the law allows.

9.4. Enforcement decisions are at the Company's discretion.

## 10. Responsibility, Liability, and Governing Law

10.1. The platform connects students with independent tutors. To the fullest extent allowed by law, the Company's total responsibility for any claim connected to the service is limited to the amount you paid the Company in the 3 months before the claim.

10.2. You (and, for a minor, the parent/guardian) agree to indemnify (cover the costs of) the Company — including legal fees — for claims or losses caused by your misuse of the service or your breaking of these terms.

10.3. These terms are governed by the laws of the State of New Jersey, United States.

10.4. We may update these terms from time to time. We will notify you (by email or platform notice) before changes take effect. Continuing to use the service after a change takes effect means you accept the updated terms.

10.5. If a court finds one part of these terms unenforceable, the rest still stands.

## 11. Acknowledgment and Signatures

By signing, you confirm that you read these terms, understood them, and agree to follow them. A typed full legal name counts as an electronic signature and has the same effect as a handwritten signature. When you sign up, you also check each rule to show you understand it:
• Academic integrity: I will not ask a tutor to complete graded work, write essays for me to submit, take tests or quizzes, or log into my school accounts.
• On-platform payments only: I will pay only through the platform and will never pay a tutor directly or off-platform.
• Cancellation policy: I understand the 12-hour rule — cancel 12+ hours ahead for a full refund/credit, less than 12 hours for 50%, and no-shows are charged in full.
• Recording consent: I understand sessions may be recorded for safety and quality, and I consent to that recording.

For a student under 18, a parent or guardian also signs with their full name and consents on the student's behalf before any session can be booked.

Global Study Help Tutor LLC · ed@globalstudyhelptutor.com · (551) 239-3476
`,
  },
};

export function policyHref(slug: PolicySlug) {
  return `/policies/${slug}`;
}
