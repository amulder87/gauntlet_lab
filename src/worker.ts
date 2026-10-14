/// <reference path="./core.ts" />
/// <reference path="./engine.ts" />
namespace GauntletWorker {
  let profiles: Gauntlet.PlayerProfile[] = [];
  let cfg: Gauntlet.GameConfig | null = null;
  let realIndex = 0;

  interface InitMessage {
    kind: "init";
    profiles: Gauntlet.PlayerProfile[];
    cfg: Gauntlet.GameConfig;
    realIndex: number;
  }
  interface RunMessage {
    kind: "run";
    taskId: number;
    candidateIndex: number;
    roles: Gauntlet.Role[];
    startIndex: number;
    count: number;
    baseSeed: number;
  }
  type Incoming = InitMessage | RunMessage;

  self.onmessage = (event: MessageEvent<Incoming>) => {
    const msg = event.data;
    if (msg.kind === "init") {
      profiles = msg.profiles;
      cfg = msg.cfg;
      realIndex = msg.realIndex;
      (self as any).postMessage({kind:"ready"});
      return;
    }
    try {
      if (!cfg) throw new Error("Worker has not been initialized");
      const aggregate = Gauntlet.simulateChunk(profiles, msg.roles, realIndex, cfg, msg.startIndex, msg.count, msg.baseSeed);
      (self as any).postMessage({
        kind:"done", taskId:msg.taskId, candidateIndex:msg.candidateIndex, count:msg.count, aggregate,
      });
    } catch (err) {
      (self as any).postMessage({kind:"error", taskId:msg.taskId, message: err instanceof Error ? err.stack || err.message : String(err)});
    }
  };
}
