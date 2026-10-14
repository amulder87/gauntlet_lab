/// <reference path="../src/core.ts" />
/// <reference path="../src/engine.ts" />
/// <reference path="../src/optimizer.ts" />
declare const require:any; declare const __dirname:string;
const fs3=require('fs'), path3=require('path');
const doc3=JSON.parse(fs3.readFileSync(path3.join(__dirname,'../public/gauntlet_lab_config.default.json'),'utf8')) as Gauntlet.ConfigDocument;
const state3=doc3.defaults;
const a=Gauntlet.enumerateUniqueAssignments(state3);
console.log(JSON.stringify({count:a.length,first:a.slice(0,5),last:a.slice(-5)}));
