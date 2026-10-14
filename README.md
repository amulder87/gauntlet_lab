# Gauntlet Lab

Gauntlet Lab is a browser-based simulator and strategy optimizer for the **Gauntlet** minigame in [ScapeWatch](https://scapewatch.com/).

It is designed to answer questions like:

- What fixed-role party composition is best for my stats?
- Which role should my main character take when using clones?
- How does a party perform if its members have different tiers or skill stats?
- Which setup maximizes expected wave progression?
- Which setup maximizes Fortify XP per run or XP per hour?
- How likely is a composition to clear a specific wave?
- How sensitive is a strategy to changes in movement speed, gathering success, processing speed, backpack size, or other mechanics?

All simulations run locally in your browser. No account, login, or server-side simulation is required.

## Using Gauntlet Lab

The app is organized around profiles, experiments, and results.

### Profiles

A profile describes one player or stand-in.

Each profile can have its own:

- movement speed
- backpack size
- tier for each Gauntlet role
- gather time
- gather success chance
- process time
- process success chance
- double-gather chance

Gauntlet Lab includes generic profiles from **T0 through T11** that can be used directly or as starting points for custom profiles.

The built-in `Me` profile is intended for your own character.

The built-in `Clone` profile automatically follows the `Me` profile, except that clone movement speed is set to 90% of the main character's movement speed.

### Experiment

The Experiment tab defines the five participants in a raid and what you want to optimize.

Slot 1 is special only because its Fortify XP is tracked for XP-based objectives. Put the character whose XP you care about in that slot.

You can either assign roles manually or ask Gauntlet Lab to search for the best fixed-role composition.

Available objectives include:

- mean highest wave cleared
- probability of clearing a target wave
- Fortify XP per run
- Fortify XP per hour

The optimizer uses several stages so that obviously weak compositions can be discarded cheaply before spending large numbers of simulation runs on the strongest candidates.

Fast, Standard, and Precise presets control how much simulation work is performed.

### Results

Every completed simulation or optimization opens in its own Results tab.

This makes it easy to:

1. run an experiment
2. change a profile or game setting
3. run it again
4. switch between the two result tabs and compare them

Results include statistics such as:

- mean and median highest wave cleared
- probability of reaching the target wave
- Fortify XP per run
- Fortify XP per hour
- average run duration
- overrun rate
- wave-clear distribution
- role assignment for every slot

The Results panes can be resized, and that layout is shared across result tabs.

## How the simulator works

Gauntlet Lab uses Monte Carlo simulation rather than treating resource production as a perfectly smooth rate.

Individual gathering and processing actions are simulated with their configured success chances, durations, double-gather probabilities, backpack sizes, and movement speeds.

This matters because Gauntlet stats are deposited in discrete chunks. A deposit arriving a few seconds earlier or later can change whether it lands before an important combat round.

### Resource loops

A normal production loop consists of:

1. walking from the fortress to the gathering node
2. gathering until the backpack is full
3. walking to the processing node
4. attempting to process every raw resource
5. returning to the fortress
6. depositing processed resources into the assigned army stat

Failed gathering attempts consume time but produce no resource.

A successful double gather produces two resources when backpack space allows.

Each raw resource receives one processing attempt. A failed processing attempt loses that resource.

### Waves and combat

The simulator uses a global wave clock.

There is a two-minute preparation period before Wave 1.

After that:

- a new wave arrives every 20 seconds
- the first combat round occurs 1.5 seconds after a wave arrives
- additional combat rounds occur every 1.5 seconds
- killing a wave does not reset the global 20-second timer

Enemy damage resolves before player-army damage. If the army dies to the incoming hit, its attack for that combat round does not occur.

### Wave stacking

If a new wave arrives while the current wave is still alive, the waves merge.

The stacked enemy receives:

- remaining HP from the existing wave plus the new wave's HP
- existing Force plus the new wave's Force
- the new wave's Defense value

The merged stack is treated as one enemy. The old wave is no longer tracked separately.

If another wave arrives before the complete stacked enemy is defeated, the raid is overrun.

A stacked wave arriving does **not** count as a cleared wave. Only fully defeated waves count toward the final result.

### Enemy Force distribution

Enemy total Force is divided between Melee, Ranged, and Magic with bounded random variation.

This can matter substantially for asymmetric parties. For example, a party with heavy Melee Force may survive a Melee-heavy enemy wave much more easily than a Range-heavy or Magic-heavy one.

### Damage

Player-army outgoing damage uses the combined Melee, Ranged, and Magic Force of the army and is mitigated by enemy Defense.

Incoming enemy damage is evaluated separately for Melee, Ranged, and Magic. Each lane is mitigated by the army's Defense plus its corresponding Force stat.

Damage is floored after the applicable damage components are combined.

Several combat constants are based on observed in-game behavior and can be adjusted through the Game Model settings.

## Fortify XP

Gauntlet Lab can optimize for Fortify XP rather than only wave progression.

Each action earns Fortify XP based on the wave active when that action occurs.

Successful actions receive full action XP, while failed actions receive a reduced amount.

The raid also awards a completion bonus based on the highest wave actually cleared.

Because action XP increases with wave depth, XP/hour optimization can behave differently from simply maximizing the average wave reached.

For example, a role with a very high gathering success rate may complete resource loops efficiently but perform fewer total XP-generating actions. Another role may produce slightly less army value while generating more Fortify XP.

The simulator tracks these effects directly.

## Game Model settings

Most players should not need to change the underlying game model.

The Game Model tab is hidden by default and can be opened from the File menu.

It contains editable mechanics and constants such as:

- node distances
- wave timings
- combat interval
- initial army stats
- damage mitigation constants
- enemy scaling formulas
- enemy Force variation
- XP formulas
- material contribution values

This makes it possible to update the simulator as Gauntlet mechanics are better understood without rewriting the application.

The Game Model tab also has its own restore-defaults option, so experimental model changes can be discarded without resetting player profiles.

## Saving settings

Profiles, experiments, game-model changes, and UI preferences are automatically saved in browser storage.

There is no account system and no remote database.

Your configuration stays in your browser unless you clear that site's stored data.

## Performance

Simulation work is automatically divided across browser Web Workers so that multiple CPU cores can be used.

Long optimizer stages are processed in smaller batches so the interface can continue reporting progress instead of appearing frozen while a large candidate finishes.

The optimizer uses three stages:

1. **Pre-screen** — very small samples quickly eliminate clearly weak candidates.
2. **Screening** — surviving candidates receive additional runs.
3. **Finalists** — the strongest candidates receive the largest simulation sample.

A relative pre-screen cutoff prevents obviously inferior candidates from consuming most of the simulation time.

## Accuracy and model assumptions

Gauntlet Lab is a simulator, not an official ScapeWatch tool.

Some Gauntlet mechanics are documented directly, while others have been inferred or calibrated from observed gameplay.

The model has been tested against recorded values for:

- enemy wave HP scaling
- enemy Force scaling
- enemy Defense scaling
- observed incoming damage
- observed outgoing damage
- resource production
- wave timing
- stacking behavior
- Fortify XP behavior

There may still be undocumented mechanics or hidden precision that cause real runs to differ from simulated results.

For that reason, Gauntlet Lab is generally most useful for comparing strategies against one another rather than treating an individual probability as an exact prediction.

If you find repeatable in-game behavior that disagrees with the simulator, please open an issue with the relevant stats, wave information, and observed result.

## Running the project locally

Gauntlet Lab is a static browser application written in TypeScript.

After cloning the repository:

```bash
npm install
npm run build
```

The built application is written to `dist/`.

Because the simulator uses Web Workers, the site should be served through HTTP rather than opened directly with a `file://` URL.

Any simple static web server can be used for local development or testing.

## Project structure

```text
src/        Application and simulation source
public/     Static assets and default game configuration
tests/      Simulation and regression tests
tools/      Build utilities
dist/       Generated website build
```

`dist/` is generated output and is not part of the source of truth.

## Privacy

Gauntlet Lab runs locally in your browser.

It does not require:

- a ScapeWatch login
- your ScapeWatch credentials
- an account
- uploading character profiles
- uploading simulation results

Profiles and settings are stored locally by your browser.

## Contributing

Bug reports, corrections to game mechanics, reproducible simulation disagreements, and improvements are welcome.

When reporting a simulation disagreement, include as much of the following as possible:

- player profiles and roles
- relevant game-model settings
- wave reached
- observed army stats
- enemy Force/Defense values
- observed damage
- whether the wave stacked or ended normally

Concrete in-game observations are especially useful for improving the model.

## License

See the `LICENSE` file for the project's usage and redistribution terms.

Gauntlet Lab is an unofficial community project and is not affiliated with or endorsed by ScapeWatch.
