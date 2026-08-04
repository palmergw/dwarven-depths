# Battlefield language WIP 01

Status: WIP — not an approval candidate.

This early running-client checkpoint shows the authored warm/cool lighting pass in the persistent Phaser scene. The renderer also selects the authored Iron Warden Shield Slam and mine-raider attack poses from authoritative presentation-snapshot-v2 action state; this paused tick intentionally shows the idle poses.

- Source code head: `85df15998626254f7a2ed0c2a59716587f937ade`
- Fixture: `scenarios/conformance/shuttergate-web-truth.json`
- Tick: `1`
- Viewport: `1440×900`
- Settings: reduced motion; combat paused; target controls open
- Integrity: `shuttergate-truth-screen.json` binds viewport, fixture, tick, entity counts, visibility, environment separation, occlusion, interaction, screenshot digest, and source head.

Primary WIP review image: `battlefield-language-wip-01.png`.

The unmodified running-client capture is `shuttergate-truth-screen.png`. The labeled board is generated without cropping by:

`uv run --with-requirements assets/game-art/layered-map-poc/requirements.lock python3 scripts/build_battlefield_wip_board.py`

Current self-critique: the warm/cool pass is visible and both fixed-scale units remain readable, while the broad tutorial floor and nonbranching route remain unobscured. This is not the issue’s battlefield-language gate: attack/Shield Slam impact, damage/status/death, dense wave, boss/elite, terminal, mobile, and normal/reduced-motion clip evidence remain pending.
