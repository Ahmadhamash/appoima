# Build the clinic-specific website and appointment system

You are the lead product engineer, full-stack architect, and design lead for the attached JorMall Clinic Wizard source archive. **Implement the product in the existing workspace and return a downloadable ZIP containing the complete updated project.** Do not stop at a plan, mockup, prompt, or isolated demo.

## Product intent

JorMall is a platform where a clinic owner sets up their own clinic by entering information manually, speaking with an AI assistant, or providing the clinic's public website/social links. The assistant collects verified facts, asks focused follow-up questions for missing or contradictory information, and then produces a **professional, clinic-specific public website with a fully functional appointment system**. The result should look and feel like that clinic, with coherent sections, typography, colors, imagery, copy, and service presentation. The owner previews, edits, and explicitly publishes it. This is a repeatable product for many isolated clinics, not a one-off site for the sample clinic.

## Source of truth and constraints

1. Inspect the archive before editing. The active pnpm workspace is the archive root: `artifacts/jormall`, `artifacts/api-server`, `lib/*`, and `scripts`. Read `README.md`, `CLINIC_WIZARD_README.md`, `VOICE_ONBOARDING_HANDOFF.md`, the schema/migration notes, and the relevant code. If an old `JorMall-Clinic-Staff-App` reference folder exists, do not treat it as the runnable project.
2. Extend the existing React/Vite, Express, PostgreSQL/Drizzle, authentication, clinic, service, scheduling, and concierge flows. Preserve current capabilities and tenant isolation. Do not replace the app with static HTML, a disconnected template, fake backend, or a separate demo.
3. Never include real API keys, local credentials, database dumps, or patient data in the result. AI keys remain server-side. Keep the manual setup and editing path functional when AI providers are unavailable.
4. Preserve the database migration history. Add reviewed incremental migrations for new models; do not reset or force-push a populated database. Do not run destructive migration commands against a user's data.

## End-to-end owner experience

1. The owner can start or resume setup, choose manual, voice, or links, and switch methods without losing a saved draft.
2. For public links, identify the *correct clinic* and show source URLs for extracted facts. Import only supported facts with provenance and confidence. The owner confirms the clinic identity. Do not invent treatments, prices, durations, employee credentials, working hours, medical claims, or contact details.
3. Ask only for information that remains missing or conflicts with other input. Questions should be short, natural Arabic (Jordanian-friendly) or English. Organize the information into clinic identity, branches/contact, services, staff/resources, scheduling, and website content. Make unresolved items editable.
4. For each requested service, allow a custom structured definition even when no predefined template exists. Let the owner specify scope, duration, price, branch, staff, room requirements, and booking questions. Unsupported capabilities must be marked clearly and cannot be presented as working features.
5. Generate a coherent site proposal from structured, validated clinic data: home/hero, clinic story, service catalog and detail pages, team, branches/contact, FAQs where supported, and booking entry points. Sections must be relevant to that particular clinic rather than a generic stack of placeholders. Reflect verified brand colors/logo/images or let the owner provide them. Offer sensible, editable defaults only when clearly labeled as suggestions.
6. Provide a live preview for desktop and mobile, with direct editing of content, sections, imagery, service cards, ordering, and visual settings. Draft changes must not alter the published site until the owner confirms publication. Allow later edits and republishing; support a safe rollback or published revision history.
7. After publication, expose a public clinic URL (for example a stable clinic slug/path) that visitors can open without staff login. Ensure pages have appropriate metadata, sensible accessibility, mobile layout, Arabic RTL and English LTR behavior. Define how a clinic-specific domain can be connected later without assuming one is already available.

## Real appointment behavior

The public site must use the existing scheduling system, not placeholder cards. A visitor chooses a branch, service, optional/required staff where appropriate, a genuinely available date/time in the branch time zone, completes the service-specific intake questions, and submits a booking. The server validates availability, prevents double booking, stores the appointment and answers, and returns a clear confirmation or recovery path. Integrate safe cancellation/rescheduling only where the existing business rules allow it. Keep patient-facing data private; do not expose staff-only records through public endpoints. If public booking requires a new customer verification mechanism, implement and document a suitable secure flow instead of silently bypassing authentication.

## Engineering and design quality bar

- Use a data-driven site configuration and reusable, polished section components. AI may propose structured content and theme values but must not execute generated HTML, JavaScript, SQL, or arbitrary CSS.
- Make every visual state feel finished: loading, empty, error, invalid field, preview, unpublished, and success states. The site should look professional on narrow phones and large desktop screens.
- Keep accessible labels, keyboard navigation, color contrast, readable Arabic typography, and clear booking progress.
- Preserve permission checks and tenant boundaries for every read and write. The owner manages only their clinic; a visitor sees only published public information.
- Handle concurrency and idempotency for publishing and bookings. Avoid duplicate services or duplicate appointments on retries.
- Implement the smallest sound architecture that fulfills the workflow; reuse existing components and APIs where feasible.

## Required verification

Run the relevant type checks, builds, and meaningful tests. Exercise at least these scenarios: all-manual setup; links with missing facts and owner correction; voice/text continuation of the same draft; a custom service not in a predefined template; draft preview versus published site; owner edit and republish; Arabic RTL and English LTR on desktop and mobile; successful public booking; conflicting slot; required intake fields; unauthorized management action; two clinics with different branding/content and strict data isolation. Fix failures before delivery. If a provider or external service cannot be exercised, state the exact limitation and verify the fallback path without claiming full live validation.

## Final deliverables

Return **one ZIP of the complete updated runnable workspace**, excluding `node_modules`, build caches, secrets, and database dumps. Include incremental migrations, a concise setup guide, environment-variable examples, a change summary, and the exact verification results. Include screenshots of the final owner preview and at least one published clinic site in Arabic and English if your environment supports browser rendering. In the final message, link the ZIP and state what works, what needs deployment credentials or infrastructure, and any limitations. Do not claim the website is deployed unless you actually deployed and verified it.

Begin by inspecting the attached source and identifying the shortest implementation path. Then make the changes and deliver the ZIP; do not stop after analysis.
