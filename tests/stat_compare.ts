/// <reference path="../src/core.ts" />
/// <reference path="../src/engine.ts" />
/// <reference path="./python_random_reference.ts" />
declare const require:any; declare const __dirname:string;
const fs2=require('fs'), path2=require('path');
const doc2=JSON.parse(fs2.readFileSync(path2.join(__dirname,'../public/gauntlet_lab_config.default.json'),'utf8')) as Gauntlet.ConfigDocument;
const base=doc2.defaults;

type Scenario={name:string, profileNames:string[], roles:Gauntlet.Role[]};
const scenarios:Scenario[]=[
 {name:'T0 default',profileNames:['Me','Clone','Clone','Clone','Clone'],roles:['Health','Melee','Ranged','Magic','Defense']},
 {name:'All T3 2H1D2M',profileNames:['Generic T3','Generic T3','Generic T3','Generic T3','Generic T3'],roles:['Melee','Health','Health','Defense','Melee']},
 {name:'All T10 balanced',profileNames:['Generic T10','Generic T10','Generic T10','Generic T10','Generic T10'],roles:['Health','Melee','Ranged','Magic','Defense']},
 {name:'Mixed tiers',profileNames:['Generic T3','Generic T3','Generic T2','Generic T1','Generic T3'],roles:['Melee','Health','Ranged','Magic','Defense']},
];
const N=5000;
const out:any[]=[];
for(const sc of scenarios){
 const profiles=sc.profileNames.map(n=>base.profiles[n]);
 const t0=performance.now();
 const pyAgg=Gauntlet.simulateChunk(profiles,sc.roles,0,base.game,0,N,314159,GauntletReference.PYTHON_RNG_FACTORY);
 const t1=performance.now();
 const fastAgg=Gauntlet.simulateChunk(profiles,sc.roles,0,base.game,0,N,271828,Gauntlet.FAST_RNG_FACTORY);
 const t2=performance.now();
 const py=Gauntlet.aggregateToMetrics(pyAgg,30), fast=Gauntlet.aggregateToMetrics(fastAgg,30);
 out.push({name:sc.name,N,python_ms:t1-t0,fast_ms:t2-t1,python:py,fast});
}
console.log(JSON.stringify(out));
