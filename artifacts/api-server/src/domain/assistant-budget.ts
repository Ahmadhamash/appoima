/** Single-process abuse/cost guard. Not a billing allowance; use a shared store before scaling out. */
export class AssistantBudget {
  private readonly windows=new Map<string,{until:number;count:number}>();
  private active=0;
  constructor(private readonly now:()=>number=Date.now) {}
  take(key:string,limit:number,windowMs:number):boolean {
    const time=this.now();
    if(this.windows.size>=1000)for(const [id,row] of this.windows)if(row.until<=time)this.windows.delete(id);
    const old=this.windows.get(key);
    if(!old||old.until<=time){if(this.windows.size>=10000)return false;this.windows.set(key,{until:time+windowMs,count:1});return true;}
    if(old.count>=limit)return false;old.count++;return true;
  }
  reserveGeneration(clinicId:number,userId:number):(()=>void)|null {
    if(this.active>=2)return null;
    if(!this.take(`ai:user:${userId}`,6,60000)||!this.take(`ai:clinic:${clinicId}`,60,3600000)||!this.take('ai:instance',240,3600000))return null;
    this.active++;let released=false;
    return ()=>{if(!released){released=true;this.active--;}};
  }
}
