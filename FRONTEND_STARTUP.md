# Start the Team Fire frontend locally

## Purpose and scope

Use this walkthrough to start and check the **sample-data Next.js frontend** on a developer's computer. It does not start a backend or connect to Supabase.

Use it when you want to explore or work on the UI. Do not use it as a production deployment, authentication, or database setup procedure.

## Preconditions and tools

- Windows PowerShell and access to this repository.
- Node.js 24 and Corepack available on `PATH`.
- Network access for the first dependency installation, unless dependencies are already installed.
- A web browser. No account, API key, or environment file is required for the demo.

The source of truth for commands and scope is [package.json](package.json), [README.md](README.md), and the team's [AGENTS.md](AGENTS.md).

## Safety and impact

The commands below affect this checkout and browser only. Dependency installation creates local files; **Reset demo** discards browser-local sample changes. Check the reported URL and errors before changing anything. This procedure makes no production or backend changes.

## Read-only checks

1. Open PowerShell and enter the frontend repository:

   ```powershell
   Set-Location -LiteralPath 'D:\Fast work\7th Semester\AGILE\Project\agile-project-team-fire-main'
   ```

   Check: `Get-Item package.json` finds the package file. If it does not, stop and correct the path before running npm.

2. Check the tool versions:

   ```powershell
   node --version
   corepack.cmd --version
   corepack.cmd pnpm --version
   ```

   Check: Node reports version 24, Corepack is available, and pnpm reports the version pinned in `package.json`. If a command is missing, install or repair the Node.js 24/Corepack toolchain before continuing.

## Start and verify

1. Install dependencies if this checkout does not already have them:

   ```powershell
   corepack.cmd pnpm install --frozen-lockfile
   ```

   Check: the command exits successfully and `node_modules` exists. The frozen lockfile should not change; inspect any unexpected `pnpm-lock.yaml` change before committing it. If installation fails, stop and read the exact pnpm error before retrying.

2. Start the local development server:

   ```powershell
   corepack.cmd pnpm dev
   ```

   Check: the terminal prints a local URL and a ready message. Leave this terminal open. If port 3000 is occupied, Next.js may print another port; use the URL it reports.

3. Open the reported URL with `/prototype` in a browser, usually [http://localhost:3000/prototype](http://localhost:3000/prototype). Select **Explore demo**.

   Check: the Projects page opens and shows the sample Team Fire project. Open it and visit **Backlog**, **Sprint planning**, **Board**, and **Analytics**. The pages should render without an error overlay.

4. After checking the pages, stop the dev server with **Ctrl+C**. If you changed frontend code, run these checks in the repository:

   ```powershell
   corepack.cmd pnpm typecheck
   corepack.cmd pnpm test
   corepack.cmd pnpm build
   ```

   Check: all three commands exit successfully. Stop the dev server before the build because both commands use Next.js build files. The build does not deploy anything.

## Symptoms and initial triage

First confirm the repository path, Node/Corepack/pnpm versions, dev-server output, and the exact browser URL. The observed error determines the next step:

- **`node` or `corepack.cmd` is not recognized:** the required tool is unavailable. Stop and repair the Node.js 24/Corepack installation or `PATH`, then repeat the version checks.
- **Dependency installation fails:** check the pnpm error and local network/package access. Do not move on until dependencies install successfully.
- **Port 3000 is in use:** open the alternate URL printed by Next.js, or stop the other local process and restart the dev server if a fixed port is required.
- **The browser does not show the entry screen:** confirm that the dev terminal still reports a ready server, then open its exact URL and check the terminal and browser error messages.
- **The demo looks different from the seed:** this browser may have saved earlier sample changes. Use **Reset demo** in the sidebar only if you intend to discard those browser-local changes, then verify the sample project returns.

## Escalation and evidence

If the observed behavior does not match these cases, or a fix still fails, stop and share the exact command, terminal output, browser URL, and error text with the frontend team through your team's normal support channel. Include the Node/Corepack/pnpm versions and whether the error occurs before or after **Explore demo**. Remove any personal or secret values before sharing output.

## Stop, recovery, and completion

- To stop the server, return to its terminal and press **Ctrl+C**. Verify the process exits and the local URL no longer serves the app.
- If a startup attempt leaves the UI unusable, stop the server, correct the reported error, and restart `corepack.cmd pnpm dev`. Do not delete project files or browser data as a first troubleshooting step.
- The walkthrough is complete when the Projects page and the main backlog → planning → board → analytics path open locally, and the dev server can be stopped cleanly.
