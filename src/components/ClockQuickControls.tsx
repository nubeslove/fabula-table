import {useState} from "react";
import type {Clock,Command} from "../shared/types";
export function ClockQuickControls({clock:c,act}:{clock:Clock;act:(c:Command)=>Promise<boolean>}) {
 const [busy,setBusy]=useState(false);
 async function tick(delta:number){setBusy(true);try{await act({type:"clock.tick",id:c.id,delta});}finally{setBusy(false);}}
 return <div className="clock-quick"><button title="撤回一格" aria-label={`${c.name}减少一格`} disabled={busy||c.value===0} onClick={()=>void tick(-1)}>−</button><button title="推进一格" aria-label={`${c.name}增加一格`} disabled={busy||c.value===c.segments} onClick={()=>void tick(1)}>＋</button></div>;
}
