# Agent Instructions

## Coding Rules

- Do exactly what is asked. Do not add any abstractions unless explicitly requested.
- No unnecessary top-level functions, classes, or interfaces.
- Types are allowed, but use them carefully.
- If a function would benefit a section of code being edited, add it inline. The user will review changes incrementally and approve or reject.

## Tmux Rules

- Use `tmux` only for long-running tasks (for example: `pnpm dev`).
- Do not run long-running tasks directly in the active shell.
- By default, run dev in the `running-dev` window.
- If the `running-dev` window does not exist, create it and use it.
- If dev is broken or stuck, restart it in `running-dev` by sending `Ctrl-C` and running `pnpm dev` again.
