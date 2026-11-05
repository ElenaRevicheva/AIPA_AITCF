# How to clear **Select at least one delivery taskset**

The red error is the form, not a missing PDF. **Artifacts** (PDF / zip
upload on the offer page) is a different field. Dropping a file there
does **not** count as a delivery taskset. The picker is empty because
the org has no HUD **taskset** yet. Create one from this folder, then
come back.

Keep the offer tab open. Numbers stay: Fixed fee 0, Task count 1, Rate
600. Assumptions stay as pasted.

## 1. Get the zip

The packed file is committed at:

    docs/selling/harbor/nl2repo-fail-closed-gate.zip

**This repo is private**, so a `raw.githubusercontent.com` link returns
404. Open the file page in the browser where you are already logged into
GitHub and click **Download raw file**:

    https://github.com/ElenaRevicheva/AIPA_AITCF/blob/cursor/hud-vendor-license-1c49/docs/selling/harbor/nl2repo-fail-closed-gate.zip

5,687 bytes, 8 files. Save it to Desktop. Do **not** zip AIPA_AITCF. Do
**not** zip the $74,851 listing.

Fallback, if the browser download misbehaves — from the local clone, pull
just this folder off the branch (additive; it touches nothing on `main`):

    git fetch origin cursor/hud-vendor-license-1c49
    git checkout origin/cursor/hud-vendor-license-1c49 -- docs/selling/harbor

The zip is then on disk at the path above. To rebuild it from the files
instead, in the repo root:

    Compress-Archive -Path docs\selling\harbor\nl2repo-fail-closed-gate -DestinationPath $env:USERPROFILE\Desktop\nl2repo-fail-closed-gate.zip

The zip must contain `nl2repo-fail-closed-gate/task.toml` (plus
`instruction.md`, `environment/`, `tests/`, `solution/`).

## 2. Upload it as inventory — a **taskset**, not the eight-repo listing

New tab. Sidebar **My listings** (or homepage **Add inventory** /
**Upload a zip**).

Create a **new** listing. Asset type must be **taskset** (Harbor /
Environment + taskset). Title:

    NL2Repo sample — fail-closed number gate

Upload `nl2repo-fail-closed-gate.zip`. Do **not** attach GitHub repos.
Do **not** attach the existing listing
`e568b5c8-2f86-41dc-8338-5e9778cd3443`.

Wait until it appears on the team. An environment build may spin. That
is the QC box, not a hang.

If the create-listing form only offers GitHub repositories and has no
taskset / Harbor type, **stop**. Screenshot that page. Do not force the
eight repos in.

## 3. Back to the offer

Refresh the offer page. **Delivery tasksets** should list this sample.
Select it. The red line should go. Submit offer.

Do not put this zip in **Artifacts**. That field is optional and is not
the picker.
