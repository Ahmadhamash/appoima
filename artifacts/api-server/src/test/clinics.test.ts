import { describe, it, expect, afterAll } from "vitest";
import { Fixture, agent, login, uniqueEmail } from "./helpers";
import { eq } from "drizzle-orm";
import { db, clinicsTable } from "@workspace/db";
import { ROLE_PRESETS } from "../domain/permissions";

const fx = new Fixture();
afterAll(() => fx.cleanup());

describe("platform owner clinic management", () => {
  it("creates a clinic with its manager and reports setup progress", async () => {
    const owner = await fx.createUser({ clinicId: null, role: "platform_owner" });
    const a = agent();
    await login(a, owner.email, owner.password);

    const managerEmail = uniqueEmail("mgr");
    const created = await a.post("/api/clinics").send({
      name: "Rose Clinic",
      nameLang: "en",
      manager: { name: "Mona", email: managerEmail, initialPassword: "manager-initial-1" },
    });
    expect(created.status).toBe(201);
    const clinic = created.body.clinic;
    fx.clinicIds.push(clinic.id);
    expect(clinic.manager.email).toBe(managerEmail);
    expect(clinic.progress).toMatchObject({ hasManager: true, hasBranch: false, staffCount: 1 });

    const list = await a.get("/api/clinics").query({ search: "rose" });
    expect(list.body.clinics.some((c: { id: number }) => c.id === clinic.id)).toBe(true);

    const detail = await a.get(`/api/clinics/${clinic.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.managers[0].mustChangePassword).toBe(true);

    // The manager must change the initial password at first sign-in.
    const m = await login(agent(), managerEmail, "manager-initial-1");
    expect(m.status).toBe(200);
    expect(m.body.user.mustChangePassword).toBe(true);

    const inactive = await a.patch(`/api/clinics/${clinic.id}/status`).send({ status: "inactive" });
    expect(inactive.body.clinic.status).toBe("inactive");
    expect(m.body.user.home).toBe("manager");
  });

  it("refuses duplicate manager emails", async () => {
    const owner = await fx.createUser({ clinicId: null, role: "platform_owner" });
    const a = agent();
    await login(a, owner.email, owner.password);
    const clinic = await fx.createClinic();
    const email = uniqueEmail("dup");
    const first = await a.post(`/api/clinics/${clinic.id}/managers`).send({ name: "A", email, initialPassword: "manager-initial-1" });
    expect(first.status).toBe(201);
    const second = await a.post(`/api/clinics/${clinic.id}/managers`).send({ name: "B", email, initialPassword: "manager-initial-1" });
    expect(second.status).toBe(409);
    expect(second.body.error).toBe("email_taken");
  });

  it("does not leave an orphan clinic when the manager cannot be created", async () => {
    const owner = await fx.createUser({ clinicId: null, role: "platform_owner" });
    const a = agent();
    await login(a, owner.email, owner.password);
    const clinic = await fx.createClinic();
    const email = uniqueEmail("taken");
    await a.post(`/api/clinics/${clinic.id}/managers`).send({ name: "A", email, initialPassword: "manager-initial-1" });
    const name = `Orphan check ${Date.now()}`;
    const res = await a.post("/api/clinics").send({ name, nameLang: "en", manager: { name: "B", email, initialPassword: "manager-initial-1" } });
    expect(res.status).toBe(409);
    const rows = await db.select().from(clinicsTable).where(eq(clinicsTable.name, name));
    expect(rows).toHaveLength(0);
  });

  it("locks out staff of an inactive clinic, including existing sessions", async () => {
    const owner = await fx.createUser({ clinicId: null, role: "platform_owner" });
    const clinic = await fx.createClinic();
    const manager = await fx.createUser({ clinicId: clinic.id, role: "manager", permissions: ROLE_PRESETS.manager });
    const m = agent();
    expect((await login(m, manager.email, manager.password)).status).toBe(200);
    expect((await m.get("/api/me/clinic")).status).toBe(200);

    const o = agent();
    await login(o, owner.email, owner.password);
    expect((await o.patch(`/api/clinics/${clinic.id}/status`).send({ status: "inactive" })).status).toBe(200);

    expect((await m.get("/api/me/clinic")).status).toBe(401);
    expect((await login(agent(), manager.email, manager.password)).status).toBe(401);
  });
});

describe("permission denial across clinics and roles", () => {
  it("keeps clinic users out of owner routes and other clinics", async () => {
    const clinicA = await fx.createClinic("Clinic A");
    const clinicB = await fx.createClinic("Clinic B");
    const managerA = await fx.createUser({ clinicId: clinicA.id, role: "manager", permissions: [...ROLE_PRESETS.manager] });

    const a = agent();
    await login(a, managerA.email, managerA.password);

    // Owner-only routes are forbidden even to clinic managers.
    expect((await a.get("/api/clinics")).status).toBe(403);
    expect((await a.get(`/api/clinics/${clinicB.id}`)).status).toBe(403);
    expect((await a.post(`/api/clinics/${clinicB.id}/managers`).send({ name: "X", email: uniqueEmail("x"), initialPassword: "manager-initial-1" })).status).toBe(403);

    // Own-clinic data resolves to the user's clinic only.
    const mine = await a.get("/api/me/clinic");
    expect(mine.status).toBe(200);
    expect(mine.body.clinic.id).toBe(clinicA.id);
    expect(mine.body.clinic.progress).toBeDefined();
  });

  it("hides setup progress from roles without settings access", async () => {
    const clinic = await fx.createClinic();
    const sec = await fx.createUser({ clinicId: clinic.id, role: "secretary", permissions: [...ROLE_PRESETS.secretary] });
    const a = agent();
    await login(a, sec.email, sec.password);
    const mine = await a.get("/api/me/clinic");
    expect(mine.status).toBe(200);
    expect(mine.body.clinic.progress).toBeUndefined();
  });

  it("requires sign-in", async () => {
    expect((await agent().get("/api/auth/me")).status).toBe(401);
    expect((await agent().get("/api/clinics")).status).toBe(401);
    expect((await agent().get("/api/me/clinic")).status).toBe(401);
  });
});
