# Ouvrir BellumAI dans Claude Code

Le code de l'export applicatif `(17)` est extrait à la racine du dépôt public `theohaddad92330-ship-it/design-white-glass-preview-`. La branche par défaut est `handoff/white-glass`. Les 17 captures, le Word illustré, l'atlas, les 19 principes de motion et le prompt sont dans `docs/white-glass-references/`. La prévisualisation White Glass, ses tests et son plan d'intégration sont dans `design/white-glass-preview/`. Aucun ZIP n'est à joindre à Claude.

## Dans Claude Code sur le web

1. Ouvre https://claude.ai/code et connecte GitHub si nécessaire. Autorise l'application Claude sur `theohaddad92330-ship-it/design-white-glass-preview-`.
2. Sélectionne le dépôt et sa branche `handoff/white-glass`, puis démarre en mode Plan.
3. Demande : « Lis `AGENTS.md`, `CLAUDE.md`, `docs/WHITE_GLASS_HANDOFF.md`, `docs/white-glass-references/00_LIRE_EN_PREMIER.md`, le Word illustré, l'atlas, les 19 principes et `04_PROMPT_SYSTEME_CLAUDE_CODE.md`. Inspecte les 17 images originales et le code existant. Cartographie exigences → composants → données → tests, puis propose les modifications par page. White Glass uniquement. »
4. Pour implémenter, crée une branche de travail depuis `handoff/white-glass`, conserve le code produit existant et propose une pull request avec les preuves de test.

## En local

Clone le dépôt, sélectionne `handoff/white-glass`, entre dans son dossier et lance `claude`. Le prompt ci-dessus s'applique aussi en local.

## Points à vérifier

Ce dépôt public a été créé à partir de l'archive fournie, pas synchronisé avec le dépôt Git historique de BellumAI. Compare les dates et les changements avant toute fusion vers la production. La prévisualisation est statique : ses données locales, ses effets et ses boutons ne démontrent pas un raccordement aux CRM, ATS, e-mails et agendas. Le dépôt contient aussi des données de contact de l'export ; son exposition publique a été acceptée provisoirement par Théo, qui prévoit de le rendre privé après le travail de Claude. Vérifie les accès et la conservation avant usage réel.
