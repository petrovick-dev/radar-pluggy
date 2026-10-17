# Skills do Projeto

## 📁 Onde moram

Todas as skills do projeto moram em `.agents/skills/`, que Codex, Gemini, opencode,
Cursor e Antigravity leem direto. O Claude Code só lê `.claude/skills/`, por isso lá
existe um symlink relativo por skill (`../../.agents/skills/<nome>`); caminhos
antigos como `.claude/skills/arquitetura-camadas/...` continuam válidos através dele.

Skill nova: criar a pasta em `.agents/skills/` e o link em `.claude/skills/`.

As `openspec-*` são geradas pelo `openspec update`, que grava através dos links.
