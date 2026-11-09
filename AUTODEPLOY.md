# SRU Performance Appraisal — automatic Apps Script update (autodeploy v1.3, same as ICTSRU/SOP)

After a **one-time setup (~15 min)**, updating the platform means only: **push to GitHub**. The Action pushes `apps-script/` to the
Apps Script project and moves the EXISTING web-app deployment to a new version — the `/exec` URL stays the same.

```
GitHub (apps-script/)  ──push──▶  GitHub Action (clasp)  ──▶  Apps Script project + new version (same /exec URL)
```

## One-time setup
| # | Step | Where |
|---|---|---|
| 1 | **Apps Script API → ON** (account that owns the project: m.elmahdy@sr.edu.sa) | script.google.com/home/usersettings |
| 2 | `npx @google/clasp@2.4.2 login` with the same account → copy the whole content of `~/.clasprc.json` | your computer |
| 3 | **Script ID**: Apps Script ▸ Project Settings ▸ IDs | Apps Script editor |
| 4 | **Deployment ID**: Deploy ▸ Manage deployments ▸ the active web app (`AKfycb…` — it is the part of your /exec URL after `/s/`) | Apps Script editor |
| 5 | Repo ▸ Settings ▸ Secrets and variables ▸ Actions ▸ 3 secrets: `CLASPRC_JSON` · `SCRIPT_ID` · `DEPLOYMENT_ID` | GitHub |
| 6 | Actions ▸ **Deploy Apps Script** ▸ Run workflow → green ✅ | GitHub |

The Script ID must belong to the project bound to the Sheet **ApprisAL — ICTD Performance Appraisal**.
Until the 3 secrets exist the workflow fails with a clear "Missing repository secret(s)" message — harmless.

Notes: edit code only in GitHub afterwards (the Action replaces the project's code files); `.clasprc.json` stays only in the secret;
rollback = Deploy ▸ Manage deployments ▸ ✏️ ▸ earlier version.
