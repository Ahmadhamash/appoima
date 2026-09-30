import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq, and, inArray, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  branchesTable,
  customersTable,
  servicesTable,
  serviceEmployeesTable,
  appointmentsTable,
  patientPackagesTable,
  paymentEntriesTable,
  type WeeklyHours,
} from "@workspace/db";
import { Fixture, agent, login } from "./helpers";
import { ROLE_PRESETS } from "../domain/permissions";
const f = new Fixture(),
  manager = agent(),
  secretary = agent(),
  outsider = agent(),
  key = () => randomUUID();
let clinicId: number,
  customerId: number,
  branchId: number,
  serviceId: number,
  otherServiceId: number,
  employeeId: number,
  templateId: number,
  foreignServiceId: number;
const week = Object.fromEntries(
  ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [
    day,
    [{ open: "00:00", close: "23:59" }],
  ]),
) as WeeklyHours;
beforeAll(async () => {
  if (process.env.TEST_DATABASE_DISPOSABLE !== "1")
    throw Error("Requires a disposable test database");
  const clinic = await f.createClinic();
  clinicId = clinic.id;
  const m = await f.createUser({
    clinicId,
    role: "manager",
    permissions: ROLE_PRESETS.manager,
  });
  await login(manager, m.email, m.password);
  const sec = await f.createUser({
    clinicId,
    role: "secretary",
    permissions: ROLE_PRESETS.secretary,
  });
  await login(secretary, sec.email, sec.password);
  const provider = await f.createUser({
    clinicId,
    role: "doctor",
    permissions: ROLE_PRESETS.doctor,
  });
  employeeId = provider.id;
  await db
    .update(usersTable)
    .set({ workingHours: week })
    .where(eq(usersTable.id, employeeId));
  const [branch] = await db
    .insert(branchesTable)
    .values({
      clinicId,
      name: "Amman",
      timeZone: "Asia/Amman",
      openingHours: week,
    })
    .returning();
  branchId = branch!.id;
  const [customer] = await db
    .insert(customersTable)
    .values({ clinicId, name: "Package patient", phone: "0000000" })
    .returning();
  customerId = customer!.id;
  const rows = await db
    .insert(servicesTable)
    .values([
      {
        clinicId,
        branchId,
        name: "Laser",
        durationMinutes: 30,
        price: "60",
        currency: "JOD",
        category: "Laser",
        requiresRoom: false,
      },
      {
        clinicId,
        branchId,
        name: "Skin",
        durationMinutes: 30,
        price: "40",
        currency: "JOD",
        category: "Skin",
        requiresRoom: false,
      },
    ])
    .returning();
  serviceId = rows[0]!.id;
  otherServiceId = rows[1]!.id;
  await db
    .insert(serviceEmployeesTable)
    .values(rows.map((s) => ({ clinicId, serviceId: s.id, employeeId })));
  const foreign = await f.createClinic(),
    owner = await f.createUser({
      clinicId: foreign.id,
      role: "manager",
      permissions: ROLE_PRESETS.manager,
    });
  await login(outsider, owner.email, owner.password);
  const [fs] = await db
    .insert(servicesTable)
    .values({
      clinicId: foreign.id,
      name: "Foreign",
      durationMinutes: 30,
      price: "60",
      currency: "JOD",
      category: "Laser",
      requiresRoom: false,
    })
    .returning();
  foreignServiceId = fs!.id;
  const template = await manager
    .post("/api/clinic/billing/packages")
    .send({
      name: "Laser 10",
      items: [{ serviceId, quantity: 10 }],
      originalPrice: "600",
      idempotencyKey: key(),
    });
  expect(template.status, JSON.stringify(template.body)).toBe(201);
  templateId = template.body.id;
});
afterAll(async () => {
  if (f.clinicIds.length)
    await db
      .update(usersTable)
      .set({ isActive: false })
      .where(inArray(usersTable.clinicId, f.clinicIds));
});
async function assign(extra: Record<string, unknown> = {}) {
  const response = await secretary
    .post(`/api/clinic/billing/customers/${customerId}/packages`)
    .send({ templateId, idempotencyKey: key(), ...extra });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.id as number;
}
async function state(id: number) {
  const response = await manager.get(
    `/api/clinic/billing/customers/${customerId}`,
  );
  expect(response.status).toBe(200);
  return response.body.packages.find((p: { id: number }) => p.id === id);
}
async function pay(invoiceId: number, amount: string, method = "cash") {
  return secretary
    .post(`/api/clinic/billing/invoices/${invoiceId}/payments`)
    .send({ lines: [{ method, amount }], idempotencyKey: key() });
}
async function use(id: number, extra: Record<string, unknown> = {}) {
  return secretary
    .post(`/api/clinic/billing/patient-packages/${id}/sessions`)
    .send({ serviceId, idempotencyKey: key(), ...extra });
}
function booking(startsAt: string, extra: Record<string, unknown> = {}) {
  return {
    branchId,
    customerId,
    serviceId,
    employeeId,
    startsAt,
    idempotencyKey: key(),
    ...extra,
  };
}
async function complete(id: number) {
  for (const status of ["confirmed", "checked_in", "in_service", "completed"]) {
    const a = await manager.get(`/api/clinic/appointments/${id}`);
    const response = await manager
      .post(`/api/clinic/appointments/${id}/status`)
      .send({ status, expectedVersion: a.body.version, idempotencyKey: key() });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
  }
}
describe("Patient packages and immutable billing", () => {
  it("separates installments from sessions and retains the agreed price", async () => {
    const id = await assign(),
      p = await state(id);
    expect((await pay(p.invoice.id, "50")).status).toBe(200);
    expect(await state(id)).toMatchObject({
      used: 0,
      remaining: 10,
      invoice: {
        financial: { total: "600.000", paid: "50.000", balance: "550.000" },
      },
    });
    expect((await use(id)).status).toBe(200);
    expect((await pay(p.invoice.id, "100")).status).toBe(200);
    expect(await state(id)).toMatchObject({
      used: 1,
      remaining: 9,
      invoice: { financial: { paid: "150.000", balance: "450.000" } },
    });
  });
  it("preserves a completed package with unpaid financial balance", async () => {
    const id = await assign({ items: [{ serviceId, quantity: 1 }] }),
      p = await state(id);
    expect((await pay(p.invoice.id, "50")).status).toBe(200);
    expect((await use(id)).status).toBe(200);
    expect(await state(id)).toMatchObject({
      status: "completed",
      used: 1,
      remaining: 0,
      invoice: { financial: { status: "partially_paid", balance: "550.000" } },
    });
  });
  it("creates a mixed package and split payments with independent methods", async () => {
    const id = await assign({
        items: [
          { serviceId, quantity: 2 },
          { serviceId: otherServiceId, quantity: 1 },
        ],
        originalPrice: "120",
        discount: "20",
      }),
      p = await state(id),
      response = await secretary
        .post(`/api/clinic/billing/invoices/${p.invoice.id}/payments`)
        .send({
          lines: [
            { method: "cash", amount: "40" },
            { method: "visa", amount: "60", reference: "VISA-TEST" },
          ],
          idempotencyKey: key(),
        });
    expect(response.status).toBe(200);
    const saved = await state(id);
    expect(saved).toMatchObject({
      remaining: 3,
      invoice: {
        financial: { total: "100.000", paid: "100.000", balance: "0.000" },
      },
    });
    expect(
      saved.invoice.payments.map((e: { method: string }) => e.method),
    ).toEqual(["cash", "visa"]);
  });
  it("replays the same payment once and rejects changed retries", async () => {
    const id = await assign(),
      p = await state(id),
      body = {
        lines: [{ method: "cliq", amount: "25" }],
        idempotencyKey: key(),
      },
      path = `/api/clinic/billing/invoices/${p.invoice.id}/payments`;
    expect((await secretary.post(path).send(body)).status).toBe(200);
    expect((await secretary.post(path).send(body)).body.replayed).toBe(true);
    expect(
      (
        await secretary
          .post(path)
          .send({ ...body, lines: [{ method: "cliq", amount: "30" }] })
      ).status,
    ).toBe(409);
    expect((await state(id)).invoice.financial.paid).toBe("25.000");
  });
  it("prevents overpayment and never exposes another clinic", async () => {
    const id = await assign(),
      p = await state(id);
    expect((await pay(p.invoice.id, "601")).status).toBe(400);
    expect(
      (await outsider.get(`/api/clinic/billing/customers/${customerId}`))
        .status,
    ).toBe(404);
    expect(
      (
        await outsider
          .post(`/api/clinic/billing/invoices/${p.invoice.id}/payments`)
          .send({
            lines: [{ method: "cash", amount: "1" }],
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(404);
    expect(
      (
        await manager
          .post("/api/clinic/billing/packages")
          .send({
            name: "Invalid",
            items: [{ serviceId: foreignServiceId, quantity: 1 }],
            originalPrice: "10",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(400);
    expect(
      (
        await secretary
          .post("/api/clinic/billing/packages")
          .send({
            name: "Forbidden",
            items: [{ serviceId, quantity: 1 }],
            originalPrice: "10",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(403);
  });
  it("uses wallet credit atomically and does not allow two payments to overspend it", async () => {
    expect(
      (
        await secretary
          .post(`/api/clinic/billing/customers/${customerId}/wallet`)
          .send({
            amount: "100",
            note: "Test excess cash",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    const a = await assign({ originalPrice: "60" }),
      ia = (await state(a)).invoice.id;
    expect((await pay(ia, "60", "wallet")).status).toBe(200);
    const b = await assign({ originalPrice: "60" }),
      ib = (await state(b)).invoice.id,
      c = await assign({ originalPrice: "60" }),
      ic = (await state(c)).invoice.id;
    const results = await Promise.all([
      pay(ib, "30", "wallet"),
      pay(ic, "30", "wallet"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (await manager.get(`/api/clinic/billing/customers/${customerId}`)).body
        .wallet,
    ).toBe("10.000");
  });
  it("keeps a deposit distinct and converts a refund to wallet credit", async () => {
    const id = await assign({ originalPrice: "60", depositPolicy: "wallet" }),
      p = await state(id);
    expect(
      (
        await secretary
          .post(`/api/clinic/billing/invoices/${p.invoice.id}/payments`)
          .send({
            kind: "deposit",
            lines: [{ method: "cash", amount: "10" }],
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect((await state(id)).invoice.financial).toMatchObject({
      deposit: "10.000",
      balance: "50.000",
    });
    expect(
      (
        await manager
          .post(`/api/clinic/billing/invoices/${p.invoice.id}/refunds`)
          .send({
            amount: "10",
            source: "deposit",
            destination: "wallet",
            note: "Cancellation",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect((await state(id)).invoice.financial).toMatchObject({
      paid: "0.000",
      deposit: "0.000",
      status: "refunded",
    });
    expect(
      (await manager.get(`/api/clinic/billing/customers/${customerId}`)).body
        .wallet,
    ).toBe("20.000");
  });
  it("enforces the minimum and permits an audited manager override only when configured", async () => {
    const plan = {
        policy: "minimum",
        initialPayment: "100",
        installmentAmount: "100",
        everySessions: 2,
        minimumPerSession: "0",
        allowManagerOverride: true,
      },
      id = await assign({ plan }),
      p = await state(id);
    expect((await use(id)).body.error).toBe("package_payment_required");
    expect((await use(id, { overrideReason: "Not a manager" })).status).toBe(
      409,
    );
    expect(
      (
        await manager
          .post(`/api/clinic/billing/patient-packages/${id}/sessions`)
          .send({
            serviceId,
            overrideReason: "Approved exceptional treatment",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect((await pay(p.invoice.id, "100")).status).toBe(200);
    expect((await use(id)).status).toBe(200);
    expect((await use(id)).status).toBe(409);
  });
  it("rejects expired packages and respects a non refundable deposit", async () => {
    const id = await assign({ depositPolicy: "non_refundable" }),
      p = await state(id);
    expect(
      (
        await secretary
          .post(`/api/clinic/billing/invoices/${p.invoice.id}/payments`)
          .send({
            kind: "deposit",
            lines: [{ method: "cash", amount: "10" }],
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await manager
          .post(`/api/clinic/billing/invoices/${p.invoice.id}/refunds`)
          .send({
            source: "deposit",
            destination: "wallet",
            amount: "10",
            note: "Requested refund",
            idempotencyKey: key(),
          })
      ).body.error,
    ).toBe("deposit_non_refundable");
    await db
      .update(patientPackagesTable)
      .set({ expiresAt: new Date("2020-01-01") })
      .where(eq(patientPackagesTable.id, id));
    expect((await state(id)).status).toBe("expired");
    expect((await use(id)).body.error).toBe("package_not_active");
  });
  it("transfers a package deposit to wallet on cancellation without refunding ordinary payments", async () => {
    const id = await assign({ depositPolicy: "wallet" }),
      p = await state(id);
    expect(
      (
        await secretary
          .post(`/api/clinic/billing/invoices/${p.invoice.id}/payments`)
          .send({
            kind: "deposit",
            lines: [{ method: "cash", amount: "10" }],
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect((await pay(p.invoice.id, "20")).status).toBe(200);
    expect(
      (
        await manager
          .post(`/api/clinic/billing/patient-packages/${id}/status`)
          .send({
            status: "cancelled",
            reason: "Cancelled package",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect((await state(id)).invoice.financial).toMatchObject({
      paid: "20.000",
      deposit: "0.000",
      balance: "580.000",
    });
  });
  it("freezes packages without changing money and refuses to rewrite ledger rows", async () => {
    const id = await assign(),
      p = await state(id);
    expect((await pay(p.invoice.id, "10")).status).toBe(200);
    expect(
      (
        await manager
          .post(`/api/clinic/billing/patient-packages/${id}/status`)
          .send({
            status: "frozen",
            reason: "Patient travelling",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect((await use(id)).body.error).toBe("package_not_active");
    expect((await state(id)).invoice.financial.paid).toBe("10.000");
    const [entry] = await db
      .select()
      .from(paymentEntriesTable)
      .where(
        and(
          eq(paymentEntriesTable.clinicId, clinicId),
          eq(paymentEntriesTable.invoiceId, p.invoice.id),
        ),
      );
    await expect(
      db
        .update(paymentEntriesTable)
        .set({ amount: "20" })
        .where(eq(paymentEntriesTable.id, entry!.id)),
    ).rejects.toThrow();
  });
});
describe("Package appointments and weekly series", () => {
  it("reserves all weekly appointments atomically and consumes only on completion", async () => {
    const id = await assign(),
      p = await state(id);
    expect((await pay(p.invoice.id, "50")).status).toBe(200);
    const body = booking("2032-01-05T10:00:00+03:00", {
        packageId: id,
        series: { count: 10, intervalDays: 7 },
      }),
      response = await manager.post("/api/clinic/appointments").send(body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    const rows = await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.clinicId, clinicId),
          eq(appointmentsTable.customerId, customerId),
          eq(appointmentsTable.chargePrice, "0.000"),
        ),
      );
    expect(rows).toHaveLength(10);
    expect(await state(id)).toMatchObject({ used: 0, remaining: 10 });
    await complete(response.body.id);
    expect(await state(id)).toMatchObject({
      used: 1,
      remaining: 9,
      invoice: { financial: { paid: "50.000", balance: "550.000" } },
    });
    const replay = await manager.post("/api/clinic/appointments").send(body);
    expect(replay.body.replayed).toBe(true);
    expect(
      (
        await manager
          .post(`/api/clinic/appointments/${response.body.id}/charge`)
          .send({ price: "60", expectedVersion: 5, idempotencyKey: key() })
      ).body.error,
    ).toBe("package_appointment_fee_locked");
  });
  it("shows conflicts and rolls back earlier reservations in the same series", async () => {
    const taken = await manager
      .post("/api/clinic/appointments")
      .send(booking("2032-04-12T12:00:00+03:00"));
    expect(taken.status).toBe(201);
    const body = booking("2032-04-05T12:00:00+03:00", {
        series: { count: 2, intervalDays: 7 },
      }),
      { idempotencyKey: _key, ...previewBody } = body;
    const preview = await manager
      .post("/api/clinic/scheduling/series-preview")
      .send(previewBody);
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.canBook).toBe(false);
    expect(
      preview.body.sessions.map((s: { available: boolean }) => s.available),
    ).toEqual([true, false]);
    const result = await manager.post("/api/clinic/appointments").send(body);
    expect(result.status).toBe(409);
    const rows = await db
      .select()
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.clinicId, clinicId),
          eq(appointmentsTable.startsAt, new Date(body.startsAt)),
        ),
      );
    expect(rows).toHaveLength(0);
  });
  it("releases unstarted package reservations on cancellation and preserves the debt", async () => {
    const id = await assign({ items: [{ serviceId, quantity: 2 }] }),
      p = await state(id);
    expect((await pay(p.invoice.id, "50")).status).toBe(200);
    const booked = await manager
      .post("/api/clinic/appointments")
      .send(
        booking("2032-07-05T13:00:00+03:00", {
          packageId: id,
          series: { count: 2, intervalDays: 7 },
        }),
      );
    expect(booked.status).toBe(201);
    expect(
      (
        await manager
          .post(`/api/clinic/billing/patient-packages/${id}/status`)
          .send({
            status: "cancelled",
            reason: "Patient cancellation",
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect(
      (await manager.get(`/api/clinic/appointments/${booked.body.id}`)).body
        .status,
    ).toBe("cancelled");
    expect(await state(id)).toMatchObject({
      status: "cancelled",
      invoice: { financial: { paid: "50.000", balance: "550.000" } },
    });
  });
  it("automatically transfers the appointment deposit on cancellation when the policy is wallet credit", async () => {
    const booked = await manager
      .post("/api/clinic/appointments")
      .send(booking("2032-09-05T14:00:00+03:00"));
    expect(booked.status).toBe(201);
    const inv = await manager
      .post(`/api/clinic/billing/appointments/${booked.body.id}/invoice`)
      .send({ depositPolicy: "wallet", idempotencyKey: key() });
    expect(inv.status).toBe(201);
    expect(
      (
        await secretary
          .post(`/api/clinic/billing/invoices/${inv.body.id}/payments`)
          .send({
            kind: "deposit",
            lines: [{ method: "cash", amount: "10" }],
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    const a = await manager.get(`/api/clinic/appointments/${booked.body.id}`);
    expect(
      (
        await manager
          .post(`/api/clinic/appointments/${booked.body.id}/status`)
          .send({
            status: "cancelled",
            reason: "Cancelled",
            expectedVersion: a.body.version,
            idempotencyKey: key(),
          })
      ).status,
    ).toBe(200);
    expect(
      (
        await manager.get(`/api/clinic/billing/customers/${customerId}`)
      ).body.invoices.find((i: { id: number }) => i.id === inv.body.id)
        .financial.deposit,
    ).toBe("0.000");
  });
});
