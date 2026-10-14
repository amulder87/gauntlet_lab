/// <reference path="../src/core.ts" />
/// <reference path="../src/engine.ts" />
/// <reference path="./python_random_reference.ts" />
declare const require: any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const doc = JSON.parse(fs.readFileSync(path.join(__dirname, '../public/gauntlet_lab_config.default.json'),'utf8')) as Gauntlet.ConfigDocument;
const state = doc.defaults;
const profiles = state.party.map(s=>state.profiles[s.profile_name]);
const roles = state.party.map(s=>s.manual_role);
console.log(JSON.stringify({
  health: [1,19,20,30,40].map(w=>Gauntlet.enemyHealth(w,state.game)),
  attack: [1,19,20,30,40].map(w=>Gauntlet.enemyAttack(w,state.game)),
  defense: [1,19,20,30,40].map(w=>Gauntlet.enemyDefense(w,state.game)),
  run: Gauntlet.simulateOne(profiles,roles,0,state.game,12345,GauntletReference.PYTHON_RNG_FACTORY),
  metrics: Gauntlet.aggregateToMetrics(Gauntlet.simulateChunk(profiles,roles,0,state.game,0,100,12345,GauntletReference.PYTHON_RNG_FACTORY),30)
}));
