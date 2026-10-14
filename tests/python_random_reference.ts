/// <reference path="../src/core.ts" />
namespace GauntletReference {
  export class PythonRandom implements Gauntlet.RandomSource {
    private mt = new Uint32Array(624);
    private index = 624;
    constructor(seed: number | bigint) { this.seed(seed); }
    seed(seed: number | bigint): void {
      let n = typeof seed === "bigint" ? seed : BigInt(Math.trunc(seed));
      if (n < 0n) n = -n;
      const key: number[] = [];
      do { key.push(Number(n & 0xffffffffn)); n >>= 32n; } while (n > 0n);
      this.initByArray(key);
    }
    private initGenRand(seed: number): void {
      this.mt[0] = seed >>> 0;
      for (let i=1;i<624;i++) { const prev=this.mt[i-1]>>>0; const x=(prev^(prev>>>30))>>>0; this.mt[i]=(Math.imul(1812433253,x)+i)>>>0; }
      this.index=624;
    }
    private initByArray(key:number[]):void {
      this.initGenRand(19650218); let i=1,j=0,k=Math.max(624,key.length);
      for(;k>0;k--){const prev=this.mt[i-1]>>>0;const x=(prev^(prev>>>30))>>>0;this.mt[i]=((this.mt[i]^Math.imul(x,1664525))+(key[j]>>>0)+j)>>>0;i++;j++;if(i>=624){this.mt[0]=this.mt[623];i=1;}if(j>=key.length)j=0;}
      for(k=623;k>0;k--){const prev=this.mt[i-1]>>>0;const x=(prev^(prev>>>30))>>>0;this.mt[i]=((this.mt[i]^Math.imul(x,1566083941))-i)>>>0;i++;if(i>=624){this.mt[0]=this.mt[623];i=1;}}
      this.mt[0]=0x80000000;this.index=624;
    }
    private twist():void {const A=0x9908b0df,U=0x80000000,L=0x7fffffff;let y:number,kk=0;for(;kk<227;kk++){y=((this.mt[kk]&U)|(this.mt[kk+1]&L))>>>0;this.mt[kk]=(this.mt[kk+397]^(y>>>1)^((y&1)?A:0))>>>0;}for(;kk<623;kk++){y=((this.mt[kk]&U)|(this.mt[kk+1]&L))>>>0;this.mt[kk]=(this.mt[kk-227]^(y>>>1)^((y&1)?A:0))>>>0;}y=((this.mt[623]&U)|(this.mt[0]&L))>>>0;this.mt[623]=(this.mt[396]^(y>>>1)^((y&1)?A:0))>>>0;this.index=0;}
    uint32():number {if(this.index>=624)this.twist();let y=this.mt[this.index++]>>>0;y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;}
    random():number {const a=this.uint32()>>>5,b=this.uint32()>>>6;return (a*67108864+b)/9007199254740992;}
    uniform(a:number,b:number):number{return a+(b-a)*this.random();}
  }
  function workerSeed(seed:number,idx:number):bigint {const mask=(1n<<48n)-1n;return (BigInt(Math.trunc(seed))*1000003n+BigInt(idx)*9176n+0x9E3779B1n)&mask;}
  function laneSeed(seed:number):bigint {const mask=(1n<<48n)-1n;return (BigInt(Math.trunc(seed))*2654435761n+0xC0FFEEn)&mask;}
  export const PYTHON_RNG_FACTORY:Gauntlet.RngFactory={
    worker(seed:number,idx:number):Gauntlet.RandomSource{return new PythonRandom(workerSeed(seed,idx));},
    lane(seed:number):Gauntlet.RandomSource{return new PythonRandom(laneSeed(seed));},
  };
}
