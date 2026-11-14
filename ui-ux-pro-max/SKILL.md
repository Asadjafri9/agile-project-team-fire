---
name: ui-ux-pro-max
description: Use when designing or reviewing a web, mobile, or desktop interface and a searchable catalog of UI patterns, palettes, typography, charts, UX guidance, or stack-specific practices would improve the result. Skip for routine code changes without a design decision.
---

# UI/UX Pro Max

This skill provides a local, searchable design catalog. Its recommendations are starting points: match them to the user's product, established design system, platform conventions, accessibility needs, and repository constraints. The catalog is not a product specification or a reason to change the user's chosen stack.

## Locate and run the search tool

Resolve `scripts/search.py` relative to this `SKILL.md`; its data files are resolved relative to the script. The examples below assume the shell is in this skill directory. From another directory, pass the absolute path to `scripts/search.py`. The scripts use Python 3's standard library and need no network access or dependency installation.

On Windows, run `python -X utf8 scripts/search.py ...`. On macOS or Linux, run `python3 scripts/search.py ...`. If Python is unavailable, use the CSV files in `data/` directly; do not install system software without the user's request.

Check `python scripts/search.py --help` for the available domains, stacks, and flags before using an unfamiliar option. Current domains include `product`, `style`, `color`, `typography`, `chart`, `ux`, `web`, and `react`. Stack searches include `nextjs`, `react`, `html-tailwind`, `shadcn`, `react-native`, `flutter`, and desktop stacks, among others.

## Choose the amount of research

1. Determine the product, audience, main user task, platform, and implementation stack from the request and repository. Do not assume a mobile or React Native project.
2. For a new interface or substantial redesign, generate one design-system recommendation using a query that combines product type, audience, and desired tone. Example: `python scripts/search.py "private Scrum project management dashboard dense clear" --design-system -p "Team Fire" --format markdown`.
3. For a component, chart, accessibility review, or narrow fix, search only the relevant domain. Examples: `python scripts/search.py "burndown velocity cumulative flow" --domain chart` and `python scripts/search.py "keyboard navigation focus modal" --domain ux`.
4. When implementation details depend on a framework, search its stack guidance. Example: `python scripts/search.py "dashboard navigation accessible charts" --stack nextjs`.
5. If a result is a poor match, refine the query or inspect a narrower domain. Do not copy an irrelevant template or treat a retrieved anti-pattern as a project requirement.

Use the catalog to make concrete decisions about hierarchy, information density, layout, typography, color, chart choice, interaction states, and responsive behavior. Keep the user's content and required workflows primary. Apply platform-appropriate accessibility practices: labelled controls, visible keyboard focus, readable contrast, non-color status cues, reduced-motion support where motion is used, and usable chart data alternatives.

## Persist a design system only when useful

Searches are read-only by default. `--persist` writes `design-system/MASTER.md` and optional page overrides. Use it only when the user asks for a reusable design-system artifact or the project work clearly needs one. Always pass `--output-dir` pointing to the active project; do not let the command write into whichever directory happens to be current.

Example, with an explicit project destination:

```text
python <absolute-skill-root>/scripts/search.py "private Scrum project management dashboard" --design-system --persist --output-dir <absolute-project-root> -p "Team Fire" --page dashboard
```

Review generated recommendations before applying them. Existing project tokens and explicit user preferences take precedence. Do not persist a design system merely to answer a design question.

## Validate the UI work

Review the actual result at the relevant desktop and mobile widths. Check content hierarchy, overflow, focus order, keyboard operation, empty/loading/error states, and chart labels or tables when charts are present. Use the stack-specific guidance only where it applies. The catalog's data and example snippets may be broader than the current project, so verify any recommendation against the implemented interface.
