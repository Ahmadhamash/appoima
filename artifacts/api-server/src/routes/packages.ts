import { Router } from "express";
import { z } from "zod";
import { requireAuth, requirePasswordChanged } from "../middlewares/auth";
import {
  packageInputSchema,
  assignPackageSchema,
  paymentSchema,
  refundSchema,
  walletSchema,
  useSessionSchema,
  packageStatusSchema,
  appointmentInvoiceSchema,
} from "../domain/packages";
import {
  packageCatalog,
  savePackageTemplate,
  assignPackage,
  customerBilling,
  recordPayment,
  refundPayment,
  creditWallet,
  usePackageSession,
  setPackageStatus,
  createAppointmentInvoice,
} from "../services/packages";
const router = Router(),
  id = (v: unknown) => z.coerce.number().int().positive().parse(v);
router.use("/clinic/billing", requireAuth, requirePasswordChanged);
router.get("/clinic/billing/packages", async (req, res) => {
  res.json(await packageCatalog(req.user!));
});
router.post("/clinic/billing/packages", async (req, res) => {
  res
    .status(201)
    .json(
      await savePackageTemplate(req.user!, packageInputSchema.parse(req.body)),
    );
});
router.get("/clinic/billing/customers/:id", async (req, res) => {
  res.json(await customerBilling(req.user!, id(req.params.id)));
});
router.post("/clinic/billing/customers/:id/packages", async (req, res) => {
  res
    .status(201)
    .json(
      await assignPackage(
        req.user!,
        id(req.params.id),
        assignPackageSchema.parse(req.body),
      ),
    );
});
router.post("/clinic/billing/customers/:id/wallet", async (req, res) => {
  res.json(
    await creditWallet(
      req.user!,
      id(req.params.id),
      walletSchema.parse(req.body),
    ),
  );
});
router.post("/clinic/billing/invoices/:id/payments", async (req, res) => {
  res.json(
    await recordPayment(
      req.user!,
      id(req.params.id),
      paymentSchema.parse(req.body),
    ),
  );
});
router.post("/clinic/billing/invoices/:id/refunds", async (req, res) => {
  res.json(
    await refundPayment(
      req.user!,
      id(req.params.id),
      refundSchema.parse(req.body),
    ),
  );
});
router.post(
  "/clinic/billing/patient-packages/:id/sessions",
  async (req, res) => {
    res.json(
      await usePackageSession(
        req.user!,
        id(req.params.id),
        useSessionSchema.parse(req.body),
      ),
    );
  },
);
router.post("/clinic/billing/patient-packages/:id/status", async (req, res) => {
  res.json(
    await setPackageStatus(
      req.user!,
      id(req.params.id),
      packageStatusSchema.parse(req.body),
    ),
  );
});
router.post("/clinic/billing/appointments/:id/invoice", async (req, res) => {
  res
    .status(201)
    .json(
      await createAppointmentInvoice(
        req.user!,
        id(req.params.id),
        appointmentInvoiceSchema.parse(req.body),
      ),
    );
});
export default router;
