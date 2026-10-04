import {describe,expect,it} from 'vitest';
import {computeSlots} from '../domain/scheduling-time';

const week=(ranges:{open:string;close:string}[])=>({mon:ranges,tue:ranges,wed:ranges,thu:ranges,fri:ranges,sat:ranges,sun:ranges});

describe('room availability in booking slots',()=>{
  it('prevents overlapping room bookings across different staff and allows the next booking at the end',()=>{
    const allDay=week([{open:'09:00',close:'17:00'}]);
    const slots=computeSlots({date:'2030-01-01',timeZone:'UTC',branchHours:allDay,workingHours:allDay,breaks:week([]),timeOff:[],durationMinutes:60,employeeId:1,requiresRoom:true,roomIds:[1],busy:[{roomId:1,employeeId:99,startsAt:'2030-01-01T09:00:00Z',endsAt:'2030-01-01T10:00:00Z'}],now:Date.parse('2029-12-31T00:00:00Z')});
    expect(slots.some(slot=>slot.startsAt<'2030-01-01T10:00:00.000Z')).toBe(false);
    expect(slots.find(slot=>slot.startsAt==='2030-01-01T10:00:00.000Z')?.roomId).toBe(1);
  });
  it('respects room hours, breaks, and maintenance while keeping other rooms available',()=>{
    const allDay=week([{open:'09:00',close:'17:00'}]);
    const base={date:'2030-01-01',timeZone:'UTC',branchHours:allDay,workingHours:allDay,breaks:week([]),timeOff:[],durationMinutes:60,employeeId:1,requiresRoom:true,roomIds:[1,2],now:Date.parse('2029-12-31T00:00:00Z')};
    const slots=computeSlots({...base,roomHours:{1:week([{open:'09:00',close:'12:00'}]),2:allDay},roomBreaks:{1:week([{open:'10:00',close:'11:00'}])},busy:[{roomId:1,employeeId:99,startsAt:'2030-01-01T11:00:00Z',endsAt:'2030-01-01T12:00:00Z'}]});
    expect(slots.find(slot=>slot.startsAt==='2030-01-01T09:00:00.000Z')?.roomId).toBe(1);
    expect(slots.find(slot=>slot.startsAt==='2030-01-01T10:00:00.000Z')?.roomId).toBe(2);
    expect(slots.find(slot=>slot.startsAt==='2030-01-01T11:00:00.000Z')?.roomId).toBe(2);
    expect(slots.find(slot=>slot.startsAt==='2030-01-01T13:00:00.000Z')?.roomId).toBe(2);
  });
});
