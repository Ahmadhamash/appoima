import { describe, it, expect, afterAll } from "vitest";
import { Fixture, agent, login, uniqueEmail } from "./helpers";
import { platformOwnerExists } from "../services/auth";
import { homeScreenFor, navFor, ROLE_PRESETS } from "../domain/permissions";

const fx = new Fixture();
afterAll(() => fx.cleanup());

describe("platform owner setup", () => {
  it("creates the owner once and then refuses", async () => {
    const a = agent();
    const status = await a.get("/api/setup/status");
    expect(status.status).toBe(200);
    const hadOwner = await platformOwnerExists();
    const email = uniqueEmail("owner");
    const res = await a.post("/api/setup").send({ name: "Owner", email, password: "owner-password-1" });
    if (hadOwner) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe("setup_already_done");
    } else {
      expect(res.status).toBe(201);
      await fx.trackUserByEmail(email);
      expect(res.body.user.home).toBe("owner");
      const again = await agent().post("/api/setup").send({ name: "X", email: uniqueEmail("owner2"), password: "owner-password-2" });
      expect(again.status).toBe(409);
    }
  });

  it("rejects weak setup passwords", async () => {
    const res = await agent().post("/api/setup").send({ name: "Owner", email: uniqueEmail("o"), password: "short" });
    expect([400, 409]).toContain(res.status);
  });
});

describe("sign-in and role-based home screens", () => {
  it("routes each role to its own home and hides menus it cannot use", async () => {
    const clinic = await fx.createClinic();
    const cases = [
      { role: "manager", home: "manager", nav: ["home", "appointments", "people", "business"] },
      { role: "secretary", home: "secretary", nav: ["home", "appointments", "people", "business"] },
      { role: "doctor", home: "doctor", nav: ["home", "appointments", "people", "business"] },
      { role: "service_provider", home: "provider", nav: ["home", "appointments", "people", "business"] },
      { role: "other_staff", home: "staff", nav: ["home", "appointments", "people"] },
    ] as const;
    for (const c of cases) {
      const u = await fx.createUser({ clinicId: clinic.id, role: c.role, permissions: [...ROLE_PRESETS[c.role]] });
      const res = await login(agent(), u.email, u.password);
      expect(res.status).toBe(200);
      expect(res.body.user.home).toBe(c.home);
      expect(res.body.user.nav).toEqual(c.nav);
      expect(res.body.user.passwordHash).toBeUndefined();
    }
    expect(homeScreenFor({ role: "platform_owner" })).toBe("owner");
    expect(navFor({ role: "platform_owner", permissions: [], clinicId: null })).toEqual(["home"]);
  });

  it("rejects wrong passwords without revealing whether the email exists", async () => {
    const clinic = await fx.createClinic();
    const u = await fx.createUser({ clinicId: clinic.id, role: "secretary" });
    const wrong = await login(agent(), u.email, "nope-nope-nope");
    const missing = await login(agent(), uniqueEmail("ghost"), "nope-nope-nope");
    expect(wrong.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(wrong.body).toEqual(missing.body);
  });
});

describe("first-login password change", () => {
  it("blocks clinic data until the initial password is replaced", async () => {
    const clinic = await fx.createClinic();
    const u = await fx.createUser({
      clinicId: clinic.id,
      role: "secretary",
      permissions: [...ROLE_PRESETS.secretary],
      mustChangePassword: true,
    });
    const a = agent();
    const res = await login(a, u.email, u.password);
    expect(res.body.user.mustChangePassword).toBe(true);

    const blocked = await a.get("/api/me/clinic");
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("password_change_required");

    const badCurrent = await a.post("/api/auth/change-password").send({ currentPassword: "wrong", newPassword: "brand-new-pass-1" });
    expect(badCurrent.status).toBe(400);

    const changed = await a.post("/api/auth/change-password").send({ currentPassword: u.password, newPassword: "brand-new-pass-1" });
    expect(changed.status).toBe(200);
    expect(changed.body.user.mustChangePassword).toBe(false);

    const ok = await a.get("/api/me/clinic");
    expect(ok.status).toBe(200);
    expect(ok.body.clinic.id).toBe(clinic.id);

    // New password works, old one does not.
    expect((await login(agent(), u.email, u.password)).status).toBe(401);
    expect((await login(agent(), u.email, "brand-new-pass-1")).status).toBe(200);
  });
});
