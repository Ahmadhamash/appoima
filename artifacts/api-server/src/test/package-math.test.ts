import { describe, it, expect } from "vitest";
import {
  finance,
  paymentCheck,
  seriesDates,
  packageInputSchema,
} from "../domain/packages";
const plan = {
  policy: "minimum" as const,
  initialPayment: "100",
  installmentAmount: "100",
  everySessions: 2,
  minimumPerSession: "0",
  allowManagerOverride: false,
};
describe("Independent financial and session ledgers", () => {
  it("keeps the full package debt after a partial payment", () => {
    expect(
      finance("600", "0", [{ kind: "payment", amount: "50" }]),
    ).toMatchObject({
      total: "600.000",
      paid: "50.000",
      balance: "550.000",
      status: "partially_paid",
    });
    expect(
      finance("600", "0", [
        { kind: "payment", amount: "50" },
        { kind: "payment", amount: "100" },
      ]),
    ).toMatchObject({ paid: "150.000", balance: "450.000" });
  });
  it("adds split payments exactly without rounding error", () => {
    expect(
      finance("100", "0", [
        { kind: "payment", amount: "40" },
        { kind: "payment", amount: "60" },
      ]),
    ).toMatchObject({ paid: "100.000", balance: "0.000", status: "paid" });
    expect(
      finance("0.3", "0", [
        { kind: "payment", amount: "0.1" },
        { kind: "payment", amount: "0.2" },
      ]).paid,
    ).toBe("0.300");
  });
  it("applies deposits, refunds and discounts separately", () => {
    expect(
      finance("60", "0", [{ kind: "deposit", amount: "10" }]),
    ).toMatchObject({ deposit: "10.000", balance: "50.000" });
    expect(
      finance("100", "20", [
        { kind: "payment", amount: "80" },
        { kind: "refund", amount: "30" },
      ]),
    ).toMatchObject({
      total: "80.000",
      paid: "50.000",
      status: "partially_refunded",
    });
    expect(
      finance("60", "0", [
        { kind: "deposit", amount: "10" },
        { kind: "deposit_wallet", amount: "10" },
      ]),
    ).toMatchObject({ deposit: "0.000", paid: "0.000", status: "refunded" });
  });
  it("requires 50 more before session four in a staged plan", () => {
    expect(paymentCheck("600", "150", plan, 4)).toMatchObject({
      required: "200.000",
      missing: "50.000",
      blocking: true,
    });
    expect(
      paymentCheck("600", "150", { ...plan, policy: "warning" }, 4).blocking,
    ).toBe(false);
    expect(
      paymentCheck("600", "150", { ...plan, policy: "full" }, 4).missing,
    ).toBe("450.000");
  });
  it("caps cumulative requirements at the agreed total", () => {
    expect(
      paymentCheck("600", "500", { ...plan, minimumPerSession: "100" }, 10)
        .required,
    ).toBe("600.000");
  });
  it("generates ten real weekly instants at the same Jordan time", () => {
    const dates = seriesDates("2032-01-05T10:00:00+03:00", 10, 7);
    expect(dates).toHaveLength(10);
    expect(dates[1]).toBe("2032-01-12T07:00:00.000Z");
  });
  it("rejects duplicated service entitlements and discounts above the price", () => {
    const body = {
      name: "Laser",
      items: [{ serviceId: 1, quantity: 10 }],
      originalPrice: "600",
      discount: "601",
      idempotencyKey: "e90a63ba-b593-48bf-bf3b-4ba346020736",
    };
    expect(packageInputSchema.safeParse(body).success).toBe(false);
    expect(
      packageInputSchema.safeParse({
        ...body,
        discount: "0",
        items: [...body.items, ...body.items],
      }).success,
    ).toBe(false);
  });
});
