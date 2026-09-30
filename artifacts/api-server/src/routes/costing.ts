import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requirePasswordChanged } from '../middlewares/auth';
import { equipmentSchema, profileSchema, quoteSchema, actualSchema, money } from '../domain/costing';
import { costingCatalog, saveEquipment, saveResourceRate, saveCostProfile, serviceCostQuote, completedCostAppointments, appointmentCost } from '../services/costing';

const router = Router(), id = (raw: unknown) => z.coerce.number().int().positive().parse(raw);
router.use('/clinic/costing', requireAuth, requirePasswordChanged);
router.get('/clinic/costing/catalog', async (req, res) => { res.json(await costingCatalog(req.user!)); });
router.post('/clinic/costing/equipment', async (req, res) => { res.status(201).json(await saveEquipment(req.user!, null, equipmentSchema.parse(req.body))); });
router.put('/clinic/costing/equipment/:id', async (req, res) => { res.json(await saveEquipment(req.user!, id(req.params.id), equipmentSchema.parse(req.body))); });
router.put('/clinic/costing/rates/:kind/:id', async (req, res) => {
  const kind = z.enum(['employees', 'rooms', 'materials']).parse(req.params.kind), body = z.object({ value: money }).strict().parse(req.body);
  res.json(await saveResourceRate(req.user!, kind, id(req.params.id), body.value));
});
router.put('/clinic/costing/services/:id', async (req, res) => { res.json(await saveCostProfile(req.user!, id(req.params.id), profileSchema.parse(req.body))); });
router.post('/clinic/costing/services/:id/quote', async (req, res) => { res.json(await serviceCostQuote(req.user!, id(req.params.id), quoteSchema.parse(req.body))); });
router.get('/clinic/costing/appointments', async (req, res) => { res.json(await completedCostAppointments(req.user!)); });
router.get('/clinic/costing/appointments/:id', async (req, res) => { res.json(await appointmentCost(req.user!, id(req.params.id))); });
router.post('/clinic/costing/appointments/:id/preview', async (req, res) => { res.json(await appointmentCost(req.user!, id(req.params.id), actualSchema.parse(req.body))); });
router.post('/clinic/costing/appointments/:id/finalize', async (req, res) => { res.json(await appointmentCost(req.user!, id(req.params.id), actualSchema.parse(req.body), true)); });
export default router;
