import { buildSessions, buildSMEs } from "../data/synthetic";
import { match } from "../src/engine";

const sessions = buildSessions();
const smes = buildSMEs();
const r = match(sessions, smes, { capIsHard: false });

console.log("=== STATS ===");
console.log("sessions:", r.stats.total_sessions, "filled:", r.stats.filled, "unfilled:", r.stats.unfilled);
console.log("blockers:", r.stats.blockers, "flags:", r.stats.flags, "gini:", r.stats.gini.toFixed(3));
console.log("\n=== LOAD ===");
const c: Record<string,number> = {};
r.assignments.forEach(a => { if (a.sme_id) c[a.sme_id] = (c[a.sme_id]||0)+1; });
smes.forEach(s => console.log(`  ${s.name.padEnd(20)} ${String(c[s.id]||0).padStart(2)}  (cap ${s.prefs.max_sessions_per_week}, min ${s.prefs.min_sessions_per_week})${s.status==='paused'?'  PAUSED':''}`));
console.log("\n=== FLAGS (top 12) ===");
r.flags.slice(0,12).forEach(f => console.log(`  [${f.severity}] ${f.code}: ${f.reason}`));
console.log("\n=== UNFILLED ===");
r.assignments.filter(a=>!a.sme_id).forEach(a => {
  const s = sessions.find(x=>x.id===a.session_id)!;
  console.log("  ", s.title, "| eligible:", a.eligible_count);
});
console.log("\n=== TIES ===");
r.assignments.filter(a=>a.tie_note).forEach(a => console.log("  ", a.tie_note));
