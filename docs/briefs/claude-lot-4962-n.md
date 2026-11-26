# Brief — lot N : intercontrats, une séquence MANUELLE par compte depuis le Reverse Market (#5029)

Plafond : 300 tours (à 240 : commit du vert, push, rapport, stop).
Conception : migration additive `consultant_id` sur les séquences + levée datée d'un NO-GO.
Branche : `claude/lot-4962-n` (part de origin/main, porte ce brief et le diagnostic `docs/briefs/claude-diag-5029.md` — LIS-le en entier, il donne fichiers et lignes).
Périmètre : apps/api/src/migrations/_, apps/api/src/database/entities/_, apps/api/src/modules/outreach/_, apps/api/src/modules/demo/_, packages/contracts/src/_, apps/web/src/_, packages/i18n/_, changes/_, docs/briefs/*

## Contrat validé par Louis (QCM 31/10 15:55)

- Compris : un commercial a un consultant en intercontrat et veut proposer ce profil, compte par compte, avec un mail relu à chaque fois — jamais un mailing.
- 5029.1 : sur le Reverse Market d'un consultant (`ReverseMarketPage.tsx`, actions par compte `:671-690`), un geste par compte « Proposer ce profil » : choix d'UN contact du compte, puis création d'UNE séquence via `POST outreach/sequences/from-template/:id` (unitaire — JAMAIS `/audience`), brouillon nourri du contexte du compte et du profil ANONYMISÉ (playbook F `bench_consultant`).
- Lien : colonne nullable ADDITIVE `consultant_id` sur la table des séquences (migration ajout seulement, horodatage > max de la série, cf. `apps/api/src/migrations/README.md`) ; le Reverse Market montre « déjà proposé à ce compte » quand une séquence existe pour ce consultant et ce compte (évite de repousser le même profil).
- 5029.2 : chaque mail relu et validé à la main ; séquence `bench_consultant` TOUJOURS manuelle, même si l'espace a signé le mandat d'envoi automatique (#4016 L5 ne s'applique pas ici) — test qui le prouve.
- 5029.3 : un compte et un contact par lancement, aucune sélection multiple.
- Démo (craft n°9) : un consultant démo en intercontrat avec une séquence proposée, ou entrée « vide à dessein » AVEC raison dans `demo-coverage.ts`.

## Je défais

- Le NO-GO « Préparer un push profil » du Reverse Market (`agent_docs/chantiers-livres.md` ~2830) : levé par Louis le 31/10, SEULEMENT sur geste explicite par compte, profil anonymisé, mail validé. Écrire « revient sur » + date dans le commit et une ligne datée dans `chantiers-livres.md` si dans le périmètre (sinon au rapport).
- Garde : #4050 (envoi groupé de contacts) n'est pas réutilisé ; c74/c131 (audience) hors de ce parcours.

## Droits

Créer une séquence = utilisateur de l'espace (filtre `workspace_id` existant de outreach). REFUS : créer une séquence pour un consultant ou un compte d'un AUTRE espace → 403/404, test API ; `consultant_id` d'un autre espace refusé. Aucun menu neuf ; le bouton vit dans l'écran Reverse Market existant.

## Règles

TDD (rouge d'abord) ; tests ciblés seulement (≤ 5 specs par point + gardes `src/architecture` concernées + `tsc -p` du paquet) ; construire `packages/{contracts,utils,errors,http,observable}` si vitest l'exige ; jamais suite complète ni build ; jamais .github/ ni .claude/ ; trace `// #5029.<k>` ; i18n fr+en ; pas de PR. Commitlint : scopes web, api, contracts, tooling… ; pied ≤ 100 caractères ; si un contrôle doc↔code bloque, trailer `Doc-inchangée: <fiche> — <raison>`.
PUSH : `git push --no-verify -u origin HEAD:refs/heads/claude/lot-4962-n` ; si refusé par le classificateur, push normal en arrière-plan (hook ci:local long) et le dire au rapport. Jamais de force-push.

## Rapport

`docs/briefs/claude-lot-4962-n-rapport.md` (≤ 15 lignes : SHA, livré fichier:ligne, migration, tests + résultat, questions). Commit + push. STOP.
