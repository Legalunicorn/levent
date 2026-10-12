# Gather

A mobile-friendly event guest tracker for iPhone Safari. Buildless HTML, CSS and JavaScript; no accounts, uploads, analytics or backend. Excel import uses a bundled copy of SheetJS; no installation is needed.

## Run locally

Install Node.js, then run `npm start` and open http://127.0.0.1:4173. Run `npm test` for the data-handling tests. No dependency installation or build step is needed.

## Host on GitHub Pages

1. Push this repository to GitHub.
2. Open the repository **Settings → Pages**.
3. Choose **Deploy from a branch**, branch **main**, folder **/docs**, then **Save**.
4. Wait for the Pages deployment to complete. The website is at `https://Legalunicorn.github.io/levent/` once deployed.

From this repository folder, the initial push commands are:

```powershell
git add .gitignore package.json README.md docs scripts tests
git commit -m "Build private local event guest tracker"
git push -u origin main
```

You can configure Pages with the UI above or, after `gh auth login`, run:

```powershell
gh api --method POST repos/Legalunicorn/levent/pages -f "source[branch]=main" -f "source[path]=/docs"
```

If Pages already exists, use `--method PUT` for the same command. GitHub runs the Pages deployment automatically after you enable it; you do not need a custom Actions workflow.

All assets use relative paths, so the app works under a repository subpath. Only `docs/` is the public website. See [GitHub’s publishing source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## iPhone workflow

1. Receive the website URL and the private Excel (.xlsx) or CSV file separately. Save the file to **Files**.
2. Open the website in Safari and tap **Import guest list**. Choose the Excel or CSV file.
3. Search by name, open a guest card, and update arrival, meals, parking, reimbursement or notes. Each change saves locally; check the saving indicator.
   Use **Add guest** for someone new; only their name is required. Their detail screen opens next for meal and arrival choices. In **Summary**, tap **View guests** under any starter or main to see the names and companies of everyone who selected it.
4. Open **Backup & data → Export backup**. Save the JSON download to Files. Export at least before and after the event.
5. To recover or move devices, open the website and choose **Restore backup** with that JSON file. It restores records, notes, stable IDs and meal limits.
6. **Export CSV** produces an Excel-friendly copy of the current records, including notes and IDs. Formula-like text is escaped for spreadsheet safety; Gather’s encoding marker supports lossless re-import. Use JSON for full backups including meal limits.

Use the same device, browser and URL. Data does not sync between devices, browsers, origins or paths. Safari website-data clearing, private browsing or storage eviction can remove saved records. Keep backups private. The page must first load with internet access; this version does not promise offline reopening.

## Privacy and imports

The public website starts empty. Guest data is parsed and stored entirely in the browser, never sent to a server or placed in URLs. The app loads no third-party resources and its Content Security Policy blocks network connections from scripts. Guest information is visible to anyone who can access this browser profile; local storage is not an encrypted vault.

**Never add real guest data to this repository**, including fixtures, screenshots, backups, source workbooks or deployment files. `.gitignore` excludes CSV and Excel files as an extra safeguard. The private converted guest CSV is delivered separately outside the repository. No source workbook or private CSV is required to run or deploy the app.

Excel import finds the guest headers in the first 100 rows of any worksheet. Sheet names, column order and guest counts can change. Extra columns are ignored; missing optional fields stay blank. A Name or Guest name heading is required. Case, spacing and punctuation differences in headers and known meal/status responses are accepted. Unknown meal/status values produce an error identifying the sheet and row, without replacing saved data. All data is read locally. The Excel library is included in `docs/vendor/` with its license; no external service is contacted.

CSV requires these original headers: `Name`, `Company`, `Title`, `Email`, `Attendance`, `Preferred Lunch Starter`, `Preferred Lunch Main`, `Carpark Coupon?`, `Taxi/Grab Reimbursement?`. `Notes` and `Guest ID` are optional. Contact values are preserved as text, including non-email values. Blank responses stay blank. Unknown status or meal values, missing headers and malformed files are rejected before replacing records. Imports have a 10 MB limit.

Meal quantities show remaining portions. All assigned meals count regardless of attendance. Exhausted dishes remain visible in red and cannot be newly assigned; existing selections can be kept or cleared. Imported over-allocation is preserved and flagged in the summary. Excel or CSV replacement resets limits to hotel defaults; JSON restore uses the allocations in the backup.

## Files

- `docs/`: public static app.
- `tests/`: data logic tests using generated synthetic records only.
- `scripts/serve.mjs`: local preview server serving only `docs/`.

Target: current iPhone Safari and modern desktop browsers, with native accessible modal dialogs, large touch targets and no horizontal grid. Use a single active editing tab; successful changes in another tab refresh this tab.
