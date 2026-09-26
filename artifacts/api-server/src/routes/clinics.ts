import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth, requirePasswordChanged, requirePlatformOwner } from "../middlewares/auth";
import { createClinic, getClinic, listClinics, setClinicStatus } from "../services/clinics";
import { createStaffAccount, findClinicManagers } from "../services/auth";
import { badRequest } from "../lib/errors";

// Platform-owner routes. They expose clinic setup facts only, never customer records.
const router: IRouter = Router();

router.use("/clinics", requireAuth, requirePasswordChanged, requirePlatformOwner);

const idParam = (raw: string | undefined) => {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw badRequest("invalid_id");
  return id;
};

router.get("/clinics", async (req, res, next) => {
  try {
    const search = typeof req.query["search"] === "string" ? req.query["search"] : undefined;
    res.json({ clinics: await listClinics(search) });
  } catch (err) {
    next(err);
  }
});

const createClinicSchema = z.object({
  name: z.string().trim().min(1).max(120),
  nameLang: z.enum(["en", "ar"]),
  manager: z
    .object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().email().max(200),
      initialPassword: z.string().min(10).max(200),
    })
    .optional(),
});

router.post("/clinics", async (req, res, next) => {
  try {
    const input = createClinicSchema.parse(req.body);
    const clinic = await createClinic({
      name: input.name,
      nameLang: input.nameLang,
      manager: input.manager,
      actorUserId: req.user!.id,
    });
    res.status(201).json({ clinic: await getClinic(clinic.id) });
  } catch (err) {
    next(err);
  }
});

router.get("/clinics/:id", async (req, res, next) => {
  try {
    const id = idParam(req.params["id"]);
    const clinic = await getClinic(id);
    const managers = (await findClinicManagers(id)).map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      isActive: m.isActive,
      mustChangePassword: m.mustChangePassword,
    }));
    res.json({ clinic, managers });
  } catch (err) {
    next(err);
  }
});

const managerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  initialPassword: z.string().min(10).max(200),
});

router.post("/clinics/:id/managers", async (req, res, next) => {
  try {
    const id = idParam(req.params["id"]);
    await getClinic(id);
    const input = managerSchema.parse(req.body);
    const user = await createStaffAccount({
      clinicId: id,
      name: input.name,
      email: input.email,
      initialPassword: input.initialPassword,
      role: "manager",
      actorUserId: req.user!.id,
    });
    res.status(201).json({ manager: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    next(err);
  }
});

const statusSchema = z.object({ status: z.enum(["active", "inactive"]) });

router.patch("/clinics/:id/status", async (req, res, next) => {
  try {
    const id = idParam(req.params["id"]);
    const input = statusSchema.parse(req.body);
    await setClinicStatus(id, input.status, req.user!.id);
    res.json({ clinic: await getClinic(id) });
  } catch (err) {
    next(err);
  }
});

export default router;
