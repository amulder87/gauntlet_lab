/// <reference path="./core.ts" />
/// <reference path="./engine.ts" />
/// <reference path="./optimizer.ts" />
namespace GauntletWeb {
  const STORAGE_KEY = "gauntlet-lab-web-current-v3";
  const VERSION = "0.2.0";
  let factoryDoc: Gauntlet.ConfigDocument;
  let factoryState: Gauntlet.AppState;
  let state: Gauntlet.AppState;
  let selectedProfile = "Me";
  let activeTab = "profiles";
  let gameTabVisible = false;
  let resultsCounter = 0;
  let running: BrowserSimulationRunner | null = null;
  let debounceTimer: number | undefined;

  interface ResultTabData {
    id: string;
    label: string;
    results: Gauntlet.CandidateResult[];
    snapshot: Gauntlet.AppState;
    selected: number;
  }
  const resultTabs = new Map<string, ResultTabData>();

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", text = ""): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }
  function qs<T extends Element>(selector: string): T { return document.querySelector(selector) as T; }
  function pct(v: number): string { return `${(100*v).toFixed(1)}%`; }
  function fmt(v: number, digits=2): string { return v.toLocaleString(undefined,{minimumFractionDigits:digits,maximumFractionDigits:digits}); }
  function numValue(input: HTMLInputElement, fallback=0): number {
    const v = Number(input.value); return Number.isFinite(v) ? v : fallback;
  }
  function intValue(input: HTMLInputElement, fallback=0): number { return Math.trunc(numValue(input,fallback)); }

