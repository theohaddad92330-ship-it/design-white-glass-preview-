# Brief — lot J (vague 3) : outils internes, profil repris, Laura et le CRM (#4971, #5027.2, #5014.2)

Plafond : 300 tours (à 240 : commit du vert, push, rapport, stop).
Conception : migration additive + contrat partagé neuf (`packages/contracts`) pour #4971.
Branche : `claude/lot-4962-j` (part de origin/main, porte ce brief). PREMIER geste : `git merge origin/claude/lot-4962-g origin/claude/lot-4962-h` (lots non encore fusionnés sur lesquels tu construis ; lis leurs rapports `docs/briefs/claude-lot-4962-{g,h}-rapport.md`).
Périmètre : apps/web/src/_, apps/api/src/_, apps/api/migrations/_, apps/api/src/database/_, packages/contracts/src/_, packages/i18n/_, apps/ia/app/_, apps/ia/tests/_, supabase/migrations/_, docs/briefs/_

## Contrat validé par Louis (QCM 31/10 13:55)

### #4971 — nommer ses outils internes à l'onboarding

- Compris : à l'étape outillage, un client qui a un CRM/ATS/ERP MAISON ne peut pas le nommer (échelle de présence sans saisie, `outillage.ts:36-47`, contrat `answers-outillage.ts:46`).
- Je fais : une clé de réponse NEUVE `tooling_internal_names` (liste de noms libres, bornée en longueur) : contrat dans `packages/contracts` → colonne ADDITIVE nullable dans `esn_profiles` (migration ajout seulement — trouve la convention de migration du dépôt ; contrainte/colonne posée AVANT le code qui l'écrit, gardes GA-11/12) → `esn-answers.mapper.ts` → champ « autre / interne : nom » à l'étape outillage (modèle : `outils-invitation.ts:25` `allowOther: true`). i18n fr+en.
- #4971.2 : un outil interne nommé n'est JAMAIS affiché comme « connecté » (`resolveToolingChoices` ne confirme que les connexions réelles — test qui le prouve).
- Je ne fais pas : aucun connecteur, aucune pastille « branché ».

### #5027.2 — reprendre le profil demandé

- Lot G a livré « J'ai déjà un compte en tête » (`SituationPicker.tsx`) → `/search?q=<nom>`. Je fais : le PROFIL demandé (ex. « Product Owner », lu dans `suggestion_criteria` ou ce que l'accueil a saisi) voyage aussi et pré-remplit `/search` (paramètre d'URL validé par le schéma de route, jamais injecté brut). Rien posé si absent.

### #5014.2 — Laura distingue « CRM connecté, rien importé » de « aucun CRM »

- Lot H : `importedCount == 0` ⇒ `crm_import_note` (« pas importé ») même si un CRM est connecté en synchro. Je fais : CRM connecté + 0 import ⇒ « ton CRM est connecté, aucune fiche importée encore » ; aucun CRM ⇒ la phrase actuelle. La source de « connecté » = l'état de connexion existant (`context_transparency.py:373`, ne pas recoder). Fournisseur JAMAIS nommé.

## Droits

#4971 écrit dans le profil d'ESN : même règle que les autres réponses d'onboarding (l'utilisateur de l'espace, filtré `workspace_id`). REFUS : écrire `tooling_internal_names` sur un autre espace → test API qui le prouve. Aucune route ni menu neuf.

## Je défais

Rien. `allowOther` étendu à l'étape outillage = ajout.

## Règles

TDD (rouge d'abord) ; tests ciblés seulement (≤ 5 specs par point + gardes `src/architecture` concernées + `tsc -p` du paquet touché ; pytest ciblé) ; construire `packages/{contracts,utils,errors,http,observable}` si vitest l'exige ; jamais suite complète, check-types racine ni build ; jamais .github/ ni .claude/ ; trace `// #<n>.<k>` au comportement ; semis démo : classer la nouveauté dans `demo-coverage.ts` (seedée ou vide à dessein AVEC raison) ; push après chaque point vert ; pas de PR.

## Rapport

`docs/briefs/claude-lot-4962-j-rapport.md` (≤ 15 lignes : SHA, livré fichier:ligne, migration (nom du fichier), tests + résultat, hors périmètre, questions). Commit + push. STOP.
