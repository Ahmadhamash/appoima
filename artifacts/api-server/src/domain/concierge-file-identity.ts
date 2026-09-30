import type { CompanyCandidate } from '../concierge/providers';
import type { Draft, ModelReply } from './concierge-core';

/** An attachment can propose an identity, but the owner must confirm it before setup proceeds. */
export function uploadedIdentity(reply:ModelReply,draft:Draft):CompanyCandidate|null {
 if(reply.fileRead!==true)return null;
 const fact=reply.workspaceFacts?.find(item=>['nameAr','nameEn'].includes(item.field)&&!!item.value.trim()&&item.value.length<=120&&item.evidence.includes(item.value));
 if(!fact)return null;
 return {uploaded:true,name:fact.value.trim(),summary:reply.fileSummary??'',industry:null,location:null,website:null,sources:[],found:true,
  details:{logoDataUrl:null,colors:[],website:null,status:'partial',branches:draft.branches.flatMap(branch=>branch.name?[{name:branch.name,detail:'',sourceUrl:''}]:[]),services:draft.services.flatMap(service=>service.name?[{name:service.name,detail:'',sourceUrl:''}]:[])}};
}
