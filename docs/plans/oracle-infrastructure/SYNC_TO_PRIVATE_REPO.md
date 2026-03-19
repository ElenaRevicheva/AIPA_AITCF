# Sync this folder to aideazz-private-docs

These docs are the **source of truth** for [aideazz-private-docs / docs/plans/oracle-infrastructure](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/plans/oracle-infrastructure).

## Option A: You have aideazz-private-docs cloned

From your machine (e.g. `D:\aideazz\`):

```powershell
# Copy from cto-aipa into private-docs (adjust paths if needed)
Copy-Item -Path "D:\aideazz\ai-cofounders\cto-aipa\docs\plans\oracle-infrastructure\*" -Destination "D:\aideazz\aideazz-private-docs\docs\plans\oracle-infrastructure\" -Recurse -Force

cd D:\aideazz\aideazz-private-docs
git checkout docs
git add docs/plans/oracle-infrastructure/
git status
git commit -m "docs(oracle): update oracle-infrastructure with all 8 agents and resilience plan"
git push origin docs
```

## Option B: Clone private-docs, then copy

```powershell
cd D:\aideazz
git clone https://github.com/ElenaRevicheva/aideazz-private-docs.git
cd aideazz-private-docs
git checkout docs
mkdir -p docs/plans/oracle-infrastructure
Copy-Item -Path "..\ai-cofounders\cto-aipa\docs\plans\oracle-infrastructure\README.md" -Destination "docs\plans\oracle-infrastructure\"
Copy-Item -Path "..\ai-cofounders\cto-aipa\docs\plans\oracle-infrastructure\OVERVIEW.md" -Destination "docs\plans\oracle-infrastructure\"
Copy-Item -Path "..\ai-cofounders\cto-aipa\docs\plans\oracle-infrastructure\RESILIENCE.md" -Destination "docs\plans\oracle-infrastructure\"
git add docs/plans/oracle-infrastructure/
git commit -m "docs(oracle): update oracle-infrastructure with all 8 agents and resilience plan"
git push origin docs
```

**Note:** Do not copy `SYNC_TO_PRIVATE_REPO.md` into the private repo unless you want it there; it’s only for the cto-aipa repo.
