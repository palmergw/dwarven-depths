# Shuttergate combat animation assets

Issue #273 presentation-only character assets. These exports never define gameplay truth.

Build:

`uv run --python 3.13.5 --with-requirements assets/game-art/combat-animation/requirements.lock python3 assets/game-art/combat-animation/build_assets.py`

Verify without rewriting:

`uv run --python 3.13.5 --with-requirements assets/game-art/combat-animation/requirements.lock python3 assets/game-art/combat-animation/build_assets.py --verify`

The exporter strictly binds source hashes, crop grid, output dimensions, alpha semantics, stable IDs, canonical ordering, and all generated files. Warden exports reuse the approved project-owned six-pose source master. Hostile exports use the original role atlas and preserve the fixed 44 px nominal unit scale inside a shared 80×60 pivot canvas.
