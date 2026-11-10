# 🏭 demo-run summary

> **Updated 12:00** · ▶ 1 working · 🟡 1 waiting · 🔴 1 need you · ⏸ 1 paused · ✅ 1 done · 🖥 PC calm (62% idle) · 💾 33 GB free

## 🙋 Needs you

| # | | What | How | When |
|---|:-:|---|---|---|
| 1 | 🔴🔁 | Reload the plugin | Run `/reload-plugins` in your own chat | now |
| 2 | 🟡🖥 | Run the setup script | `./setup.sh \| tee setup.log`, in your terminal | after the merge |

## 🎯 Goal

| | Goal |
|:-:|---|
| ✅ | Conductor build merged on master |
| ⬜ | Setup installs my-app in one run, merged |
| ⬜ | Every install flag named with its source |

## 🔭 Current state

| Who | State |
|---|---|
| **Implementer: setup build** | Rewriting the setup screens; the conductor build merged earlier. Next come a smoke test and its check. |
| **QA verifier: check setup build** | Waits for the ready sha. Next come the gate and a verdict. |
| **Main chat** | Keeps the researcher paused until the build lands |

## 🤖 Workers

| | Worker | Doing now | Next |
|:-:|---|---|---|
| 🟡 | **QA verifier: check setup build** | Waiting on the ready sha | Gate and verdict |
| ▶ | **Implementer: setup build** | Rewriting the setup screens | Smoke test, then check |
| ⏸ | **Researcher: install flags** | Paused until the build lands | Answer the flag question |
| ✅ | **Implementer: conductor build** | Done · 07ab1b7 on master | — |

## 🗺 Plan

| Step | Who | Status |
|---|---|:-:|
| Conductor build | Implementer: conductor build | ✅ |
| **Setup build** | Implementer: setup build | ▶ |
| Setup check | QA verifier: check setup build | ⏳ |
| Install flags | Researcher: install flags | ⏸ |
| Silent install (dropped: not needed) | — | ✖ |

## 🧩 Still open

| What | Why not fixed | Who fixes it | Next step |
|---|---|---|---|
| Setup script fails on Linux | Cannot test here: no Linux machine | You | Run `./setup.sh` on a Linux box and send the log |

## 🛡 Checks

| | Check | State |
|:-:|---|---|
| ✅ | Git | **my-app** master, clean |
| 🟡 | Git | **dotfiles** branch `setup-ui` 9f95022, merges after the verdict |
| ✅ | PC load | calm · CPU 62% idle |
| ✅ | Disk | 33 GB free |
