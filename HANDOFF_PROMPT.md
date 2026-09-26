# Implement the clinic-specific INTERNAL appointment workspace

Latest owner correction: التخصيص داخل نظام المواعيد الحالي، بلا موقع عام أو خطوة نشر.

Continue working in the existing root pnpm workspace: artifacts/jormall, artifacts/api-server, lib/*,
and scripts. Read README.md, SETUP_GUIDE.md, INTERNAL_WORKSPACE_DELIVERY.md and VERIFICATION.md first.
Do not treat historical reference folders as the runnable app. Deliver code, not a plan or separate demo.

The owner supplies clinic/service facts manually, through the existing voice orb, or via explicit
public clinic links. Keep exactly three main entry cards and one shared revisioned saved draft.
Local text is continuation, not a fourth setup product. Ask focused questions for missing facts,
keep source provenance/confidence, confirm clinic identity and accept proposed facts individually.
Never invent services, prices, durations, branches, schedules, staff credentials or medical claims.

Personalize only the existing authenticated system: clinic names, logo, colors, private preview and
service sections. Keep the core navigation/modules and original capabilities fixed. Create only explicitly
requested service scope (men's beard laser only must not add full-body or unrelated treatments).
Support custom definitions, intake questions, available branches/resources and unsupported-feature warnings.

Owner preview/editing is private. Review and save applies operational configuration within the system;
there is no public website, anonymous booking route, publication step, domain or published revision model.
Keep the existing authenticated appointment flow, patient privacy and real availability/intake rules.
Use existing screens for branches, staff, rooms and working hours rather than silently provisioning them.

Preserve the PostgreSQL/Drizzle migration history, transactional writes, server-side credentials, explicit
permissions, tenant boundaries and idempotent/revision-checked operations. Never reset a populated database
or use push-force. Keep provider-free manual/local paths working. AI can supply only validated structured
facts, never executable HTML, JavaScript, SQL or arbitrary CSS. Prevent removed services from returning
from old model context and retain owner corrections and failed-save input.

Run full typecheck/build and real database/API/browser tests when infrastructure is available; the current
VERIFICATION.md explicitly records what was and was not exercised. Do not reclassify mock/component passes
as live end-to-end verification. Report exact missing credentials/infrastructure and unresolved failures.

Return one complete updated workspace ZIP, excluding dependencies, build caches, real secrets, patient
records and database dumps. Include additive migrations, setup guidance, change inventory, precise test
results and correctly labeled screenshots. Do not claim deployment unless actually deployed and checked.
