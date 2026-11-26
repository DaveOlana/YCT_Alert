# Moving from AEOS v0.1 to v0.2

**v0.1:** extract package outside repository, run `install_aeos.py` to populate root files and pre-made `PROJECT.md` / `STATE.md`.

**v0.2:** extract the **contents** of this drop-in directory straight into the repository root. Root bootstraps are present; `PROJECT.md` / `STATE.md` now live only as templates in `aeos/templates/` until the agent runs human-requested `AEOS INIT`.

- **New empty project:** use v0.2 directly. No installer.
- **Already initialized v0.1 project:** do *not* replace old instructions, PROJECT.md, STATE.md or work. Treat v0.2 as a proposed upgrade. Compare policies, update the bootstrap references after human review, and preserve the existing records.
- **Existing project with root AGENTS.md / CLAUDE.md:** never overwrite. Merge a short pointer to AEOS after checking the combined meaning, or use the model's explicit first-message instruction.
- The two-step authorization is unchanged: `AEOS INIT` allows documentation scaffolding; `BUILD M1` allows code for M1 only, subject to gates.
- Git Policy A remains: no automatic commit/push/merge/deploy.
