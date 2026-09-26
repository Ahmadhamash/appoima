import { Router, type IRouter } from "express";
import { requireAuth, requirePasswordChanged } from "../middlewares/auth";
import { getClinic } from "../services/clinics";
import { hasPermission } from "../domain/permissions";
import { notFound } from "../lib/errors";

// Clinic-scoped facts for the signed-in user's own clinic.
const router: IRouter = Router();

router.get("/me/clinic", requireAuth, requirePasswordChanged, async (req, res, next) => {
  try {
    const user = req.user!;
    if (!user.clinicId) throw notFound("no_clinic");
    const clinic = await getClinic(user.clinicId);
    const canSeeSetup = hasPermission(user, "settings.read");
    res.json({
      clinic: {
        id: clinic.id,
        name: clinic.name,
        nameLang: clinic.nameLang,
        status: clinic.status,
        // Setup progress is a manager concern; other roles only get the clinic identity.
        progress: canSeeSetup ? clinic.progress : undefined,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
