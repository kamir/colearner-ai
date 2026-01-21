# CoLearner Project Checklist (One Page)

Use this checklist to onboard yourself (or a teammate) onto any repository with CoLearner.

## Before You Start
- [ ] Install CoLearner (`npm install -g colearner-ai` or `npx colearner-ai`).
- [ ] `cd` into the repo you want to learn.
- [ ] Optional: set `COLEARNER_SCOPE_ROOT` to the repo path.
- [ ] Optional: set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`.

## Kickoff (5–10 minutes)
- [ ] Run `colearner-ai init`.
- [ ] Run `colearner-ai learn "ship first PR"`.
- [ ] Confirm `.colearner/learning.json` and `.colearner/plan.md` were created.
- [ ] Review the final step: safe task + PR-sized exercise + definition of done.

Sample output:
```text
branch_guard: switched to colearner/onboarding-20260121-214152
Repo map complete -> learning plan created
plan_path: .colearner/plan.md
[
  {
    "id": "step-1",
    "topic": "ship first PR",
    "status": "next"
  },
  {
    "id": "step-first-pr",
    "topic": "first contribution | pick one safe task | open one PR-sized exercise | definition of done | where to ask for help: CONTRIBUTING.md, README.md: teams",
    "status": "pending"
  }
]
```

## Learn the Critical Path
- [ ] `colearner-ai explain "<core flow>"` (e.g., auth flow, ingestion).
- [ ] `colearner-ai practice "<module>"` for a small hands-on task.
- [ ] Capture questions or unknowns as you go.

## First Contribution
- [ ] Choose the smallest safe task suggested by the plan.
- [ ] Verify the definition of done and tests to run.
- [ ] Create a branch if needed (`colearner/*` recommended).
- [ ] Implement and run tests.
- [ ] Open a PR with a short summary + evidence.

## If You Need Help
- [ ] Check `CONTRIBUTING.md` and `README.md`.
- [ ] Ask in the repo’s official channel (Slack/Discord/email).
- [ ] Add questions to your PR or issue.

## Keep It Updated
- [ ] Pull latest CoLearner updates or reinstall `colearner-ai@latest`.
- [ ] Re-run `learn` when goals change.
