
import React, { useState } from "react";
import axios from "axios";
import { authHeaders } from "../api";

export default function ExecModal({ containerId, onClose }){
  const [cmd, setCmd] = useState("ls -la");
  const [out, setOut] = useState("");

  async function run(){
    try{
      const res = await axios.post(`/api/containers/${containerId}/exec`, { command: cmd }, { headers: authHeaders() });
      setOut(`$ ${cmd}\n\nSTDOUT:\n${res.data.stdout}\n\nSTDERR:\n${res.data.stderr}\ncode=${res.data.returncode}`);
    }catch(e){ setOut(String(e)); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
      <div style={{ width:"80vw", height:"70vh", background:"#12151c", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:10, borderBottom:"1px solid var(--border)", display:"flex", gap:8 }}>
          <strong style={{ flex:1 }}>Shell: {containerId}</strong>
          <input value={cmd} onChange={e=>setCmd(e.target.value)} style={{ flex:3, background:"#0b0e14", color:"var(--txt)", border:"1px solid var(--border)", borderRadius:6, padding:"6px 8px" }} />
          <button onClick={run} style={{ background:"#111827", border:"1px solid var(--border)", color:"var(--txt)", borderRadius:6, padding:"6px 10px" }}>Run</button>
          <button onClick={onClose} style={{ background:"#111827", border:"1px solid var(--border)", color:"var(--txt)", borderRadius:6, padding:"6px 10px" }}>Close</button>
        </div>
        <pre style={{ margin:0, padding:12, whiteSpace:"pre-wrap", overflow:"auto", fontSize:12, color:"#d1d5db" }}>{out}</pre>
      </div>
    </div>
  )
}
