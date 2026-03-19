# Sync this folder to aideazz-private-docs

These docs are for [aideazz-private-docs / docs/11-vibejobhunterhelpingdocs](https://github.com/ElenaRevicheva/aideazz-private-docs/tree/docs/docs/11-vibejobhunterhelpingdocs).

## Copy to private repo

```powershell
# If you have aideazz-private-docs cloned
Copy-Item -Path "D:\aideazz\ai-cofounders\cto-aipa\docs\11-vibejobhunterhelpingdocs\*" -Destination "D:\aideazz\aideazz-private-docs\docs\11-vibejobhunterhelpingdocs\" -Recurse -Force

cd D:\aideazz\aideazz-private-docs
git checkout docs
git add docs/11-vibejobhunterhelpingdocs/
git commit -m "docs: add VibeJob Hunter + OpenClaw workflow guide"
git push origin docs
```

## Or create folder first

```powershell
cd D:\aideazz\aideazz-private-docs
git checkout docs
mkdir -p docs/11-vibejobhunterhelpingdocs
Copy-Item -Path "D:\aideazz\ai-cofounders\cto-aipa\docs\11-vibejobhunterhelpingdocs\README.md" -Destination "docs\11-vibejobhunterhelpingdocs\"
git add docs/11-vibejobhunterhelpingdocs/
git commit -m "docs: add VibeJob Hunter + OpenClaw workflow guide"
git push origin docs
```
