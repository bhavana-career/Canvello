# Canvello — 7-Phase Engineering Roadmap & Execution Plan

**Document Version:** 1.3.0 (Phase 1 Final Technical Refinement)  
**Status:** Architecture Baseline Under Review  

---

## 1. The Approved 7 Engineering Phases

The development of Canvello is strictly partitioned into seven sequential phases. Each phase requires explicit verification and user approval before proceeding to the next.

```
+─────────────────────────────────────────────────────────────────────────────────+
|                           CANVELLO 7-PHASE ROADMAP                              |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase   | Official Phase Title                         | Core Deliverable Focus |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 1 | Project Audit and Architecture Realignment   | Architecture Baseline, |
|         | (CURRENT PHASE - UNDER REVIEW)               | PRD, Threat Model,     |
|         |                                              | Infrastructure Audit   |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 2 | Repository Connection and Analysis           | GitHub App Integration,|
|         |                                              | Tree-sitter AST Parser,|
|         |                                              | NetworkX Hybrid Graph  |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 3 | Interactive Architecture Visualization       | React Three Fiber 3D   |
|         |                                              | Canvas, 3-Level Nav,   |
|         |                                              | Moonlight White UI     |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 4 | Repository Intelligence                      | Configurable AI Adapter|
|         |                                              | Grounded Chat Citations|
|         |                                              | 3D Canvas Spotlighting |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 5 | Agent and Cloud Sandbox                      | E2B MicroVM Sandbox    |
|         |                                              | Pipeline & Validation, |
|         |                                              | Hardened Execution     |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 6 | Architecture Experimentation                 | Targeted Patch Engine, |
|         |                                              | Baseline/Test Diffs,   |
|         |                                              | Evidence Risk Cards    |
+─────────+──────────────────────────────────────────────+────────────────────────+
| Phase 7 | Integration, Security, and Demo Readiness    | End-to-End Hardening,  |
|         |                                              | Empirical Benchmarks,  |
|         |                                              | Offline Golden Demo    |
+─────────+──────────────────────────────────────────────+────────────────────────+
```

---

## 2. Phase 1 Deliverables & Acceptance Checklist

To consider **Phase 1: Project Audit and Architecture Realignment** officially complete, all criteria below must be verified:

- [x] **Project Audit & History**: Workspace status accurately documented (Git tracking uninitialized, application code untouched, four documentation files created and refined).
- [x] **Infrastructure Audit**: Free-tier allowances audited; promotional one-time credits ($100 E2B credit) clearly separated from recurring free quotas.
- [x] **Sandbox Strategy**: E2B microVMs designated as primary prototype candidate subject to benchmarking; Firecracker isolation realistically framed; stage-specific execution limits defined.
- [x] **AI Model Adapter**: Model identifiers made configurable (e.g. Gemini 3.8 Flash, Gemini 3.5 Flash-Lite as examples); dynamic rate-limiting and zero auto-billing enforced.
- [x] **Privacy & Retention**: Exact data artifact taxonomy defined; test log redaction and 32KB cap established; unified diff proprietary code content explicitly stated; independent two-stage consent gates defined.
- [x] **GitHub Security**: Dedicated GitHub App with least-privilege read-only permissions (`Metadata: Read-Only`, `Contents: Read-Only`); server-side token isolation and opaque session cookies defined.
- [x] **Deterministic Scope**: Tree-sitter syntax parsing differentiated from semantic resolution; import handling strategies defined; benchmark targets explicitly noted as aspirational.
- [x] **Master Planning Documentation**:
  - `docs/PRODUCT_REQUIREMENTS.md` (Product vision, personas, hybrid grouping, feature scope).
  - `docs/SYSTEM_ARCHITECTURE.md` (Infrastructure audit, microVM shared responsibilities, stage timeouts).
  - `docs/DATA_FLOW_AND_SECURITY.md` (Artifact taxonomy, log redaction, independent consent gates).
  - `docs/ROADMAP_AND_PHASING.md` (Standardized 7-phase sequence and deliverables).
- [x] **Zero Code/Feature Boundaries**: No application features implemented, no premature dependencies installed, Git remains uninitialized.

---

## 3. Recommended Starting Point for Phase 2: Repository Connection and Analysis

Upon formal approval of Phase 1, **Phase 2 (Repository Connection and Analysis)** will begin with the following concrete milestones:

1. **Repository & Directory Scaffolding**:
   - Initialize Git tracking in `c:\Users\bhava\Downloads\hackyhackathon`.
   - Establish `/web` (Next.js 14 frontend skeleton) and `/backend` (FastAPI Python 3.11 service).
2. **GitHub App Connection Service**:
   - Implement read-only GitHub repository fetching with pre-flight size and file-count eligibility checks using GitHub App installation tokens.
3. **Deterministic AST Parsing Engine**:
   - Integrate Tree-sitter parsers for TypeScript/JavaScript and Python.
   - Implement import and export extraction with relative path and `tsconfig.json` alias resolution.
4. **NetworkX Architecture Graph Service**:
   - Implement the Hybrid Architecture Grouping algorithm to construct clusters, internal nodes, and boundary conduits.
5. **Purpose-Built Demo Repository**:
   - Create a clean 35-file reference TypeScript/Node.js/Express repository with Jest test suite to serve as the deterministic verification target.
6. **Milestone Checkpoint 2**:
   - Ingest the demo repository and verify that the backend produces a structured, deterministic JSON architecture graph matching all specification criteria.
