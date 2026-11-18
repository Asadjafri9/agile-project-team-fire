# QA Testing Techniques & Methodology
**Project:** Team Fire — Agile Project Management Workspace  
**Live Environment:** `https://team-fire-agile.vercel.app/`  
**QA Engineer:** Muhammad Fasih (`22k-5003` / GitHub: `k225003-Fasih11`)  
**Collaborator (Viewer RBAC Verification):** Tanzil  

---

## 1. Overview
To ensure the reliability, data integrity, and security of the Team Fire Agile workspace across both local demo mode (`SAMPLE DATA`) and the live production deployment (`LIVE` database), a structured black-box and grey-box testing strategy was executed across all core Scrum modules: **Overview**, **Product Backlog**, **Sprint Planning**, **Kanban Board**, **Analytics**, **Team Management**, and **Project Settings**.

---

## 2. Testing Techniques Applied

### 2.1 Functional & End-to-End (E2E) Workflow Testing
- **Objective:** Validate complete Scrum lifecycle workflows from project creation to sprint execution and reporting.
- **Execution:**
  - Created a live production project (`work2.0`), configured WIP limits, authored backlog items, allocated stories across active and planned sprints, updated task details, and verified end-to-end delivery metrics.

### 2.2 Role-Based Access Control (RBAC) & Security Matrix Testing
- **Objective:** Verify strict permission boundaries across all three system roles: **Product Owner**, **Scrum Master**, and **Viewer**.
- **Execution:**
  - Tested role switching in demo mode and conducted live multi-user testing on `work2.0` where Fasih operated as **Product Owner** and invited Tanzil as a live **Viewer**.
  - Verified that unauthorized actions (editing project WIP limits, archiving projects, creating backlog items, moving board cards, starting/completing sprints, and inviting/modifying team members) are blocked or hidden for the **Viewer** role.

### 2.3 Boundary Value Analysis (BVA) & Input Validation Testing
- **Objective:** Ensure domain rules for Agile estimation are enforced at the UI and persistence layers.
- **Execution:**
  - Tested **Story Points** input fields against valid Fibonacci values (`1, 2, 3, 5, 8, 13`) versus invalid non-Fibonacci numbers (e.g., `0`, `4`, `6`, negative values) to prevent malformed velocity and burnup analytics.

### 2.4 State Persistence & Database Synchronization Testing
- **Objective:** Confirm that state mutations persist accurately without data loss across modal close/reopen cycles and full browser reloads (`F5`).
- **Execution:**
  - Verified in-modal field updates (Title, Priority, Story Points, Assignee, Planned Hours, Description, Labels) and new backlog item creation against the connected production database on Vercel.

### 2.5 Cross-Sprint Data Isolation & Analytical Integrity Testing
- **Objective:** Verify that sprint-scoped metrics remain isolated to the selected active sprint.
- **Execution:**
  - Created an active sprint (`Sprint 01` with `5 pts`) alongside a planned future sprint (`Sprint 02` with `8 pts`) and inspected the **Analytics** dashboard to ensure future planned allocations do not leak into the active sprint's **Current remaining** workload.

### 2.6 Exploratory & Negative Testing
- **Objective:** Uncover UI regressions, console warnings, and missing user journeys outside happy-path flows.
- **Execution:**
  - Inspected browser DevTools Console during modal interactions (identifying and logging React controlled/uncontrolled input issues).
  - Evaluated the authentication entry flow on the landing page, identifying the absence of a self-service **Sign up / Create account** flow alongside the **Sign in** and **Explore demo** options.

### 2.7 Regression Testing
- **Objective:** Verify that all reported defects remain resolved after production deployment without introducing side effects.
- **Execution:**
  - Logged 7 reproducible defect reports on GitHub (`Issues #5` through `#11`) and executed full regression verification on the live Vercel + Database build once patches were deployed.
