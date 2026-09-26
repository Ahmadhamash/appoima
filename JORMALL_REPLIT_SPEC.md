# JorMall — standalone build specification

**Purpose:** Build a new, working web application for beauty and wellness centers in an empty Replit
project. This document is self-contained. No previous repository, screenshots, or other documents
are required. Use the business workflows below as inspiration; create original code and UI. Do not
use Cal.com or a fork.

## 1. Product goal

A new manager, receptionist, or doctor must understand their work without training. Each person
signs into the same app and lands on a screen made for their role. Show one clear next step and only
the information and actions needed for that job. Detailed settings are available on demand. Avoid
repeated actions, nested navigation, and dashboards full of metrics.

The first release is an **internal staff application**. Customer self-booking, payments, SMS,
WhatsApp, voice, marketing, loyalty, and payroll are future add-ons. Do not build fake versions of
them.

## 2. Role-specific screens and page contract

Use one application with separate, simple home screens and navigation for each role:

| Role                     | First screen                                                     | Main actions                                                                                 |
| ------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| JorMall platform owner   | All clinics: name, manager, branches, status, and setup progress | Add a clinic, assign its manager, review clinic status                                       |
| Clinic manager           | Today's clinic overview and a short setup checklist              | Add staff, choose their access, set services/hours/rooms, review appointments                |
| Secretary / receptionist | Today's appointments and waiting-list suggestions                | Create or change a booking, check in a customer, contact the next waiting customer           |
| Doctor                   | Own appointments, next customer, and treatment tasks             | Open assigned appointment, view permitted customer notes, start/finish service, record notes |
| Service provider         | Own schedule and service tasks                                   | See assigned customers, complete service, record materials used                              |

After sign-in, route users to their role's home screen. Show only menu items they can use. If a
person has more than one clinic role, combine their permitted actions without duplicating menus. The
platform owner's clinic overview must not expose private customer records by default; any
exceptional support access needs a reason and an audit event.

Within the clinic, navigation stays short: **Home**, **Appointments**, **Customers & Employees**,
and **Business** (Services, Rooms, Inventory, Settings). Appointments offers two clear choices:
**View appointments** and **Create appointment**. Calendar, full history, waiting list, and advanced
filters remain available inside that section.

The daily appointment view shows time, customer, service, employee, status, and next action. Show
only one **Create appointment** action on a page. Prefer plain-language labels such as “Confirm” and
“Check in.” Avoid displaying technical status codes to users.

Desktop navigation is compact; mobile navigation remains usable at 390 px width. Every form has
visible labels, keyboard focus, useful validation errors, and a clear save result. Do not make the
user enter the same information twice.

## 3. People, access, and organizations

The JorMall platform owner can create clinics and create their manager logins with email and an
initial password. A clinic manager configures that clinic's branches. Each branch has a name, IANA
time zone, opening hours, and optional rooms. Every customer, employee, appointment, service, room,
and inventory record belongs to one clinic. An authenticated user must never read or change another
clinic's records.

The **clinic manager** creates accounts for secretaries, doctors, service providers, and other
staff. The manager enters each person's name, email, and **initial password**, chooses a ready-made
role, then reviews and adjusts exactly which areas that person can access. Keep this as a simple
three-step form: **Role → Person and login → Access review**. The manager can later reset access or
set a new initial password. The employee must change their initial password at first sign-in.

Additional employee data: phone, job title, branch, active status, services performed, weekly
working hours, breaks, and time off. Provide ready-made roles **Manager**, **Secretary**,
**Doctor**, **Service Provider**, and **Other staff** with editable permissions. Managers can grant
only access they are authorized to grant; they cannot create a JorMall platform owner. At minimum,
distinguish reading and managing appointments, customers, employees, services, rooms, inventory, and
settings. Enforce permissions on the server, including chatbot actions.

Use secure sign-in and established session/password tooling. Hash initial passwords immediately;
never store, log, or display them in plain text after account creation. Do not implement password
hashing yourself. Provide an initial JorMall platform-owner setup flow; do not hard-code a shared
password into the repository.

### Guided screens for first-time users

- **Platform owner:** Add clinic → set clinic manager → check that the clinic is ready. Show all
  clinics in one searchable list with simple status labels.
- **Clinic manager:** Set branch hours → add services and rooms → add staff and their access →
  review the first booking. Keep this checklist on the manager home screen until finished.
- **Secretary:** Find or add customer → choose service and available time → review and book. On
  cancellation, show the next waiting-list suggestion and a single Confirm replacement action.
- **Doctor / service provider:** Open next appointment → read permitted details → start service →
  finish and record notes or actual materials used.

Show the current step and one primary action. Use short descriptions and plain-language errors.
Never show the manager's setup controls on the secretary's or doctor's first screen.

## 4. Catalog and customer records

A service has a name, duration in minutes, price and currency, predefined category, active status,
eligible employees, and optional room requirement. Category is a choice, not free text. Example
choices: Hair, Nails, Skin, Laser, Massage, Makeup, and Other. The service card shows price,
duration, and **actual recorded inventory use**; planned material requirements must be labelled
separately.

