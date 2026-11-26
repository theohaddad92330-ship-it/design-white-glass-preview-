Conception : contrat mission partagé (nouveaux risques, champ satisfaction) et droits finance.

Tu es un écrivain (lot borné, puis STOP). Dépôt Bellum-AI/belllum-monorepo. Crée la branche `claude/vieilles-l15-missions` depuis origin/main et ne pousse QUE sur elle (jamais main, aucune PR : le fil l'ouvre).

Plafond : 300 tours. À 80 % : commit de ce qui est vert, rapport, push, stop.

Contrat VALIDÉ par Louis (31/10/2026, QCM) — c'est ta consigne, recopiée ci-dessous. AVANT de coder un point : `git grep` pour vérifier qu'il n'est pas déjà livré sur origin/main (un point déjà là = « déjà là » au rapport avec fichier:ligne, pas de recode). Chercher l'APPELANT, pas seulement la fonction.

Arbitrages de Louis qui s'appliquent (31/10) :

- #2176.13 : axe « Expérience comparable » VISIBLE mais poids 0. #2157.38-.40 : doublons campagne/owner/action seulement AFFICHÉS dans Mes cibles. #2843.25 : niveau 0-1 par défaut pour les NOUVELLES routines seulement. #2102.45 : rappel T-1 = routine configurable. #2102.4 : importance d'un conflit = type de réunion (client/interne). #2107.25 : le blocage garde son lien vers /pilotage/pipe#parcours. #2408.3 « menace sur la relation » = satisfaction basse + aucun contact depuis N jours ; #2408.20 « consultant non sécurisé » = fin de mission < N jours sans renouvellement ni placement. #2408.2/.66/.67/.70 ÉCARTÉS (loi 4, pastilles existantes). #2095.50, #2097.63, #2843.17 ÉCARTÉS (vue manager non cadrée, c76).
- c131 fait foi sur c74 (séquences : plusieurs contacts d'un compte, un seul ACTIF à la fois par compte). Plafond d'usage et coût des routines : back-office seul, jamais visible client (c132 crédits implicites).
- Doctrine CLAUDE.md : jamais de donnée fictive hors démo ; « non mesuré » n'est jamais « 0 » ; aucun envoi automatique ; le rôle change l'ordre, jamais le contenu ; aucun coût visible client.

Règles :

- TDD : test qui sait dire NON avant le code. Trace `// #<issue>.<n> — …` à l'endroit du comportement.
- Compagnons de tout changement user-facing : FR + EN, semis démo (`apps/api/src/modules/demo/demo-dataset.ts` + classement `demo-coverage.ts`), fragment de changelog `changes/<branche>.yml` (FR/EN), l'appelant branché.
- Une valeur nouvelle écrite en base : migration qui élargit la contrainte AVANT le code (GA-11/12). Enum : ajout en FIN, jamais renuméroté.
- Rester dans la ligne Périmètre ; un débordement nécessaire = question au rapport, pas un fichier de plus. Toute ligne modifiée qui porte un `#NNN` (ou posée par un commit qui en cite un) : nomme-le dans un message de commit (« garde #NNN » ou « revient sur #NNN : raison »).
- Tests CIBLÉS seulement (≤ 5 specs liées). Autorisé UNE fois : `pnpm exec turbo run build --filter=<paquet>^...` pour construire les dépendances, puis `pnpm --filter <paquet> run check-types 2>&1 | grep 'error TS'` doit être VIDE avant chaque push (le pre-push le rejoue). JAMAIS la suite complète, jamais `check-types` racine.
- Commits groupés par écran, numéros dans le sujet (`feat(web): … (#2164.4)`), scope commitlint valide (pas `briefs` : `docs(tooling)`), pied de commit ≤ 100 caractères. Pousse TÔT (dès le premier point vert) puis après chaque point : `git push -u origin HEAD:refs/heads/claude/vieilles-l15-missions` — push SIMPLE, jamais --no-verify, jamais --force, jamais rebase. Push refusé ⇒ corrige ce que la sortie nomme, une fois ; refusé encore ⇒ STOP avec la sortie exacte dans le rapport.
- Fin : écris `docs/briefs/claude-vieilles-l15-missions-rapport.md` (≤ 40 lignes : par point → livré (commit) / déjà là (fichier:ligne) / non fait (raison) ; questions ; SHA de tête), commit, push. Puis STOP.

## Le lot

### L15 — Missions : exceptions, colonnes, filtres, vues, KPI

Points : 2408.2 ⚑ menaces revenu, synthèse (MissionCockpitKpiTiles.tsx:67) · 2408.3 ⚑ menaces relation (mission.ts:847) · 2408.11 exception CRA en retard (mission.ts:1036) · 2408.16 exception satisfaction faible (mission-drift.service.ts:58-61,91) · 2408.17 exception absence prolongée (staffing-pilotage.service.ts:186) · 2408.20 ⚑ consultant non sécurisé · 2408.21 exception action sans owner · 2408.33 colonne satisfaction (columns.ts) · 2408.40 filtre société juridique (columns.ts:57, InvoiceReadinessTable.tsx:188) · 2408.51 filtre satisfaction (filters.ts) · 2408.54 vue « À traiter cette semaine » (SavedMissionViews.tsx) · 2408.56 vue CRA manquants (SavedMissionViews.tsx:32) · 2408.57 vue Factures bloquées (mission.ts:1043) · 2408.58 vue Paiements en retard (overduePayments sur /missions/suivi) · 2408.59 vue Marge non mesurée (SavedMissionViews.tsx:33) · 2408.66 ⚑ KPI renouvellements à engager · 2408.67 ⚑ KPI consultants bientôt disponibles · 2408.68 KPI CA facturable non facturé (MissionTrackingTiles.tsx:113) · 2408.69 KPI factures échues (MissionTrackingTiles.tsx:139) · 2408.70 ⚑ KPI marge non mesurée · 2408.82 table dense (MissionsTable.tsx:~620) · 2408.85 couleur seulement pour les exceptions (MissionDeadline.tsx) · 2408.88 recette 10 scénarios (aucun e2e missions) · 2408.89 missions pas au même niveau (MissionsPage.tsx:381).

- Compris : la liste Missions ne fait pas remonter CRA en retard, satisfaction, absence ni owner manquant, et les vues/KPI facturation vivent ailleurs (/missions/suivi).
- Je fais : écran /missions — exceptions CRA/satisfaction/absence/action sans owner dans la facette et le tri par urgence ; colonne + filtre satisfaction (champ ajouté à `GET /delivery/missions`) ; filtre société juridique ; vues prédéfinies nommées (À traiter cette semaine, CRA, Factures bloquées, Paiements en retard, Marge non mesurée) ; tuiles CA facturable et factures échues si retenu ; e2e des 10 scénarios.
- Je ne fais PAS : pas de vue de synthèse « revenu menacé » ni de tuiles renouvellement/dispo/marge avant arbitrage (écartées par la loi 4 selon `MissionCockpitKpiTiles.tsx`) ; `0` ne remplace jamais un inconnu (2408.71 déjà là).
- Droits : marge/revenu/coût = `canReadFinance` ; owner et périmètre portefeuille inchangés.
- Je défais : décision « loi 4 » (tuiles écartées) si Louis tranche pour — non proposé.
- Périmètre : `apps/web/src/features/missions/**`, `apps/api/src/modules/delivery/**`, `packages/contracts/src/schemas/mission.ts`, `features/mission-tracking/**` (lecture), e2e missions.
- Modèle : opus — contrat mission partagé (nouveaux risques, champ satisfaction sur la liste) et droits finance.
