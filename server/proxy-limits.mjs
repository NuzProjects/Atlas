export const atlasFetchLanes = 4;
const lanes = Array.from({length:atlasFetchLanes},()=>({active:0,hosts:new Map()}));
const waiting = [];
let active = 0;
function pump() {
  while (active < atlasFetchLanes * 16) {
    const index = waiting.findIndex(job => lanes.some(lane=>lane.active<16 && (lane.hosts.get(job.host)||0)<8));
    if (index < 0) return;
    const {host, resolve, timer} = waiting.splice(index,1)[0];
    const laneIndex=lanes.map((lane,index)=>({lane,index})).filter(({lane})=>lane.active<16 && (lane.hosts.get(host)||0)<8).sort((a,b)=>a.lane.active-b.lane.active)[0].index;
    const lane=lanes[laneIndex];
    clearTimeout(timer);
    active++;lane.active++;lane.hosts.set(host,(lane.hosts.get(host)||0)+1);
    let released = false;
    resolve({laneIndex,release:()=>{
      if(released) return; released = true; active--;lane.active--;
      const count = lane.hosts.get(host)-1;
      if(count) lane.hosts.set(host,count); else lane.hosts.delete(host);
      pump();
    }});
  }
}
export async function withAtlasFetchSlot(host, task) {
  if (waiting.length >= 256) throw new Error('Proxy request queue is full; retry later');
  const {release,laneIndex} = await new Promise((resolve,reject)=>{
    const job = {host,resolve};
    job.timer = setTimeout(()=>{const index=waiting.indexOf(job);if(index>=0)waiting.splice(index,1);reject(new Error('Proxy request queue timed out'));},30000);
    waiting.push(job);pump();
  });
  try { return await task(release,laneIndex); } finally { release(); }
}
