# Handoff — publish the Manukora submission repo

Manukora requires **one GitHub repository link**. This agent cannot create
`ElenaRevicheva/manukora-sop-brief` (GitHub app lacks `createRepository`).

## One command (as Elena)

```bash
cd manukora-sop-brief
./scripts/publish_submission_repo.sh
```

That clones `docs/evidence/manukora-sop-brief.bundle` (clean 4-commit history)
and pushes it to `https://github.com/ElenaRevicheva/manukora-sop-brief`.

## Manual

```bash
git clone manukora-sop-brief/docs/evidence/manukora-sop-brief.bundle ~/manukora-sop-brief
cd ~/manukora-sop-brief
gh repo create ElenaRevicheva/manukora-sop-brief --public \
  --description "Manukora S&OP briefing automation — AI Automation Engineer practical brief" \
  --source=. --remote=origin --push
```

## Optional before sending the link

On Oracle (keys already present), regenerate with a live model:

```bash
cd ~/manukora-sop-brief
export OPENAI_API_KEY=...   # or use keys already in the environment
python3 -m src.main --prefer openai
python3 -m unittest discover -s tests -v
git add output && git commit -m "chore: regenerate briefing with OpenAI narration"
git push
```

Then email Manukora the repo URL.