A room has a name, branch, capacity, status, and compatible services. The room screen first shows
these facts; maintenance and compatibility editing open inside the room details.

A customer has a name, at least one contact method, optional notes, and appointment history. Search
by name, phone, or email. Restrict sensitive notes to authorized roles.

## 5. Appointment workflow

Booking is a short wizard: **Customer → Service → Employee → Date and time → Review**. Offer only
valid slots based on branch hours, employee working hours and time off, service duration, and room
availability. When a service needs a room, reserve a compatible room with the appointment.

Appointment statuses: Pending, Confirmed, Checked in, In service, Completed, Cancelled, and No-show.
Show only valid next actions for the current status. Record status history, actor, and timestamp.
Support rescheduling without losing the original history.

Save instants in UTC and display them in the branch time zone. The database, not a UI availability
check, must prevent overlapping bookings for an employee or required room. Booking, cancellation,
and rescheduling must be transaction-safe and safe to retry.

## 6. Waiting list

The waiting list lives **inside Appointments**. When no suitable slot is available, staff can add a
customer with requested service, optional preferred employee, preferred day or time window, and a
short note.

After a cancellation, find compatible waiting entries by service, employee preference, duration,
branch, and requested window. Present the earliest compatible entry as a suggestion to staff. Staff
must explicitly confirm the replacement; never book automatically. Recheck availability in the
confirmation transaction. If the first suggestion is declined or no longer eligible, show the next
compatible entry. Keep an audit trail of the decision.

## 7. Inventory and service consumption

Track inventory items with name, unit, branch, current balance, and an append-only movement history.
Permit authorized staff to record receipts and adjustments. A completed service can record the
**actual quantity used** of each item. Deduct it once in a transaction and link the movement to the
appointment and service. Show the recorded total by item and unit on the service card. Do not sum
incompatible units or silently turn an estimated recipe into actual consumption.

## 8. Languages and accessibility

The full application supports English and Arabic. Arabic uses right-to-left layout, including
navigation, dialogs, tables, and form alignment. All interface messages have both translations. A
user-created name or description is entered in the selected language **once**; store the entered
text and its language without claiming it was translated. Provide a sensible fallback when viewing
it in the other interface language.

Use semantic controls, visible keyboard focus, accessible dialog behaviour, sufficient contrast, and
useful empty/loading/error states. Keep pages fast by loading only the data they need, paginating
long lists, and avoiding external fonts or heavy animations.

## 9. Chatbot and AI as add-ons

Provide an in-app staff chat panel for help with navigation and common workflows. Built-in help must
work without an AI account. Clearly indicate when generative AI is unavailable.

Keep AI behind an optional provider adapter and feature flags. If an AI provider is connected
through Replit Secrets, the assistant may answer using only the signed-in user's permitted context.
Future AI add-ons may suggest available slots, draft replies, summarize permitted appointment data,
and explain waiting-list suggestions. Future website, WhatsApp, and voice channels should plug into
the same controlled service; they are not part of this release.

AI must not query the database directly or mutate appointments directly. It may request allowlisted
server actions that independently check the center, user, permission, and input. Booking,
cancellation, rescheduling, and sending a message require explicit staff confirmation. Record AI
actions and failures in an audit log. Never claim a provider is integrated before it has been
configured and tested.

## 10. Technical and delivery requirements

Use one maintainable full-stack TypeScript application and a persistent SQL database available in
Replit; prefer PostgreSQL. Use migrations, validated request inputs, secure sessions, server-side
authorization, and environment secrets. Separate business rules from UI components, database access,
and AI provider code. Avoid microservices and unnecessary dependencies.

Build in this order:

1. Foundation: database, JorMall platform-owner setup, clinic creation, sign-in, role-based home
   screens, English/Arabic shell.
2. Manager setup: branch settings, customer records, simple staff-account creation with initial
   passwords and preset roles, services, rooms.
3. Scheduling: secretary booking flow, doctor/provider task screens, availability, daily view, state
   changes, conflict prevention.
4. Waiting list and inventory: staff-confirmed replacement and actual service consumption.
5. Optional assistant: built-in help panel, provider adapter, feature flags, and guarded actions.

At the end of each phase, run the app and test the main workflow in the browser. Keep progress
reports to a few lines and do not regenerate completed modules. Automated tests must cover
conflicting bookings, waiting-list confirmation, first-login password change, role-based home
screens, permission denial across clinics, inventory deduction exactly once, and Arabic mobile
navigation. Include sample data, database migrations, a safe platform-owner setup flow, and a
concise README with run instructions.

**Done means:** sign-in, navigation, forms, saved records, appointment state changes, waiting-list
staff confirmation, and inventory movements work against the database. A beautiful static UI or fake
integration is not a completed phase.

## Short prompt to paste into Replit Agent

> Read `JORMALL_REPLIT_SPEC.md` as the complete specification for this empty project. Implement
> Phase 1 only. Keep the solution simple and working. Run it, verify platform-owner setup, clinic
> creation, and role-based sign-in in the browser. Report completed files, test results, and the
> next phase in no more than eight lines. Do not start later phases until I ask.
