import {Router,type IRouter} from 'express';
import {requireAuth,requirePasswordChanged} from '../middlewares/auth';
import {getMyWorkspace} from '../services/clinic-workspace';
import {HttpError} from '../lib/errors';
const router:IRouter=Router();
router.get('/me/workspace',requireAuth,requirePasswordChanged,async(req,res,next)=>{
 res.setHeader('Cache-Control','private, no-store');
 try{res.json(await getMyWorkspace(req.user!));}catch(error){
  const err=error as {code?:string;cause?:{code?:string}};
  if(['42P01','42703'].includes(err.code??err.cause?.code??''))return next(new HttpError(503,'concierge_migration_required'));
  next(error instanceof HttpError?error:new HttpError(500,'workspace_unavailable'));
 }
});
export default router;