  async function loadConfig(): Promise<void> {
    const response = await fetch("gauntlet_lab_config.default.json", {cache:"no-store"});
    if (!response.ok) throw new Error(`Could not load factory config (${response.status})`);
    factoryDoc = await response.json() as Gauntlet.ConfigDocument;
    factoryState = Gauntlet.deepClone(factoryDoc.defaults);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { state = JSON.parse(stored) as Gauntlet.AppState; }
      catch { state = Gauntlet.deepClone(factoryState); }
    } else state = Gauntlet.deepClone(factoryState);
    Gauntlet.cloneFromMe(state);
    // v0.2 gives the rankings enough room for the usual 12 finalists while
    // keeping a six-wave detail distribution visible below. Preserve any
    // splitter position the user has actually customized.
    if (Math.abs((state.settings.results_top_ratio ?? 0.34) - 0.34) < 1e-9) {
      state.settings.results_top_ratio = 0.44;
    }
    applyAllSplitRatios();
    saveStateNow();
  }

  function saveStateNow(): void {
    Gauntlet.cloneFromMe(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  function saveStateDebounced(): void {
    if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(saveStateNow, 120);
  }

  function setStatus(text: string, current?: number, total?: number): void {
    qs<HTMLElement>("#status-text").textContent = text;
    const p = qs<HTMLProgressElement>("#progress");
    if (current === undefined || total === undefined) { p.max = 1; p.value = 0; }
    else { p.max = Math.max(1,total); p.value = current; }
  }

  function buildMenus(): void {
    const fileButton = qs<HTMLButtonElement>("#file-menu-button");
    const helpButton = qs<HTMLButtonElement>("#help-menu-button");
    const fileMenu = qs<HTMLElement>("#file-menu");
    const helpMenu = qs<HTMLElement>("#help-menu");
    const toggle = (menu: HTMLElement) => {
      const show = menu.hidden;
      fileMenu.hidden = true; helpMenu.hidden = true;
      menu.hidden = !show;
    };
    fileButton.onclick = e => { e.stopPropagation(); toggle(fileMenu); };
    helpButton.onclick = e => { e.stopPropagation(); toggle(helpMenu); };
    document.addEventListener("click",()=>{fileMenu.hidden=true;helpMenu.hidden=true;});
    qs<HTMLButtonElement>("#restore-all").onclick = () => {
      if (!confirm("Restore every profile, party slot, optimizer setting and game constant to factory defaults?")) return;
      state = Gauntlet.deepClone(factoryState); Gauntlet.cloneFromMe(state); saveStateNow(); selectedProfile="Me";
      renderProfiles(); renderExperiment(); if (gameTabVisible) renderGameModel(); setStatus("Restored factory defaults");
    };
    qs<HTMLButtonElement>("#show-game-model").onclick = () => showGameModel();
    qs<HTMLButtonElement>("#about").onclick = () => alert(`Gauntlet Lab Web ${VERSION}\n\nMonte Carlo raid composition and Fortify XP optimizer.\nAll simulations and profile data stay in your browser.`);
  }

  function addTabButton(id: string, label: string, insertBeforeResults=false): HTMLButtonElement {
    let btn = document.querySelector<HTMLButtonElement>(`.tab-button[data-tab="${id}"]`);
    if (btn) return btn;
    btn = el("button","tab-button",label);
    btn.dataset.tab=id; btn.onclick=()=>selectTab(id);
    const bar=qs<HTMLElement>("#tabs");
    if (insertBeforeResults) {
      const firstResult=bar.querySelector('.tab-button[data-tab^="results-"]');
      if(firstResult) bar.insertBefore(btn,firstResult); else bar.appendChild(btn);
    } else bar.appendChild(btn);
    return btn;
  }

  function selectTab(id: string): void {
    activeTab=id;
    document.querySelectorAll<HTMLElement>(".tab-panel").forEach(p=>p.hidden=p.dataset.tab!==id);
    document.querySelectorAll<HTMLElement>(".tab-button").forEach(b=>b.classList.toggle("active",b.dataset.tab===id));
  }

  function renderTabsBase(): void {
    addTabButton("profiles","Profiles"); addTabButton("experiment","Experiment");
    selectTab(activeTab);
  }

  function profileNames(): string[] { return Object.keys(state.profiles); }
  function roleSelect(value: Gauntlet.Role): HTMLSelectElement {
    const s=el("select","input");
    for(const r of Gauntlet.ROLES){const o=el("option") as HTMLOptionElement;o.value=r;o.textContent=r;o.selected=r===value;s.appendChild(o);} return s;
  }

  function renderProfiles(): void {
    const panel=qs<HTMLElement>("#profiles-panel"); panel.innerHTML="";
    const layout=el("div","profiles-layout"); panel.appendChild(layout);
    const sidebar=el("section","profile-sidebar"); layout.appendChild(sidebar);
    sidebar.appendChild(el("h3","section-title","Profiles"));
    const list=el("select","profile-list") as HTMLSelectElement; list.size=18;
    for(const name of profileNames()){const o=el("option") as HTMLOptionElement;o.value=name;o.textContent=name;o.selected=name===selectedProfile;list.appendChild(o);}
    sidebar.appendChild(list);
    list.onchange=()=>{selectedProfile=list.value;renderProfiles();};
    const newBtn=el("button","secondary","New generic tier…");
    const dupBtn=el("button","secondary","Duplicate selected");
    const delBtn=el("button","secondary","Delete selected");
    sidebar.append(newBtn,dupBtn,delBtn);
    newBtn.onclick=()=>{
      const raw=prompt("Generic tier (0–11):","3"); if(raw===null)return; const tier=Math.trunc(Number(raw));
      if(!Number.isFinite(tier)||tier<0||tier>11){alert("Tier must be 0 through 11.");return;}
      const template=`Generic T${tier}`; if(!factoryState.profiles[template]){alert(`${template} is missing from factory defaults.`);return;}
      let name=template,n=2; while(state.profiles[name]) name=`${template} ${n++}`;
      const p=Gauntlet.deepClone(factoryState.profiles[template]);p.name=name;state.profiles[name]=p;selectedProfile=name;saveStateNow();renderProfiles();renderExperiment();
    };
    dupBtn.onclick=()=>{
      const p=state.profiles[selectedProfile];if(!p)return;let name=`${selectedProfile} copy`,n=2;while(state.profiles[name])name=`${selectedProfile} copy ${n++}`;
      const copy=Gauntlet.deepClone(p);copy.name=name;state.profiles[name]=copy;selectedProfile=name;saveStateNow();renderProfiles();renderExperiment();
    };
    delBtn.onclick=()=>{
      if(selectedProfile==="Me"||selectedProfile==="Clone"){alert("Me and Clone are reserved profiles.");return;}
      if(state.party.some(s=>s.profile_name===selectedProfile)){alert("Change party slots that use this profile before deleting it.");return;}
      if(!confirm(`Delete '${selectedProfile}'?`))return;delete state.profiles[selectedProfile];selectedProfile="Me";saveStateNow();renderProfiles();renderExperiment();
    };

    const profile=state.profiles[selectedProfile]||state.profiles.Me;
    const readonly=selectedProfile==="Clone";
    const editor=el("section","card profile-editor");layout.appendChild(editor);
    const legend=el("div","card-title","Selected profile");editor.appendChild(legend);
    const top=el("div","form-grid top-fields");editor.appendChild(top);
    const nameInput=inputRow(top,"Name",profile.name,"text",readonly);
    const speedInput=inputRow(top,"Movement speed (px/s)",String(profile.movement_speed),"number",readonly);
    const bagInput=inputRow(top,"Backpack size",String(profile.backpack_size),"number",readonly);

    const table=el("table","stats-table");editor.appendChild(table);
    const head=el("thead");const hr=el("tr");for(const h of ["Role","Tier","Gather sec","Gather success %","Double gather %","Process sec","Process success %"]){hr.appendChild(el("th","",h));}head.appendChild(hr);table.appendChild(head);
    const body=el("tbody");table.appendChild(body);
    const roleInputs=new Map<Gauntlet.Role,HTMLInputElement[]>();
    for(const role of Gauntlet.ROLES){
      const rs=profile.role_stats[role];const tr=el("tr");tr.appendChild(el("td","role-name",role));
      const vals=[String(rs.tier),String(rs.gather_time),String(rs.gather_success*100),String(rs.double_gather*100),String(rs.process_time),String(rs.process_success*100)];
      const arr:HTMLInputElement[]=[];
      vals.forEach((v,i)=>{const td=el("td");const inp=el("input","input compact") as HTMLInputElement;inp.type="number";inp.value=v;inp.disabled=readonly;inp.step=i===0?"1":"any";td.appendChild(inp);tr.appendChild(td);arr.push(inp);});body.appendChild(tr);roleInputs.set(role,arr);
    }
    const actions=el("div","actions");editor.appendChild(actions);
    const apply=el("button","primary","Apply profile changes");apply.disabled=readonly;actions.appendChild(apply);
    if(readonly) editor.appendChild(el("p","muted","Clone is synchronized automatically from Me. All stats match Me except movement speed, which is 90% of Me and rounded to one decimal place."));
    else editor.appendChild(el("p","muted","Success and double-gather fields are percentages in the UI. Changes are saved in this browser when applied."));
    apply.onclick=()=>{
      try{
        const old=selectedProfile;let newName=nameInput.value.trim();if(!newName)throw new Error("Name cannot be empty");if(newName!==old&&state.profiles[newName])throw new Error("A profile with that name already exists");
        const p=Gauntlet.deepClone(profile);p.name=newName;p.movement_speed=Math.round(numValue(speedInput,p.movement_speed)*10)/10;p.backpack_size=Math.max(1,intValue(bagInput,p.backpack_size));
        for(const role of Gauntlet.ROLES){const a=roleInputs.get(role)!;p.role_stats[role]={tier:Math.max(0,Math.trunc(numValue(a[0]))),gather_time:numValue(a[1]),gather_success:Gauntlet.clamp(numValue(a[2])/100,0,1),double_gather:Gauntlet.clamp(numValue(a[3])/100,0,1),process_time:numValue(a[4]),process_success:Gauntlet.clamp(numValue(a[5])/100,0,1)};}
        if(newName!==old){delete state.profiles[old];for(const slot of state.party)if(slot.profile_name===old)slot.profile_name=newName;}
        state.profiles[newName]=p;selectedProfile=newName;Gauntlet.cloneFromMe(state);saveStateNow();renderProfiles();renderExperiment();setStatus(`Applied and saved profile: ${newName}`);
      }catch(err){alert(err instanceof Error?err.message:String(err));}
    };
  }

  function inputRow(container:HTMLElement,label:string,value:string,type="text",disabled=false):HTMLInputElement{
    const lab=el("label","field-label",label);const inp=el("input","input") as HTMLInputElement;inp.type=type;inp.value=value;inp.disabled=disabled;container.append(lab,inp);return inp;
  }

  function renderExperiment(): void {
    const panel=qs<HTMLElement>("#experiment-panel");panel.innerHTML="";
    const layout=el("div","experiment-layout");panel.appendChild(layout);
    const party=el("section","card");layout.appendChild(party);party.appendChild(el("div","card-title","Party"));
    const table=el("table","party-table");party.appendChild(table);const head=el("tr");["Slot","Profile","Current role"].forEach(h=>head.appendChild(el("th","",h)));table.appendChild(head);
    const names=profileNames();
    for(let i=0;i<5;i++){
      const slot=state.party[i];const tr=el("tr");tr.appendChild(el("td","slot-label",`Slot ${i+1}`));
      const ptd=el("td");const ps=el("select","input") as HTMLSelectElement;for(const name of names){const o=el("option") as HTMLOptionElement;o.value=name;o.textContent=name;o.selected=name===slot.profile_name;ps.appendChild(o);}ptd.appendChild(ps);tr.appendChild(ptd);
      const rtd=el("td");const rs=roleSelect(slot.manual_role);rtd.appendChild(rs);tr.appendChild(rtd);table.appendChild(tr);
      ps.onchange=()=>{slot.profile_name=ps.value;saveStateNow();};rs.onchange=()=>{slot.manual_role=rs.value as Gauntlet.Role;saveStateNow();};
    }
    party.appendChild(el("p","muted","Slot 1 is used for Fortify XP calculations. Identical stand-ins are automatically deduplicated during optimization."));
    const runActions=el("div","actions");party.appendChild(runActions);
    const sim=el("button","primary","Simulate current roles");const opt=el("button","primary","Optimize all role assignments");const cancel=el("button","secondary","Cancel");cancel.disabled=!running;runActions.append(sim,opt,cancel);
    sim.disabled=!!running;opt.disabled=!!running;
    sim.onclick=()=>simulateCurrent();opt.onclick=()=>optimizeCurrent();cancel.onclick=()=>cancelRun();

    const optimizer=el("section","card");layout.appendChild(optimizer);optimizer.appendChild(el("div","card-title","Optimizer"));
    const form=el("div","form-grid optimizer-form");optimizer.appendChild(form);
    const objLabel=el("label","field-label","Objective");const obj=el("select","input") as HTMLSelectElement;for(const v of ["XP / hour","XP / run","Mean wave cleared","Chance to clear target"] as Gauntlet.Objective[]){const o=el("option") as HTMLOptionElement;o.value=v;o.textContent=v;o.selected=v===state.optimizer.objective;obj.appendChild(o);}form.append(objLabel,obj);
    const target=inputRow(form,"Target wave",String(state.optimizer.target_wave),"number");
    const pre=inputRow(form,"Pre-screen runs / candidate",String(state.optimizer.pre_screen_runs),"number");
    const cutoff=inputRow(form,"Pre-screen cutoff (% of best)",String(state.optimizer.pre_screen_filter*100),"number");
    const screen=inputRow(form,"Screening runs / survivor",String(state.optimizer.screening_runs),"number");
    const final=inputRow(form,"Final runs / finalist",String(state.optimizer.finalist_runs),"number");
    const finalists=inputRow(form,"Finalists",String(state.optimizer.finalist_count),"number");
    const seed=inputRow(form,"Random seed",String(state.optimizer.seed),"number");
    const checks=el("div","checks");optimizer.appendChild(checks);
    const health=checkbox("Require at least one Health player",state.optimizer.require_health);const force=checkbox("Require at least one Force player",state.optimizer.require_force);checks.append(health.wrap,force.wrap);
    const persist=()=>{state.optimizer.objective=obj.value as Gauntlet.Objective;state.optimizer.target_wave=Math.max(1,intValue(target,30));state.optimizer.pre_screen_runs=Math.max(1,intValue(pre,1));state.optimizer.pre_screen_filter=Gauntlet.clamp(numValue(cutoff,75)/100,0,1);state.optimizer.screening_runs=Math.max(1,intValue(screen,100));state.optimizer.finalist_runs=Math.max(1,intValue(final,3000));state.optimizer.finalist_count=Math.max(1,intValue(finalists,8));state.optimizer.seed=intValue(seed,12345);state.optimizer.require_health=health.input.checked;state.optimizer.require_force=force.input.checked;saveStateDebounced();};
    [obj,target,pre,cutoff,screen,final,finalists,seed,health.input,force.input].forEach(x=>{x.addEventListener("change",persist);x.addEventListener("input",persist);});
    const presets=el("div","preset-row");optimizer.appendChild(presets);presets.appendChild(el("span","","Run size:"));for(const name of ["Fast","Standard","Precise"]){const b=el("button","secondary small",name);b.onclick=()=>{const p=state.settings.run_presets[name];if(!p)return;state.optimizer.pre_screen_runs=p.pre_screen_runs;state.optimizer.screening_runs=p.screening_runs;state.optimizer.finalist_runs=p.finalist_runs;state.optimizer.finalist_count=p.finalist_count;saveStateNow();renderExperiment();};presets.appendChild(b);}
    optimizer.appendChild(el("p","muted","Pre-screening uses a handful of runs to cull clearly weak assignments by the relative cutoff. Survivors get the normal screen, then only the top finalists receive the large sample."));
  }

  function checkbox(label:string,checked:boolean):{wrap:HTMLElement,input:HTMLInputElement}{const wrap=el("label","check");const input=el("input") as HTMLInputElement;input.type="checkbox";input.checked=checked;wrap.append(input,document.createTextNode(label));return{wrap,input};}

  function showGameModel(): void {
    gameTabVisible=true;addTabButton("game","Game model",true);renderGameModel();selectTab("game");setStatus("Opened Game model");
  }
  function closeGameModel():void{gameTabVisible=false;document.querySelector('.tab-button[data-tab="game"]')?.remove();qs<HTMLElement>("#game-panel").hidden=true;selectTab("experiment");setStatus("Closed Game model");}

  function renderGameModel(): void {
    const panel=qs<HTMLElement>("#game-panel");panel.innerHTML="";panel.dataset.tab="game";
    const header=el("div","model-header");header.appendChild(el("h2","","Game model"));const close=el("button","secondary","Close Game Model");close.onclick=closeGameModel;header.appendChild(close);panel.appendChild(header);
    panel.appendChild(el("p","muted","These are model assumptions, not hidden constants. Change them freely for sensitivity tests."));
    const form=el("div","form-grid game-form");panel.appendChild(form);
    const fields:[keyof Gauntlet.GameConfig,string][]=[
      ["fortress_node_distance","Fortress ↔ node distance (px)"],["gather_process_distance","Gather ↔ process distance (px)"],["prep_seconds","Prep time before wave 1 (s)"],["wave_interval","Wave interval (s)"],["combat_interval","Combat interval (s)"],["starting_stat","Starting army stat"],["incoming_constant","Incoming mitigation constant"],["outgoing_constant","Outgoing mitigation constant"],["lane_noise_per_wave","Lane-noise bound growth / wave"],["lane_noise_cap","Lane-noise maximum bound"],["health_base","Enemy health base coefficient"],["health_growth","Enemy health growth"],["health_milestone_mult","Enemy health × per milestone"],["health_milestone_every","Health milestone every N waves"],["attack_growth","Enemy attack growth"],["defense_per_wave","Enemy defense / wave"],["action_xp_base","Action XP base"],["action_xp_wave_slope","Action XP / wave"],["failure_xp_mult","Failure XP multiplier"],["completion_xp_power","Completion XP exponent"],["max_wave","Simulation wave ceiling"]
    ];
    const inputs=new Map<keyof Gauntlet.GameConfig,HTMLInputElement>();
    for(const [key,label] of fields){const inp=inputRow(form,label,String(state.game[key] as any),"number");inputs.set(key,inp);}
    const noise=checkbox("Randomize enemy Force allocation across lanes",state.game.use_lane_noise);panel.appendChild(noise.wrap);
    const matsWrap=el("div","form-grid single-form");panel.appendChild(matsWrap);const mats=inputRow(matsWrap,"Processed material values T0…T10",state.game.material_values.join(","));panel.appendChild(el("p","muted","Comma-separated, e.g. 2,3,4,5,7,9,12,16,22,30,40"));
    const actions=el("div","actions");panel.appendChild(actions);const restore=el("button","secondary","Restore game-model defaults");const apply=el("button","primary","Apply game-model changes");actions.append(restore,apply);
    restore.onclick=()=>{if(!confirm("Restore only Game model settings from factory defaults? Profiles and Experiment settings will be left unchanged."))return;state.game=Gauntlet.deepClone(factoryState.game);saveStateNow();renderGameModel();setStatus("Restored game-model defaults");};
    apply.onclick=()=>{try{for(const [key] of fields){const inp=inputs.get(key)!;(state.game as any)[key]=(key==="health_milestone_every"||key==="max_wave")?intValue(inp):(numValue(inp));}state.game.use_lane_noise=noise.input.checked;const vals=mats.value.split(",").map(x=>Number(x.trim())).filter(Number.isFinite).map(Math.trunc);if(!vals.length)throw new Error("Material values cannot be empty");state.game.material_values=vals;saveStateNow();setStatus("Applied and saved game-model changes");}catch(err){alert(err instanceof Error?err.message:String(err));}};
  }

  function snapshotState():Gauntlet.AppState{return Gauntlet.deepClone(state);}
  function setRunning(on:boolean):void{renderExperiment();qs<HTMLButtonElement>("#global-cancel").disabled=!on;}

  async function simulateCurrent():Promise<void>{
    if(running)return;saveStateNow();const snap=snapshotState();const roles=snap.party.map(s=>s.manual_role);running=new BrowserSimulationRunner();setRunning(true);setStatus(`Simulating current party (${snap.optimizer.finalist_runs.toLocaleString()} runs)…`,0,snap.optimizer.finalist_runs);
    try{const result=await running.runStage(snap,[roles],snap.optimizer.finalist_runs,snap.optimizer.seed,"simulate",progressUpdate);createResultsTab(result,snap);setStatus("Finished. Saved 1 result in a new result tab.");}catch(err){handleRunError(err);}finally{running=null;setRunning(false);}
  }

  async function optimizeCurrent():Promise<void>{
    if(running)return;saveStateNow();const snap=snapshotState();running=new BrowserSimulationRunner();setRunning(true);
    try{
      const assignments=Gauntlet.enumerateUniqueAssignments(snap);setStatus(`Pre-screening ${assignments.length.toLocaleString()} assignments…`);
      const pre=await running.runStage(snap,assignments,snap.optimizer.pre_screen_runs,snap.optimizer.seed,"pre",progressUpdate);
      const survivors=Gauntlet.filterByRelativeObjective(pre,snap.optimizer.objective,snap.optimizer.pre_screen_filter);
      const screened=await running.runStage(snap,survivors.map(r=>r.roles),snap.optimizer.screening_runs,snap.optimizer.seed+1_000_000,"screen",progressUpdate);
      screened.sort((a,b)=>Gauntlet.objectiveValue(b.metrics,snap.optimizer.objective)-Gauntlet.objectiveValue(a.metrics,snap.optimizer.objective));
      const finalists=screened.slice(0,Math.max(1,Math.min(snap.optimizer.finalist_count,screened.length)));
      const final=await running.runStage(snap,finalists.map(r=>r.roles),snap.optimizer.finalist_runs,snap.optimizer.seed+10_000_000,"final",progressUpdate);
      final.sort((a,b)=>Gauntlet.objectiveValue(b.metrics,snap.optimizer.objective)-Gauntlet.objectiveValue(a.metrics,snap.optimizer.objective));
      createResultsTab(final,snap);setStatus(`Finished. Saved ${final.length} result(s) in a new result tab.`);
    }catch(err){handleRunError(err);}finally{running=null;setRunning(false);}
  }

  function cancelRun():void{if(running){running.cancel();setStatus("Stopping after the current simulation batches…");}}
  function handleRunError(err:unknown):void{if(err instanceof CancelledError)setStatus("Simulation cancelled");else{console.error(err);setStatus("Simulation failed");alert(err instanceof Error?err.message:String(err));}}
  function progressUpdate(stage:string,runsDone:number,totalRuns:number,candidatesDone:number,totalCandidates:number):void{
    const labels:Record<string,string>={pre:"Pre-screening",screen:"Screening",final:"Finalizing",simulate:"Simulating"};const label=labels[stage]||stage;
    if(stage==="simulate")setStatus(`${label}: ${runsDone.toLocaleString()} / ${totalRuns.toLocaleString()} runs completed…`,runsDone,totalRuns);
    else{const noun=stage==="final"?"finalists":"candidates";setStatus(`${label}: ${runsDone.toLocaleString()} / ${totalRuns.toLocaleString()} runs completed (${candidatesDone.toLocaleString()} / ${totalCandidates.toLocaleString()} ${noun} complete)…`,runsDone,totalRuns);}
  }

  class CancelledError extends Error {}
  interface StageTask{taskId:number;candidateIndex:number;roles:Gauntlet.Role[];startIndex:number;count:number;baseSeed:number;}
  class BrowserSimulationRunner{
    private workers:Worker[]=[];private cancelled=false;private rejectActive:((e:any)=>void)|null=null;
    cancel():void{this.cancelled=true;for(const w of this.workers)w.terminate();this.workers=[];if(this.rejectActive)this.rejectActive(new CancelledError("cancelled"));}
    runStage(state:Gauntlet.AppState,assignments:Gauntlet.Role[][],runs:number,seed:number,stage:string,progress:(stage:string,runsDone:number,totalRuns:number,candidatesDone:number,totalCandidates:number)=>void):Promise<Gauntlet.CandidateResult[]>{
      if(!assignments.length)return Promise.resolve([]);const runCount=Math.max(1,Math.trunc(runs));const batch=Math.max(1,Math.trunc(state.settings.simulation_batch_size||100));const profiles=state.party.map(s=>state.profiles[s.profile_name]);const realIndex=Math.max(0,state.party.findIndex(s=>s.is_real_player));
      const tasks:StageTask[]=[];let taskId=0;assignments.forEach((roles,ci)=>{for(let start=0;start<runCount;start+=batch)tasks.push({taskId:taskId++,candidateIndex:ci,roles,startIndex:start,count:Math.min(batch,runCount-start),baseSeed:seed});});
      const totalRuns=assignments.length*runCount,totalCandidates=assignments.length;const aggs=assignments.map(()=>Gauntlet.emptyAggregate());const finished=new Array(assignments.length).fill(false);let runsDone=0,candidatesDone=0,nextTask=0,doneTasks=0;
      const workerCount=Math.max(1,Math.min((navigator.hardwareConcurrency||4),tasks.length));
      return new Promise((resolve,reject)=>{
        this.rejectActive=reject;const cleanup=()=>{for(const w of this.workers)w.terminate();this.workers=[];this.rejectActive=null;};
        const dispatch=(w:Worker)=>{if(this.cancelled)return;if(nextTask>=tasks.length)return;w.postMessage({kind:"run",...tasks[nextTask++]});};
        for(let i=0;i<workerCount;i++){
          const w=new Worker("worker.js");this.workers.push(w);
          w.onmessage=(ev:MessageEvent<any>)=>{const msg=ev.data;if(msg.kind==="ready"){dispatch(w);return;}if(msg.kind==="error"){cleanup();reject(new Error(msg.message));return;}if(msg.kind==="done"){
            Gauntlet.mergeAggregate(aggs[msg.candidateIndex],msg.aggregate as Gauntlet.Aggregate);runsDone+=msg.count;doneTasks++;
            if(!finished[msg.candidateIndex]&&aggs[msg.candidateIndex].runs>=runCount){finished[msg.candidateIndex]=true;candidatesDone++;}
            progress(stage,Math.min(runsDone,totalRuns),totalRuns,candidatesDone,totalCandidates);
            if(doneTasks>=tasks.length){const out=assignments.map((roles,idx)=>({roles:[...roles],metrics:Gauntlet.aggregateToMetrics(aggs[idx],state.optimizer.target_wave)}));cleanup();resolve(out);return;}dispatch(w);
          }};
          w.onerror=e=>{cleanup();reject(new Error(e.message||"Worker failed"));};w.postMessage({kind:"init",profiles,cfg:state.game,realIndex});
        }
      });
    }
  }

  function createResultsTab(results:Gauntlet.CandidateResult[],snapshot:Gauntlet.AppState):void{
    const id=`results-${++resultsCounter}`;const data:ResultTabData={id,label:`Results ${resultsCounter}`,results,snapshot,selected:0};resultTabs.set(id,data);addTabButton(id,data.label);renderResultTab(data);selectTab(id);
  }
  function renderResultTab(data:ResultTabData):void{
    let panel=document.querySelector<HTMLElement>(`.tab-panel[data-tab="${data.id}"]`);if(!panel){panel=el("main","tab-panel result-panel");panel.dataset.tab=data.id;qs("#panels").appendChild(panel);}panel.innerHTML="";
    const split=el("div","result-split");panel.appendChild(split);applyAllSplitRatios();
    const top=el("section","card result-top");
    const handle=el("div","splitter");
    const bottomShell=el("div","result-bottom-shell");
    const bottom=el("section","card result-bottom");
    split.append(top,handle,bottomShell);bottomShell.appendChild(bottom);
    top.appendChild(el("div","card-title","Rankings"));
    bottom.appendChild(el("div","card-title","Selected result"));

    const tableWrap=el("div","table-scroll");top.appendChild(tableWrap);const table=el("table","results-table");tableWrap.appendChild(table);const hr=el("tr");for(const h of ["#","Roles by slot","Mean cleared","Median","P(target+)","XP/run","XP/hour","Run sec","Overrun"])hr.appendChild(el("th","",h));table.appendChild(hr);
    const rows:HTMLTableRowElement[]=[];
    const detail=el("pre","result-detail");bottom.appendChild(detail);
    data.results.forEach((res,idx)=>{
      const m=res.metrics;const tr=el("tr",idx===data.selected?"selected":"") as HTMLTableRowElement;
      const vals=[String(idx+1),res.roles.map((r,i)=>`${i+1}: ${r}`).join(" | "),fmt(m.mean_cleared,3),String(m.median_cleared),pct(m.target_probability),fmt(m.mean_xp_run,0),fmt(m.mean_xp_hour,0),fmt(m.mean_duration,1),pct(m.overrun_rate)];
      vals.forEach((v,i)=>tr.appendChild(el("td",i===1?"assignment":"",v)));
      tr.onclick=()=>{data.selected=idx;rows.forEach((row,j)=>row.classList.toggle("selected",j===idx));updateResultDetail(detail,data.results[idx],data.snapshot);};
      rows.push(tr);table.appendChild(tr);
    });

    const actions=el("div","actions result-actions");bottomShell.appendChild(actions);
    const use=el("button","primary","Use selected roles in Experiment tab");
    const close=el("button","secondary","Close result tab");
    actions.append(close,use);
    use.onclick=()=>{const res=data.results[data.selected];res.roles.forEach((r,i)=>state.party[i].manual_role=r);saveStateNow();renderExperiment();selectTab("experiment");setStatus("Copied selected role assignment to the Experiment tab");};
    close.onclick=()=>closeResultTab(data.id);
    updateResultDetail(detail,data.results[data.selected],data.snapshot);

    let dragging=false,startY=0,startRatio=state.settings.results_top_ratio;
    handle.onpointerdown=e=>{dragging=true;startY=e.clientY;startRatio=state.settings.results_top_ratio;handle.setPointerCapture(e.pointerId);};
    handle.onpointermove=e=>{if(!dragging)return;const rect=split.getBoundingClientRect();const ratio=Gauntlet.clamp(startRatio+(e.clientY-startY)/Math.max(1,rect.height),0.20,0.75);state.settings.results_top_ratio=ratio;applyAllSplitRatios();};
    handle.onpointerup=e=>{if(!dragging)return;dragging=false;try{handle.releasePointerCapture(e.pointerId);}catch{}saveStateNow();};
  }
  function updateResultDetail(pre:HTMLElement,res:Gauntlet.CandidateResult,snap:Gauntlet.AppState):void{
    const m=res.metrics;const lines:string[]=["ROLE ASSIGNMENT","---------------"];res.roles.forEach((role,i)=>lines.push(`Slot ${String(i+1).padEnd(3)} ${snap.party[i].profile_name.padEnd(18)}  ${role}`));
    const metric=(label:string,val:string)=>`${(label+":").padEnd(22)}${val}`;lines.push("","SUMMARY","-------",metric("Runs",m.runs.toLocaleString()),metric("Mean cleared",m.mean_cleared.toFixed(4)),metric("Median cleared",String(m.median_cleared)),metric("Central 80%",`${m.p10_cleared} – ${m.p90_cleared}`),metric(`P(clear ${snap.optimizer.target_wave}+)`,pct(m.target_probability)),metric("Mean XP / run",fmt(m.mean_xp_run,1)),metric("Mean XP / hour",fmt(m.mean_xp_hour,1)),metric("Mean run duration",`${fmt(m.mean_duration,1)} s`),metric("HP-death rate",pct(m.hp_death_rate)),metric("Overrun rate",pct(m.overrun_rate)),"","WAVE DISTRIBUTION","-----------------");
    const waves=Object.keys(m.distribution).map(Number).sort((a,b)=>a-b);for(const w of waves){const count=m.distribution[w],bar="█".repeat(Math.min(50,Math.round(50*count/m.runs)));lines.push(`${String(w).padStart(3)}: ${(100*count/m.runs).toFixed(2).padStart(6)}%  ${bar}`);}pre.textContent=lines.join("\n");
  }
  function closeResultTab(id:string):void{resultTabs.delete(id);document.querySelector(`.tab-button[data-tab="${id}"]`)?.remove();document.querySelector(`.tab-panel[data-tab="${id}"]`)?.remove();if(activeTab===id)selectTab("experiment");}
  function applyAllSplitRatios():void{document.documentElement.style.setProperty("--result-top",`${state.settings.results_top_ratio*100}%`);}

  async function init():Promise<void>{
    try{await loadConfig();buildMenus();renderTabsBase();renderProfiles();renderExperiment();qs<HTMLButtonElement>("#global-cancel").onclick=cancelRun;selectTab("profiles");setStatus("Ready");}
    catch(err){console.error(err);qs<HTMLElement>("#boot-error").hidden=false;qs<HTMLElement>("#boot-error").textContent=`Gauntlet Lab could not start: ${err instanceof Error?err.message:String(err)}. The web build must be served over HTTP(S), not opened directly as a file.`;}
  }
  window.addEventListener("DOMContentLoaded",init);
}
