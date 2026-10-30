import fs from "fs";
const d=`tmp/replay/${process.argv[2]}/`, end=JSON.parse(fs.readFileSync(d+"end.json"));
console.log("winner",end.winner,"final share",end.share);
for(const f of fs.readdirSync(d).filter(f=>/^h\d+\.json$/.test(f)).sort((a,b)=>parseInt(a.slice(1))-parseInt(b.slice(1)))){
  const j=JSON.parse(fs.readFileSync(d+f)),fam=new Map(j.family),c=new Map();
  for(const x of j.world.cars){const g=fam.get(x.id);c.set(g,(c.get(g)||0)+1)}
  const s=[...c].sort((a,b)=>b[1]-a[1]),n=j.world.cars.length;
  console.log(f,"cars",n,"leader",s[0][0],(100*s[0][1]/n).toFixed(1)+"%","winner",((c.get(end.winner)||0)*100/n).toFixed(1)+"%","rank",s.findIndex(x=>x[0]===end.winner)+1,s[0][0]===end.winner?"LEADER=WINNER":"");
}
