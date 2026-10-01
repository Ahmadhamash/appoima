import { Router, type IRouter } from "express";
import { z } from "zod";
import { archiveBranch, archivedBranches, branchArchive, draftBranchArchives } from '../services/branch-archive';
import { requireAuth, requirePasswordChanged, requirePermission } from "../middlewares/auth";
import { forbidden } from "../lib/errors";
import { branchSchema, serviceSchema, serviceBatchSchema, roomSchema, customerSchema, employeeSchema, newEmployeeSchema, pageSchema, employeePageSchema, branchPageSchema } from "../domain/setup-validation";
import * as setup from "../services/setup";
import {roomOverview,roomSchedule,createRoomBlock,removeRoomBlock} from '../services/room-workflows';
import {roomBlockSchema,roomRangeSchema} from '../domain/room-workflow-validation';

const router: IRouter = Router();
router.use("/clinic", requireAuth, requirePasswordChanged, (req, _res, next) => {
  if (!req.user?.clinicId || req.user.role === "platform_owner") return next(forbidden("no_clinic"));
  next();
});
const id = (value: unknown) => z.coerce.number().int().positive().parse(value);
router.get("/clinic/options", async (req, res) => {
  const resource = z.enum(["branches", "services", "rooms", "employees", "customers"]).parse(req.query["for"]);
  res.json(await setup.setupOptions(req.user!, resource));
});

router.get("/clinic/branches", requirePermission("settings.read"), async (req, res) => {const p=branchPageSchema.parse(req.query);res.json(await (p.status==='archived'?archivedBranches(req.user!,p):setup.listBranches(req.user!,p)));});
router.get('/clinic/branches/draft-archives',requirePermission('settings.manage'),async(req,res)=>res.json({items:await draftBranchArchives(req.user!)}));
router.get('/clinic/branches/:id/archive',requirePermission('settings.manage'),async(req,res)=>res.json(await branchArchive(req.user!,id(req.params['id']),z.coerce.number().int().min(1).max(100000).default(1).parse(req.query['page']))));
router.delete('/clinic/branches/:id',requirePermission('settings.manage'),async(req,res)=>{z.object({confirmed:z.literal(true)}).strict().parse(req.body);res.json(await archiveBranch(req.user!,id(req.params['id'])));});
router.get("/clinic/branches/:id", requirePermission("settings.read"), async (req, res) => res.json({ item: await setup.getBranch(req.user!, id(req.params["id"])) }));
router.post("/clinic/branches", requirePermission("settings.manage"), async (req, res) => res.status(201).json({ item: await setup.saveBranch(req.user!, branchSchema.parse(req.body)) }));
router.put("/clinic/branches/:id", requirePermission("settings.manage"), async (req, res) => res.json({ item: await setup.saveBranch(req.user!, branchSchema.parse(req.body), id(req.params["id"])) }));

router.get("/clinic/services", requirePermission("services.read"), async (req, res) => res.json(await setup.listServices(req.user!, pageSchema.parse(req.query))));
router.get('/clinic/service-categories',requirePermission('services.read'),async(req,res)=>res.json({items:await setup.serviceCategories(req.user!)}));
router.post("/clinic/services/batch", requirePermission("services.manage"), async (req, res) => res.status(201).json(await setup.saveServicesBatch(req.user!, serviceBatchSchema.parse(req.body))));
router.get("/clinic/services/:id", requirePermission("services.read"), async (req, res) => res.json({ item: await setup.getService(req.user!, id(req.params["id"])) }));
router.post("/clinic/services", requirePermission("services.manage"), async (req, res) => res.status(201).json({ item: await setup.saveService(req.user!, serviceSchema.parse(req.body)) }));
router.put("/clinic/services/:id", requirePermission("services.manage"), async (req, res) => res.json({ item: await setup.saveService(req.user!, serviceSchema.parse(req.body), id(req.params["id"])) }));
router.delete("/clinic/services/:id", requirePermission("services.manage"), async (req, res) => {
  z.object({ confirmed: z.literal(true) }).strict().parse(req.body);
  res.json(await setup.deleteService(req.user!, id(req.params["id"])));
});

router.get("/clinic/rooms", requirePermission("rooms.read"), async (req, res) => res.json(await setup.listRooms(req.user!, pageSchema.parse(req.query))));
router.get('/clinic/rooms/overview',requirePermission('rooms.read'),async(req,res)=>res.json(await roomOverview(req.user!)));
router.get('/clinic/rooms/schedule',requirePermission('rooms.read'),async(req,res)=>res.json(await roomSchedule(req.user!,roomRangeSchema.parse(req.query))));
router.post('/clinic/rooms/:id/blocks',requirePermission('rooms.manage'),async(req,res)=>res.status(201).json(await createRoomBlock(req.user!,id(req.params['id']),roomBlockSchema.parse(req.body))));
router.delete('/clinic/rooms/blocks/:id',requirePermission('rooms.manage'),async(req,res)=>res.json(await removeRoomBlock(req.user!,id(req.params['id']))));
router.get("/clinic/rooms/:id", requirePermission("rooms.read"), async (req, res) => res.json({ item: await setup.getRoom(req.user!, id(req.params["id"])) }));
router.post("/clinic/rooms", requirePermission("rooms.manage"), async (req, res) => res.status(201).json({ item: await setup.saveRoom(req.user!, roomSchema.parse(req.body)) }));
router.put("/clinic/rooms/:id", requirePermission("rooms.manage"), async (req, res) => res.json({ item: await setup.saveRoom(req.user!, roomSchema.parse(req.body), id(req.params["id"])) }));

router.get("/clinic/customers", requirePermission("customers.read"), async (req, res) => res.json(await setup.listCustomers(req.user!, pageSchema.parse(req.query))));
router.get("/clinic/customers/:id", requirePermission("customers.read"), async (req, res) => res.json({ item: await setup.getCustomer(req.user!, id(req.params["id"])) }));
router.post("/clinic/customers", requirePermission("customers.manage"), async (req, res) => res.status(201).json({ item: await setup.saveCustomer(req.user!, customerSchema.parse(req.body)) }));
router.put("/clinic/customers/:id", requirePermission("customers.manage"), async (req, res) => res.json({ item: await setup.saveCustomer(req.user!, customerSchema.parse(req.body), id(req.params["id"])) }));

router.get("/clinic/employees", requirePermission("employees.read"), async (req, res) => res.json(await setup.listEmployees(req.user!, employeePageSchema.parse(req.query))));
router.get("/clinic/employees/:id", requirePermission("employees.read"), async (req, res) => res.json({ item: await setup.getEmployee(req.user!, id(req.params["id"])) }));
router.post("/clinic/employees", requirePermission("employees.manage"), async (req, res) => res.status(201).json({ item: await setup.addEmployee(req.user!, newEmployeeSchema.parse(req.body)) }));
router.put("/clinic/employees/:id", requirePermission("employees.manage"), async (req, res) => res.json({ item: await setup.saveEmployee(req.user!, employeeSchema.parse(req.body), id(req.params["id"])) }));
router.post("/clinic/employees/:id/password", requirePermission("employees.manage"), async (req, res) => {
  const body = z.object({ initialPassword: z.string().min(10).max(200) }).strict().parse(req.body);
  res.json(await setup.resetEmployeePassword(req.user!, id(req.params["id"]), body.initialPassword));
});
router.patch("/clinic/employees/:id/active", requirePermission("employees.manage"), async (req, res) => {
  const body = z.object({ isActive: z.boolean() }).strict().parse(req.body);
  res.json(await setup.setEmployeeActive(req.user!, id(req.params["id"]), body.isActive));
});
export default router;
