/// <reference path="../src/core.ts" />
/// <reference path="./python_random_reference.ts" />
const rng = new GauntletReference.PythonRandom(12345);
for (let i=0;i<5;i++) console.log(rng.random().toPrecision(17));
