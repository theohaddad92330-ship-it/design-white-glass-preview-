# BellumAI Master Kit — Mode d'emploi

## Documentation opérationnelle

- **Runbook central** — lancement local, déploiement production, accès critiques, comptes, clés API et services tiers : [docs/runbook.md](docs/runbook.md)

## Ce qu'il y a dans ce dossier

### CLAUDE.md

Le fichier principal. Claude Code le lit automatiquement à chaque session — **et le paie à chaque
tour**, d'où un plafond dur de 150 k caractères imposé par l'outil. Il ne porte donc que ce qui doit
être sous les yeux en permanence : stack, craft rules, code rules, design rules, la table des variables
d'environnement et la **Doctrine** (les arbitrages qui ne se re-litiguent pas).

Le reste vit dans `agent_docs/`, chargé à la demande :

- **chantiers-livres.md** — le registre de ce qui est LIVRÉ (~30 chantiers, chacun avec son tracker et ses refus assumés) ;
- **env-reference.md** — la forme exacte de chaque clé, la raison de chaque défaut.

Ne pas modifier `CLAUDE.md` sauf pour ajouter une règle transverse ou un nom de clé.
Un récit de chantier va dans `agent_docs/`, jamais ici.

### agent_docs/ (11 fichiers)

Documentation détaillée que Claude Code consulte quand il en a besoin :

- **prd.md** — Le produit complet (pages, modules, pricing, UX)
- **architecture.md** — Architecture nouvelle stack (React + NestJS + FastAPI + BullMQ)
- **prompts.md** — Les 7 system prompts Claude (3 existants + 4 nouveaux)
- **pipeline.md** — Le flux complet d'une analyse étape par étape
- **database_schema.md** — Les 7 tables Supabase avec toutes les colonnes
- **apis.md** — Toutes les APIs (Apollo, Pappers, Brave, Firecrawl, Claude, Stripe)
- **rag.md** — Architecture RAG (pgvector + LangChain + 3 couches de contenu)
- **design.md** — Design system dark mode (couleurs, composants, phrases BellumAI)
- **security.md** — Checklist sécurité et RGPD
- **backlog.md** — 12 bugs + 38 features classés par priorité
- **plan.md** — Plan d'exécution avec les prompts EXACTS à donner à Claude Code

### .claude/skills/ (4 skills custom)

- **bellum-workflow** — TDD, branching, impact check (Craftsmanship)
- **nestjs-patterns** — Modules, guards, DTOs, Supabase (patterns NestJS)
- **fastapi-patterns** — Endpoints, Claude API, parsing robuste (patterns Python)
- **frontend-dark** — Design system dark mode BellumAI

### .claude/commands/ (3 slash commands)

- **/impact-check** — Analyse l'impact avant chaque modification
- **/test-all** — Lance tous les tests et rapporte les résultats
- **/new-feature** — Workflow complet pour ajouter une feature (branche → TDD → test → commit)

### .claude/settings.json

Permissions et hooks automatiques (formatage auto après chaque édition).

## Comment l'utiliser

1. Crée un nouveau dossier pour le projet : `mkdir bellum-ai && cd bellum-ai`
2. Copie TOUT le contenu de ce kit dans ce dossier
3. Lance Claude Code : `claude`
4. Donne-lui le premier prompt du fichier agent_docs/plan.md (Bloc 1, Prompt 1.1)
5. Suis le plan bloc par bloc

## Skills à installer EN PLUS (depuis Internet)

```bash
npx skills add anthropics/claude-code --skill frontend-design
npx skills add anthropics/claude-code --skill simplify
```

Puis télécharger et mettre dans .claude/skills/ :

- Impeccable (impeccable.style)
- Emil Kowalski (emilkowal.ski)
- shadcn/ui (ui.shadcn.com/docs/skills)
- interaction-design, interface-design, web-design-guidelines (ui-skills.com)
