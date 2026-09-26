/** Development samples only. New account passwords are random, printed once, and never persisted. */
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, usersTable, clinicsTable, branchesTable, servicesTable, roomsTable, customersTable, roomServicesTable, serviceEmployeesTable, type UserRole } from "@workspace/db";
import { createPlatformOwner, createStaffAccount, platformOwnerExists } from "../services/auth";
import { createClinic } from "../services/clinics";
import { normalizeWeek } from "../domain/setup-rules";
import { recordAudit } from "../services/audit";
import {seedScheduling} from "./seed-scheduling";
import {seedOperations} from "./seed-operations";
import {verifyInventoryGuards} from "../services/inventory";
import {verifySchedulingGuards} from "../services/scheduling";
const genPassword=()=>randomBytes(15).toString("base64url");
type Person={role:Exclude<UserRole,"platform_owner">;name:string;email:string};
type Sample={name:string;nameLang:"en"|"ar";people:Person[]};
const samples:Sample[]=[
 {name:"Amman Glow Clinic",nameLang:"en",people:[
  {role:"manager",name:"Rania Haddad",email:"rania.manager@glow.example"},
  {role:"secretary",name:"Lina Saleh",email:"lina.secretary@glow.example"},
  {role:"doctor",name:"Dr. Omar Khalil",email:"omar.doctor@glow.example"},
  {role:"service_provider",name:"Maya Nasser",email:"maya.provider@glow.example"},
 ]},
 {name:"مركز ياسمين للتجميل",nameLang:"ar",people:[
  {role:"manager",name:"هبة العمري",email:"heba.manager@yasmin.example"},
  {role:"secretary",name:"سارة يوسف",email:"sara.secretary@yasmin.example"},
  {role:"doctor",name:"د. خالد منصور",email:"khaled.doctor@yasmin.example"},
  {role:"other_staff",name:"أحمد زيد",email:"ahmad.staff@yasmin.example"},
 ]},
];
const working=normalizeWeek({mon:{open:"09:00",close:"17:00"},tue:{open:"09:00",close:"17:00"},wed:{open:"09:00",close:"17:00"},thu:{open:"09:00",close:"17:00"},sat:{open:"10:00",close:"16:00"},sun:{open:"09:00",close:"17:00"}});
async function main(){
 await verifySchedulingGuards();
 await verifyInventoryGuards();
 let ownerId:number;
 if(await platformOwnerExists()){
  const [owner]=await db.select().from(usersTable).where(eq(usersTable.role,"platform_owner")).limit(1);ownerId=owner!.id;
 }else{
  const email=process.env.SEED_OWNER_EMAIL,password=process.env.SEED_OWNER_PASSWORD;
  if(!email||!password||password.length<10)throw new Error("Complete owner setup in the app, or supply SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD (at least 10 characters).");
  ownerId=(await createPlatformOwner({name:"Platform Owner",email,password})).id;
 }
 const credentials:{clinic:string;role:string;email:string;password:string}[]=[];
 for(const sample of samples){
  const [existing]=await db.select().from(clinicsTable).where(eq(clinicsTable.name,sample.name)).limit(1);
  const clinic=existing??await createClinic({name:sample.name,nameLang:sample.nameLang,actorUserId:ownerId});
  const sampleUsers:number[]=[];
  for(const person of sample.people){
   const [found]=await db.select().from(usersTable).where(eq(usersTable.email,person.email));
   if(found){if(found.clinicId!==clinic.id)throw new Error(`Sample email ${person.email} belongs to a different clinic. Refusing to reassign it.`);sampleUsers.push(found.id);continue;}
   const password=genPassword();
   const user=await createStaffAccount({...person,clinicId:clinic.id,nameLang:sample.nameLang,initialPassword:password,actorUserId:ownerId});
   sampleUsers.push(user.id);credentials.push({clinic:sample.name,role:person.role,email:person.email,password});
  }
  await db.transaction(async(tx)=>{
   await tx.execute((await import('drizzle-orm')).sql`select pg_advisory_xact_lock(7140002, ${clinic.id})`);
   const branchName=sample.nameLang==='ar'?'الفرع الرئيسي':'Main branch';
   let [branch]=await tx.select().from(branchesTable).where(and(eq(branchesTable.clinicId,clinic.id),eq(branchesTable.name,branchName)));
   if(!branch){[branch]=await tx.insert(branchesTable).values({clinicId:clinic.id,name:branchName,nameLang:sample.nameLang,timeZone:'Asia/Amman',openingHours:working}).returning();}
   for(const userId of sampleUsers){
    const [user]=await tx.select().from(usersTable).where(eq(usersTable.id,userId));
    // Only fill missing setup; never overwrite existing schedules, passwords or permissions.
    if(user!.branchId===null)await tx.update(usersTable).set({branchId:branch!.id}).where(eq(usersTable.id,userId));
    if(Object.values(user!.workingHours).every((ranges)=>!ranges.length))await tx.update(usersTable).set({workingHours:working}).where(eq(usersTable.id,userId));
    // Known sample names have an explicit authoring language, unlike arbitrary legacy records.
    await tx.update(usersTable).set({nameLang:sample.nameLang}).where(eq(usersTable.id,userId));
   }
   const serviceName=sample.nameLang==='ar'?'العناية بالبشرة':'Skin care';
   let [service]=await tx.select().from(servicesTable).where(and(eq(servicesTable.clinicId,clinic.id),eq(servicesTable.name,serviceName)));
   if(!service){[service]=await tx.insert(servicesTable).values({clinicId:clinic.id,branchId:branch!.id,name:serviceName,nameLang:sample.nameLang,durationMinutes:45,price:'25.000',currency:'JOD',category:'Skin',isActive:true,requiresRoom:true}).returning();}
   const roomName=sample.nameLang==='ar'?'غرفة العناية':'Treatment room';
   let [room]=await tx.select().from(roomsTable).where(and(eq(roomsTable.clinicId,clinic.id),eq(roomsTable.name,roomName)));
   if(!room){[room]=await tx.insert(roomsTable).values({clinicId:clinic.id,branchId:branch!.id,name:roomName,nameLang:sample.nameLang,capacity:1,status:'available'}).returning();}
   if(service!.branchId===null||service!.branchId===room!.branchId)await tx.insert(roomServicesTable).values({clinicId:clinic.id,roomId:room!.id,serviceId:service!.id}).onConflictDoNothing();
   for(const userId of sampleUsers){
    const [user]=await tx.select().from(usersTable).where(eq(usersTable.id,userId));
    if(['doctor','service_provider'].includes(user!.role)&&(service!.branchId===null||user!.branchId===null||service!.branchId===user!.branchId))await tx.insert(serviceEmployeesTable).values({clinicId:clinic.id,serviceId:service!.id,employeeId:userId}).onConflictDoNothing();
   }
   const customerName=sample.nameLang==='ar'?'عميلة تجريبية':'Sample customer';
   const [customer]=await tx.select({id:customersTable.id}).from(customersTable).where(and(eq(customersTable.clinicId,clinic.id),eq(customersTable.name,customerName)));
   if(!customer)await tx.insert(customersTable).values({clinicId:clinic.id,branchId:branch!.id,name:customerName,nameLang:sample.nameLang,email:sample.nameLang==='ar'?'customer@yasmin.example':'customer@glow.example',notes:sample.nameLang==='ar'?'سجل تجريبي للتدريب فقط.':'Development sample only.',sensitiveNotes:''});
   await recordAudit({clinicId:clinic.id,actorUserId:ownerId,action:'seed.phase2_checked',entityType:'clinic',entityId:clinic.id},tx);
  });
  const addedBooking=await seedScheduling(clinic.id,sampleUsers);
  const addedOperations=await seedOperations(clinic.id,sampleUsers);
  console.log(`Phase 4 development samples: ${addedOperations ? "created" : "unchanged"}; actual consumption intentionally remains unrecorded.`);
  console.log(`Sample setup checked: ${sample.name}; scheduling sample ${addedBooking ? "created" : "unchanged (existing booking or no valid slot)"}`);
 }
 if(credentials.length){console.log('\nNEW sample accounts — initial passwords printed once; every user must change at first sign-in:\n');console.table(credentials);}
 else console.log('No new accounts. Existing passwords were not changed or displayed.');
}
main().then(()=>process.exit(0)).catch((error)=>{console.error(error instanceof Error?error.message:'Seed failed');process.exit(1);});
