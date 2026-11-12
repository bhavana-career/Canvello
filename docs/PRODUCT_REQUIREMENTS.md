# Canvello — Product Requirements Document (PRD)

**Document Version:** 1.3.0 (Phase 1 Final Technical Refinement)  
**Status:** Architecture Baseline Under Review  
**Target Milestone:** Zero-Budget Hackathon & Portfolio Release  

---

## 1. Product Overview & Vision

Canvello is a **website-first, visual software architecture exploration and experimentation platform** connected to GitHub repositories.

Its core philosophy:
> **Understand your architecture. Explore possibilities. Experiment safely. See the impact.**

Canvello transforms abstract software repositories into interactive, progressive-disclosure 3D mental models, enabling developers to conduct controlled, isolated architectural experiments (e.g., swapping database interfaces, refactoring middleware, or altering component boundaries) and observe the empirical impact via automated checks, test suites, and before-and-after graph diffs.

---

## 2. Core Personas & Use Cases

1. **The Hackathon Judge / Portfolio Reviewer**: Needs to evaluate a codebase's structure, modularity, and dependencies in under 3 minutes without cloning, installing dependencies, or running local daemons.
2. **The Software Architect / Lead Developer**: Evaluating architectural refactors, measuring blast radius, and assessing risk before committing engineering resources to major migrations.
3. **The New Contributor / Junior Engineer**: Visualizing the high-level layout of an unfamiliar codebase with dual-mode mental models (Generic vs. Professional explanations).

---

## 3. Product Differentiation

| Traditional Tool Category | Example Tools | Limitations Canvello Solves |
| :--- | :--- | :--- |
| **Static Code Visualizers** | Dependency Cruiser, Madge, CodeSee | Generate dense, unreadable 2D "graph hairballs"; offer no semantic understanding; provide zero experimentation. |
| **AI Coding Assistants** | Copilot Chat, Cursor, ChatGPT | Speculative text outputs; hallucinate cross-file dependencies; cannot empirically verify build/test impacts in isolated environments. |
| **Canvello** | *Canvello* | **Hierarchical 3D disclosure** (no hairballs) + **deterministic AST extraction** + **isolated cloud experimentation** + **empirical test & architecture diffing**. |

---

## 4. Feature Requirements

### 4.1. Landing Page & Visual Identity
- **Visual Aesthetic**: Editorial, elegant, feminine, high-polish developer tool.
- **Palette**:
  - Primary Background: Moonlight White (`#FFFFFF`).
  - Headings & Outlines: Deep Plum (`#29152F`).
  - Secondary Accents: Lavender (`#9B82C4`), Dusty Rose (`#C87A9A`), Blush (`#F3DCE5`), Soft Lilac (`#E8DDF5`).
  - High-Priority Spotlights & Broken Diffs: Cherry (`#C81D4E`).
- **Typography**: Editorial serif headings paired with clean, geometric sans-serif UI typography and monospace code displays.

### 4.2. GitHub App Integration & Repository Ingestion
- Website-first entry: Users authenticate and authorize repositories via a dedicated GitHub App.
- Least-privilege permissions: `Metadata: Read-Only` and `Contents: Read-Only`. Zero write access to repositories, workflows, or actions.
- Pre-flight repository eligibility check: Evaluates repository size, file count, and language profile before ingestion.
- Fallback demo preset: Instant 1-click loading of a curated reference repository with precomputed snapshots.

### 4.3. Hybrid Architecture Grouping
- Deterministic combination of physical directory structure with semantic architectural roles.
- Identifies functional modules (e.g., Auth, Controllers, Persistence, Services, Utilities, Config).
- Collapses low-level library files, build artifacts, and package dependencies into logical group boundaries to eliminate visual clutter.

### 4.4. Three-Level Hierarchical 3D Visualization
- **Level 1 (System Topology)**: High-level architectural clusters and inter-group conduits. Individual internal files and file-to-file edges are hidden.
- **Level 2 (Cluster Exploration)**: Zooming into a cluster reveals internal component files, intra-cluster dependency edges, and boundary ports representing connections to external clusters.
- **Level 3 (File Inspection)**: Selecting a file spotlights its direct dependencies (solid cherry-pink lines) and indirect dependencies (dashed lavender lines) while dimming unrelated nodes.
- **File Fact & Summary Panel**:
  - Deterministic file metrics (LOC, symbols, exports, imports).
  - Dual-mode explanations: **Generic Mode** (clear plain English) and **Professional Mode** (rigorous software engineering terminology).

### 4.5. Repository-Wide Grounded Chat & Canvas Spotlight
- Single central chatbot grounded in deterministic AST graphs and retrieved code contexts.
- Generates file and line citations for statements.
- **Bidirectional Graph Spotlighting**: Mentioning files or dependency paths in chat dynamically spotlights and focuses the corresponding nodes on the 3D canvas.

### 4.6. The Cloud Experimentation Engine
- Automatic, controlled architectural experimentation in an isolated cloud sandbox (E2B microVM candidate).
- Stage-specific execution limits (dependency prep, typecheck, test suite, analysis) with a strict overall ceiling.
- **Step 1**: Baseline capture (AST graph + baseline test suite execution).
- **Step 2**: Targeted architectural patch generation (bounded by configurable file and line policies).
- **Step 3**: Isolated sandbox application and validation (compilation checks + test runner).
- **Step 4**: Empirical before-and-after graph diff generation (visualizing added, removed, and broken relationships).
- **Step 5**: Evidence-based risk card generation (Low / Medium / High classification with transparent supporting test logs).

### 4.7. Persistence & History
- Persistent storage of repository chat history, experiment hypotheses, and empirical diff reports.
- Secret-redacted and truncated test logs (32 KB limit).
- Ephemeral destruction of temporary sandbox environments.
- Manual 3D snapshot export (PNG / JSON).

---

## 5. Scope Delimitations

### In-Scope for MVP
- Website-first architecture running 100% in modern browsers with zero local installs.
- Cloud-hosted backend and isolated cloud sandbox evaluation (E2B microVMs).
- Stage 1 Language Focus: TypeScript/JavaScript (Node.js) with Jest/Vitest.
- Python AST parsing and architecture graph generation.
- Curated experiment presets + bounded open-ended hypothesis testing.

### Explicitly Out-of-Scope for MVP
- Modifying remote GitHub repositories or pushing commits/branches.
- Automated GitHub Pull Request creation.
- Local inference daemons (e.g. Ollama) requiring local software installations.
- Mixed-language monorepos (e.g., Turborepo, Nx).
- Real-time multi-user collaborative editing.
- Audio synthesis / read-aloud features.
