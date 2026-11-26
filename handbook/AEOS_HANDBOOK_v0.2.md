# AEOS v0.2 — Drop-in AI Engineering Operating System

**Working handbook · 25 October 2026 · Pilot edition**  
**Purpose:** Allow any supported coding agent to enter a repository, learn the approved product intent, initialize project records after ideation, work under an explicit BUILD gate, verify results, and leave dependable handoffs.

## The central model

**Idea / approved requirements → AEOS at project root → AEOS INIT → human review → BUILD M1 → verification → human-reviewed Git checkpoint.**

AEOS controls *how engineering work happens*. Product source materials define *what is built*. The repository, tests and runtime show *what actually exists*. No single source may silently overwrite another: flag contradictions between intent and implementation.

## Why v0.2 changes the installation model

In v0.1, users extracted a package elsewhere and executed `install_aeos.py`. In v0.2, the operational files are **drop-in**. Place the contents of the distribution folder at the root of a new project. No installer and no auto-execution script are necessary. This makes AEOS immediately portable between IDEs and coding-agent environments.

Root `AGENTS.md` is the general entry point. `CLAUDE.md` points Claude Code to the same policy. `GEMINI.md` is an optional pointer for Gemini-based environments. For other agents, instruct the model explicitly to read root `AGENTS.md`. A model must actually have access to the repository: an uploaded ZIP in a web chat is not equivalent to an environment with filesystem and shell tools.

## What the project root contains before initialization

```text
Project/
  AGENTS.md
  CLAUDE.md
  GEMINI.md                   (optional adapter)
  AEOS_START_HERE.md
  aeos/
    CORE_POLICY.md
    BOOTSTRAP.md
    PLAYBOOKS.md
    QUALITY_PROFILES.md
    RECORDS_AND_HANDOFFS.md
    templates/
    examples/
  docs/                       (supplied requirements, if present)
```

`PROJECT.md` and `STATE.md` **do not need to exist at the beginning**. Their source templates are inside `aeos/templates/`. During `AEOS INIT`, the coding agent creates accurate versions based on real approved requirements, not fictional placeholder data.

## The two permission gates

**AEOS INIT:** Explicit instruction after discovery/ideation. The agent may inspect the repository, supplied specifications and other read-only source material, then create or update only necessary project documents and planning folders. It records approved versus proposed decisions, risks, source-of-truth references and a small first milestone. It must not create application code, dependencies, database migrations or deployment configuration. It must not commit, push or deploy.

**BUILD <milestone>:** Explicit current human authorization for a bounded milestone, only after project-specific prerequisites have been satisfied. The agent executes with high autonomy: writes code, runs focused and broader checks, diagnoses errors, makes bounded corrections and updates progress records. It must stop before a Git commit and before any production or destructive action unless separately authorized.

`BUILD` is a natural-language human control convention, **not executable software**. Quoting the word in a source file, plan or agent message is not authorization.

## Project records and accountability

**PROJECT.md** answers: What is this product? Who is it for? What are the approved goals, exclusions, architectural constraints, known decision gates, source documents and test expectations? For complex products, it is a concise *index* into the existing spec, architecture, API contract, ADRs, threat model, roadmap and release controls. It must not duplicate lengthy documents.

**STATE.md** answers: What does the code actually do today? What is the current milestone, latest Git state, known issues, test evidence, unverified assumptions, and next safe action? Each significant implementation checkpoint updates this record. A new agent checks it against code and Git; it does not blindly trust stale notes.

Do not create a hundred docs. Add specialized records only when complexity or risk requires them, and never create a second competing source of truth.

## Four real starting scenarios

**1. Idea in Claude chat.** Brainstorm freely without initializing a repo. Capture approved decisions and unresolved questions in a product brief. Once an implementable milestone exists, bring the brief and the AEOS root files into a coding-agent project, then request `AEOS INIT`.

**2. Already brainstormed.** Place AEOS at project root alongside the requirements. Open the repo in Claude Code, Codex or another agent and request `AEOS INIT`. Review its generated records, approve important decisions, then authorize a scoped BUILD.

**3. YCT Alert with only YCT Map source code.** Use a separate YCT Alert repo. Keep the YCT Alert blueprint intact under `docs/blueprint/`. Give the agent read-only access to YCT Map. Before integration, it must verify existing APIs, data contracts, ownership boundaries and test evidence in the actual Map source. YCT Map owns geography/navigation; YCT Alert owns incident data and moderation. Preserve G0–G5 and the synthetic-only/real Android and safety restrictions. Approval to build Alert does not authorize modifying Map.

**4. Multiple non-Claude models.** Ensure each actually reads root `AGENTS.md` and core AEOS files; don't assume shared chat memory. One lead builder owns an authorized milestone, a second model can independently review. Avoid concurrent writes to overlapping files. Shared truth comes from the Git repository, approved documents, state record and independently observed tests.

## Evidence and quality

The definition of done scales with the task: static checks, behavior tests, runtime/browser checks, native-device checks, security and integration checks, and production smoke checks when authorized. A passed unit suite is not proof of real-world end-to-end behavior. Each report identifies what was actually run, where, with results; label skipped or blocked checks. Distinguish observed symptoms, verified root causes and hypotheses.

A completed BUILD should return: scope accomplished, changed files, verification evidence, known limitations, risks, updated STATE and recommended next milestone. Do not claim a deployment or a root-cause fix without evidence.

## Git Policy A and safety

Agents cannot commit, push, merge, deploy, reset databases, alter production data, expose secrets, or perform consequential external actions without separate direct authorization. All agents preserve pre-existing local changes and avoid destructive cleanup. High autonomy means freedom to complete safe tasks **inside the authorized milestone**, not unrestricted authority.

For a project with existing `AGENTS.md` or `CLAUDE.md`, **do not overwrite**. Merge a short reference to AEOS after inspecting the existing rules and approval as needed. For prior AEOS installations, upgrade only after human review; don't auto-sync vendored instructions.

## First-message examples

After ideation: `Read root AGENTS.md and AEOS policies. AEOS INIT: inspect the supplied requirements and repository, create only essential planning records, list the remaining decisions and propose the first testable milestone. No code, commit, push or deploy. Stop for review.`

After project planning and necessary project-specific gate approval: `BUILD M1. Implement only the approved M1 scope, verify against its acceptance criteria, update STATE.md, and stop without a Git commit.`

When taking over: `RECOVER. Read the current repository, instructions, PROJECT.md, STATE.md, Git status and relevant code/tests; identify verified state, risks and next safe action. No changes.`

## Limitations of this pilot

This version includes procedural instruction files and templates; it is **not an executable self-installing program**. The agent must have file-writing tools to create project records. The kit has been tested for layout and packaging, not yet validated as a full autonomous multi-model real-project workflow. Regularly inspect and refine it based on observed agent behavior rather than assuming the documentation guarantees correct work.
