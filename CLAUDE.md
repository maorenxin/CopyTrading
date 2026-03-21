# CLAUDE.md

## Git 工作流
- 每次修改完成后自动 commit 并 push，不需要跟用户确认
- push 之前必须先 `git pull --rebase origin master`，因为线上有 daily-update 自动提交
