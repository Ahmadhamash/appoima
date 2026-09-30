import {describe,it,expect,vi} from 'vitest';
import {gatheringReporter} from '../concierge/progress';
import {crawlPublicBusiness} from '../concierge/public-business-crawl';
describe('information gathering progress',()=>{
 it('reports bounded monotonic percentages and survives disconnected observers',()=>{const values:number[]=[];const report=gatheringReporter(progress=>values.push(progress.percent));report({phase:'searching',percent:5});report({phase:'reading',percent:3});report({phase:'saving',percent:120});expect(values).toEqual([5,5,100]);expect(()=>gatheringReporter(()=>{throw Error('disconnected');})({phase:'saving',percent:98})).not.toThrow();});
 it('reports the exact URLs being fetched with a bounded page count',async()=>{const site='https://clinic.example/',reader=vi.fn(async(url:string)=>({url,bytes:Buffer.from(url===site?'<title>Example Medical Clinic</title><a href="/services">Services</a>':'<title>Example Medical Clinic Services</title>'),mime:'text/html'})),events:{url:string;completed:number;total:number}[]=[];await crawlPublicBusiness([site],reader,{pages:2,onPage:event=>events.push(event)});expect(events.map(event=>event.url)).toEqual(reader.mock.calls.map(([url])=>url));expect(events.every(event=>event.completed>=0&&event.total<=2)).toBe(true);expect(events.length).toBeGreaterThan(0);});
});
