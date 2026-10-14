/// <reference path="../src/core.ts" />
/// <reference path="../src/engine.ts" />
/// <reference path="./python_random_reference.ts" />
declare const require:any; declare const __dirname:string;
const fs4=require('fs'), path4=require('path');
const d4=JSON.parse(fs4.readFileSync(path4.join(__dirname,'../public/gauntlet_lab_config.default.json'),'utf8')) as Gauntlet.ConfigDocument;
const s4=d4.defaults;
const scenarios=[
 ['default',['Me','Clone','Clone','Clone','Clone'],['Health','Melee','Ranged','Magic','Defense']],
 ['t3',['Generic T3','Generic T3','Generic T3','Generic T3','Generic T3'],['Melee','Health','Health','Defense','Melee']],
 ['t10',['Generic T10','Generic T10','Generic T10','Generic T10','Generic T10'],['Health','Melee','Ranged','Magic','Defense']],
 ['mixed',['Generic T3','Generic T3','Generic T2','Generic T1','Generic T3'],['Melee','Health','Ranged','Magic','Defense']],
] as [string,string[],Gauntlet.Role[]][];
const out:any={};
for(const [name,names,roles] of scenarios){const profiles=names.map(n=>s4.profiles[n]);out[name]=Gauntlet.aggregateToMetrics(Gauntlet.simulateChunk(profiles,roles,0,s4.game,0,100,424242,GauntletReference.PYTHON_RNG_FACTORY),30);}
console.log(JSON.stringify(out));
