# QA Test Execution & Regression Report
**Project:** Team Fire — Agile Project Management Workspace  
**Production URL:** `https://team-fire-agile.vercel.app/`  
**Lead QA Tester:** Muhammad Fasih (`22k-5003` / `k225003-Fasih11`)  
**RBAC Co-Tester (Viewer Role):** Tanzil  
**Final Build Status:** **PASS (All 7 Logged Issues Verified Fixed)**  

---

## 1. Defect Tracking & Regression Summary (GitHub Issues #5 – #11)

All 7 issues identified during initial QA testing were logged on GitHub and re-tested on the live Vercel deployment connected to the production database.

| Bug ID | GitHub Issue | Module | Defect Summary | Pre-Fix Behavior | Post-Fix Verification (`LIVE` Build) | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | `#5` | Task Detail Modal | Task modal edits did not save/persist properly | Edits made inside task detail modal were lost upon closing | In-modal edits save and persist reliably across close/reopen | **PASS** |
| **BUG-02** | `#6` | Project Settings | Viewer role could access and modify Project Settings | Viewer could open Settings and alter WIP limits | Restricted to authorized roles (`Product Owner`) in live projects; hidden in demo/Viewer views | **PASS** |
| **BUG-03** | `#7` | Product Backlog | Viewer role could create new backlog items | `+ New item` button remained active for Viewer role | `+ New item` is restricted strictly to `Product Owner` and `Scrum Master` | **PASS** |
| **BUG-04** | `#8` | Product Backlog | Story points accepted non-Fibonacci values | Arbitrary integers (e.g., `6`) were accepted | Enforces valid Fibonacci sequence (`1, 2, 3, 5, 8, 13`) and persists to live DB | **PASS** |
| **BUG-05** | `#9` | Product Backlog | Work item fields could not be edited post-creation | Created items lacked full field editing support | Title, Priority, Story Points, Assignee, Planned Hours, Description, and Labels are editable and persist | **PASS** |
| **BUG-06** | `#10` | Analytics | Planned future sprint items leaked into active sprint metrics | Allocating items to a planned sprint inflated active sprint `Current remaining` | Sprint scope isolation enforced; planned sprint points do not leak into active sprint metrics | **PASS** |
| **BUG-07** | `#11` | Workspace / Team | Uncontrolled-to-controlled input error & team invite modal issues | React console error triggered on modal open and team invite inputs were blocked | Clean console state; live team invitations functional (`Product Owner` invited `Viewer` on `work2.0`) | **PASS** |

---

## 2. Detailed Functional & RBAC Test Cases

### 2.1 Product Owner Test Suite (Executed by Fasih on `work2.0`)

| Test Case ID | Module | Test Scenario | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-PO-01** | Workspace | Sign in and create a new live project (`work2.0`) | Project created in live DB; creator assigned `Product Owner` role | Project created with `LIVE` badge and `Product Owner` permissions | **PASS** |
| **TC-PO-02** | Settings | Configure and save Kanban column WIP limits | WIP limit changes save to database without errors | `Save WIP limits` persisted updated column thresholds | **PASS** |
| **TC-PO-03** | Backlog | Attempt to enter non-Fibonacci story points (`6`) | Input rejected or restricted to Fibonacci dropdown (`1, 2, 3, 5, 8, 13`) | Only Fibonacci values selectable; persisted after `F5` refresh | **PASS** |
| **TC-PO-04** | Backlog | Edit work item Title, Priority, Story Points, and Description | Changes persist after closing modal and refreshing page | All modified fields saved and reloaded accurately | **PASS** |
| **TC-PO-05** | Analytics | Start `Sprint 01` (`5 pts`) and assign `8 pts` to `Sprint 02 (planned)` | Active `Sprint 01` `Current remaining` stays at `5 pts` | `Current remaining` displayed `5 pts` with zero cross-sprint leakage | **PASS** |
| **TC-PO-06** | Team | Invite a live collaborator (`Tanzil`) with `Viewer` role | Invitation sent and collaborator added to `work2.0` as `Viewer` | Tanzil added to project team with `Viewer` permissions | **PASS** |

### 2.2 Viewer Role RBAC Test Suite (Executed by Tanzil on `work2.0`)

| Test Case ID | Module | Test Scenario | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-VW-01** | Sidebar / Settings | Accept `Viewer` invite and check Project Settings access | `Settings` hidden or locked read-only; WIP limits uneditable | Sidebar `Settings` hidden/restricted for Viewer | **PASS** |
| **TC-VW-02** | Product Backlog | Attempt to create a new backlog item as `Viewer` | `+ New item` button hidden or disabled | `+ New item` button hidden; backlog creation blocked | **PASS** |
| **TC-VW-03** | Board & Sprints | Attempt to move Kanban cards or start/complete sprints | Board cards and sprint controls are strictly read-only | Drag/drop and sprint lifecycle actions disabled | **PASS** |
| **TC-VW-04** | Team Management | Attempt to invite/remove team members or change roles | Team invite and role management controls hidden/locked | Member management restricted from Viewer | **PASS** |

---

## 3. Additional UX / Product Observations
- **Authentication Entry Flow:** Verified that the landing page (`https://team-fire-agile.vercel.app/`) provides **Sign in** and **Explore demo** workflows. Noted as a future enhancement that a self-service **Sign up / Create account** option is not currently exposed on the home page.
