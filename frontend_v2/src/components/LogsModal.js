
import React, { useEffect, useState } from "react";
import axios from "axios";
import { authHeaders } from "../api";

export default function LogsModal({ containerId, onClose }){
  const [logs, setLogs] = useState("");

  useEffect(()=>{
    let alive = true;
    async function load(){
      try{
        const res = await axios.get(`/api/containers/${containerId}/logs?lines=200`, { headers: authHeaders() });
        if(alive) setLogs(res.data.logs || "");
      }catch(e){ if(alive) setLogs(String(e)); }
    }
    load();
    return ()=>{ alive = false; };
  },[containerId]);

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,.6)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }}>
      <div style={{ width:"80vw", height:"70vh", background:"#12151c", border:"1px solid var(--border)", borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:10, borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between" }}>
          <strong>Logs: {containerId}</strong>
          <button onClick={onClose} style={{ background:"#111827", border:"1px solid var(--border)", color:"var(--txt)", borderRadius:6, padding:"4px 8px" }}>✖</button>
        </div>
        <pre style={{ margin:0, padding:12, whiteSpace:"pre-wrap", overflow:"auto", fontSize:12, color:"#d1d5db" }}>{logs || "Cargando..."}</pre>
      </div>
    </div>
  )
}
