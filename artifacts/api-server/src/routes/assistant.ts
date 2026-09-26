import { Router, type IRouter } from 'express';
import { requireAuth, requirePasswordChanged } from '../middlewares/auth';
import { assistantBootstrap, assistantHelp, assistantChoices, assistantAction, assistantGenerate, assistantChat, assistantSttKey, assistantBook } from '../services/assistant';
const router:IRouter=Router();
router.use('/assistant',requireAuth,requirePasswordChanged,(_req,res,next)=>{
  res.setHeader('Cache-Control','no-store, private');res.setHeader('Pragma','no-cache');next();
});
router.get('/assistant/bootstrap',async(req,res)=>{res.json(await assistantBootstrap(req.user!,req.query));});
router.post('/assistant/help',async(req,res)=>{res.json(await assistantHelp(req.user!,req.body));});
router.post('/assistant/chat',async(req,res)=>{res.json(await assistantChat(req.user!,req.body));});
router.post('/assistant/stt-key',async(req,res)=>{res.json(await assistantSttKey(req.user!));});
router.post('/assistant/book',async(req,res)=>{res.json(await assistantBook(req.user!,req.body));});
router.get('/assistant/appointments',async(req,res)=>{res.json(await assistantChoices(req.user!,req.query));});
router.post('/assistant/actions',async(req,res)=>{res.json(await assistantAction(req.user!,req.body));});
router.post('/assistant/generate',async(req,res)=>{res.json(await assistantGenerate(req.user!,req.body));});
// Booking uses the same validated scheduling command as the staff form. Other writes remain on their staff screens.
export default router;
