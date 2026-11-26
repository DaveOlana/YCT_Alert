# AEOS Bootstrap & Initialization Protocol (v0.2)

## 1. Trigger and boundaries

The human may brainstorm freely without an AEOS repository. After requirements are sufficiently clear, the human places AEOS at the repository root and asks the agent to initialize (e.g. `AEOS INIT`, `initialize this project with AEOS`). That explicit instruction grants permission to **write minimal documentation and non-executable directories only**, subject to existing project rules. It does not authorize app code, dependency installation, automatic `git init`, migrations, real data changes, credentials, network actions or any BUILD work.

Do not infer initialization authorization solely from the presence of AEOS files. If the user only requests an audit or plan, keep the result in the response unless writing is separately allowed.

## 2. Discover before generating

1. Detect new vs existing repository. Check filesystem, relevant instructions, branch and `git status` if already a Git repo. Do not erase or reset pre-existing files.
2. Read supplied brainstorming outcomes, specs, proposals, design material, code and tests. Distinguish APPROVED product decisions from PROPOSED and OPEN choices.
3. For integrations, inspect each existing codebase read-only first; verify public API, models, identifiers, permissions, schemas, and environment boundaries in real code. Keep ownership separated and do not assume an API exists because a plan mentions it.
4. Find existing planning documents (`README`, spec, architecture, ADR, roadmap, tasks, bug reports). **Index and reuse them**, don't create duplicates.
5. If essential product decisions aren't settled, mark as OPEN in docs and present only the smallest blocker questions. Do not invent approvals or claim initialization removes required product gates.

## 3. Create only the minimum

- If absent, create root `PROJECT.md` based on `aeos/templates/PROJECT.md`, replacing all placeholders with source-grounded information or explicitly flagged unknowns. Include concise product mission, user groups, scope/non-goals, source-of-truth links, architecture and environment status, decisions/open questions, safety/acceptance gates.
- If absent, create root `STATE.md` based on `aeos/templates/STATE.md`: stage=INIT/PLAN, current inspected state, evidence/limitations, project gate status, first proposed milestone, next action; **BUILD authorization = none**.
- If relevant, create `docs/` to hold supplied approved source documents; don't move/rewrite originals unless authorized. For complex projects, reference existing blueprint/roadmap/API specs rather than producing duplicate architecture docs.
- Create extra records only if risk/complexity genuinely warrants it and they do not compete with existing sources (e.g. threat model for an incident reporting system, API contract for an integration). Propose significant architecture decisions for human approval.
- Do not create app source code, tests, scaffolding frameworks, dependency manifests, `.env`, deployment config, branches or commits. Those belong to a later authorized BUILD unless expressly and separately approved.

For existing `PROJECT.md` or `STATE.md`, inspect and propose minimal in-place updates only within INIT authority; never clobber. If root `AGENTS.md`, `CLAUDE.md` or `GEMINI.md` exists already, **do not overwrite it**. Link AEOS from the existing file with human approval or provide a merge proposal.

## 4. Exit criteria / handoff

Agent must report: discovered sources; new vs existing implementation state; approved vs proposed requirements; significant unknowns/conflicts; documents created/changed; proposed first small milestone (ID, acceptance criteria, test strategy, data/security implications, environment) and any project-specific prerequisite gate; Git status; and explicit note **'No application BUILD authorized; no commit/push/deploy performed.'**

Stop for human review of decisions and initial milestone. `AEOS INIT` can finish even while open decisions remain, as long as they are honestly tracked.

## 5. Subsequent sessions

Read `PROJECT.md`, `STATE.md`, approved project material, current Git/code/test evidence. Apply `RECOVER` before recommending further work. Never interpret stale STATE or a subagent summary as direct authorization to continue BUILD.

## 6. Examples

- **Brainstorming in Claude chat:** no repository needed; ask for product-brief output when ready. Later supply that brief + AEOS in Claude Code, then `AEOS INIT`.
- **Fully specified new software product:** supply spec + AEOS and request `AEOS INIT` directly.
- **YCT Alert with YCT Map codebase:** keep repos distinct; read Map source read-only and preserve YCT Alert blueprint G0–G5; initialize records that reference the blueprint, not reinterpret it.
- **Two non-Claude models:** ensure each model actually loads `AGENTS.md` and core policy; one may be the lead builder, another an independent reviewer; coordinate through Git files and STATE, not assumed shared chat memory.

## 7. Portable installation notes

Agents cannot necessarily execute tools or read local paths in all products; in a web chat, files must be uploaded/provided and the agent may be limited to planning. Real repository initialization requires an environment that can write files. For code assistants that do not automatically load root instructions, the human must explicitly tell them to read `AGENTS.md`.
