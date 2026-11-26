# Reprise — 14/09/2026 soir (écrite 19:00, après recette M et merge N)

Session : `session_01APJBXTyXCmpDG1Mg4yXedi` · scratchpad `/private/tmp/claude-501/-Users-louisschlegel-Desktop-belllum-monorepo/19174249-0903-460a-9d3a-ede58b58da74/scratchpad/` (journal `main-journal.md`, preuves `main-l-preuves.md` / `main-m-preuves.md` / `main-n-preuves.md`, routes `main-n-routes.txt` = les 60 du régime FONDATION).

## 1. Tranché (Louis, 14/09 soir) — D1 à D16 dans `.claude/notes/decisions-2026-09-14-soir.md`

Tous appliqués ou en cours ; les **questions parquées** sont en bas de ce fichier (§ « Questions parquées », 16h46 + Q-1995 à 18:52). Prochain QCM à poser à Louis : ces ~16 questions d'un coup (D10 suite, D1 suite/recette, Q-1816, #2117.3-4, #2118 axes, Q-partage, Q-2208, #2120.30-38/.52-54, #2123.46-47, Q-2116.50/.52, Q-1315, Q-D79, #2167.44, **Q-1995**).

## 2. Mergé — et ce qui est recetté

| Lot | PR | SHA main | Déployé | Recetté |
|-----|----|----------|---------|---------|
| L | #2214 | `6580b0995` | oui | ✅ 60/60, L2-L7 (L1 résidu → corrigé dans M = M4) |
| M | #2217 | `dc406dded` | oui (api+ia+web) | ✅ 60/60 propre · M2 carte d'analyse ✅ · M3 valider contexte ✅ · M4 briefing ≤ 36 h ✅ · M5 CI ✅ · M6 changelog ✅ · **M1 ❌ résidu** (Q-1995) |
| **N** | #2218 | **`fff8af5bd`** | web ✅ 18:56 · **api : sonde `main-deploy-n.log`** (ia non touchée, reste `dc406dded` = normal) | **NON RECETTÉE** — N1-N10 dans `main-n-preuves.md`, régime FONDATION (Provenance.tsx) → balayer les 60 routes de `main-n-routes.txt` |

N = #2116 vague 1 : A `9ec8b2ee6` (contexte canonique 8 sources) · A2 `58037d273` · B1 `42d3ebebb` (contrat des 16 CTA) · B2 `9337758c2` (toasts nomment l'entreprise). Après recette : passer les points #2116 à `recetté` ligne par ligne (`registre-2026-09-14-accounts-piliers.md`), compter (`recetté` + `écarté` + `déjà là` = 53 moins 2116.31 RBAC `retenu`) ; #2116 reste OUVERTE sur 2116.31 seul (ou Q à Louis).

## 3. Jamais vérifié

- **N1-N10** (ci-dessus) — rien vu en prod.
- **N9** (réseau coupé) n'est pas scriptable ici → PARTIEL par les tests, à dire dans le registre.
- **N7** (offre sans exports → upsell) peut être non reproductible sur l'offre de Louis.
- #1995 : la réponse « Ouvre sa fiche depuis Contacts » désigne une fiche inexistante — attend Q-1995.

## 4. Reste — les vagues suivantes (cadrage FAIT, briefs à écrire en points)

Passe 2 terminée sur les 1 392 points (retenu 992 · déjà là 320 · reformulé 25 · à trancher 13 · livré 42). Réponses comptées postées sur les 21 issues. Registres : `.claude/notes/registre-2026-09-14-accounts-{piliers,metier-1,metier-2,prospection}.md`.

**Vague 1 (4 écrivains, opus sauf mention, ≤ 40 pts, 150 tours, `cd apps/web` pour vitest, PAS de changelog — c'est l'intégrateur qui l'écrit) :**

| Lot | Points | Thème | Fichiers-clés (conflits) |
|-----|--------|-------|--------------------------|
| P1 | #2115.1-6, .14-27, .40-47 (28) | D8 : 7 sections (Synthèse · Périmètres · Opportunités · Personnes · Écosystème & accès · Plan d'action · Historique & preuves) qui ABSORBENT les 14 onglets ; desktop lisible sans scroll horizontal, actif violet semibold, cibles larges, sous-sections par ancres ; mobile : select compact, section active visible, retour au résumé | `AccountDetailTabsBar.tsx` (`TAB_FAMILIES`), `accountDetailSearch.ts`, `TabOverview.tsx` |
| D1+D2 | #2118.4, .6, .19-20, .22-28, .30-37, .39-40, .44-47, .52 (28) | score DÉCOMPOSÉ à 7 axes FIXES (adéquation offre · potentiel · fraîcheur · accessibilité · capacité d'achat externe · concurrence · qualité des preuves), chaque axe mesuré/partiel/inconnu + impact + levier, inconnu jamais négatif (GA-08 enum, GA-18/19) ; blocs « Pourquoi pour ton ESN » · « Périmètre recommandé » · « Freins » · « Anti-conseil » (nomme + pourquoi) · « Action suivante » cliquable ; fiabilité = qualité/couverture/fraîcheur ; no-go temporaire + déclencheur ; profil incomplet → message dédié | `BellumReadCard.tsx`, `scoreFactors.ts`, `provisionalScore.ts`, contrats `analysis.ts` |
| C1 | #2117.2-4, .6, .9, .11-12, .14-15, .25-30, .35 (16) | hero : périmètre, statut commercial, relation ESN, action principale PAR ÉTAT (analyse incomplète → « Terminer l'analyse » · complet sans action → « Préparer le plan » · plan actif → « Continuer la prochaine action » · rdv → « Préparer le rendez-vous » · veille → « Voir ce qui a changé »), secondaire « Demander à Laura », identité (nom commercial, pays, entité, owner), secteur du compte ≠ secteur projet, « Actualiser » avec coût ET impact | `AccountDetailHero.tsx` (⚠️ B1 a posé `DossierCta.tsx` + `cta-contract.ts` : 16 CTA, `wiredBy` — AJOUTER au contrat, pas contourner) |
| C2 (sonnet) | #2117.23-24, .36-38, .41-45 (10) | statut commercial : motif + historique ; menu « … » : archiver / détacher / supprimer (routes API `:id/archive`, `:id/detach` existent) ; fraîcheur distingue analyse complète / refresh ciblé / synchro CRM / observation structurelle (« actualisée il y a N heures ») | `AccountDetailMoreActionsMenu.tsx`, `AccountDetailHero.tsx:202-213` (⚠️ conflit C1 → séquencer C2 APRÈS C1 ou fichiers distincts) |

**Vague 2 (après merge de la vague 1) :** P2 = #2115.7-13, .30-39 (17 : séquence de lecture + `TAB_ALIASES` anciens → nouveaux AVEC ancre, bannière de migration seulement si utile, rien supprimé côté API, audit des consommateurs) · D3 = #2118.8-18, .41-42 (13 : personnalisation par le profil — BU, rôle, offre prouvée, références, taille, territoire, capacité, stratégie validée D9, historique, corrections ; Market Memory → structure/accessibilité, JAMAIS timing) → apps/ia prompt + api contexte · C3 (sonnet) = #2117.46, .50, .53-56, .58-60, .64-66, .68-69, .74-78 (19 : tokens, sidebar sans scroll indépendant, cartes, mobile hero/sticky/drawers, motion réservé aux 5 moments).

**Points de recette (pas de code)** : #2115.48-53, #2118.48-51, #2117.80, .82-85 → prouvés en recette live, jamais briefés à un écrivain.

**Puis** : métier-1 / métier-2 / prospection (registres), même méthode ; #2117.31-34/.39-40/.81 attendent Q-1816.

## 5. Pièges de la journée (tous en mémoire)

- vitest web depuis la racine casse jsdom → `cd apps/web && node node_modules/vitest/vitest.mjs run … --maxWorkers=2`.
- Frappe navigateur : `left_click` aux coordonnées de la CAPTURE (textarea /chat = (960,662) en 1456×829) puis `type` puis `key Return` ; le clic par `ref` ne fait rien sur certains boutons (Valider D9) → coordonnées. « Nouvelle conversation » ouvre un DIALOGUE de dossier (choisir « Tout mon portefeuille » puis « Ouvrir la conversation ») — sinon la frappe part dans le vide.
- JS bloqué dès qu'une URL porte `?x=` (« Cookie/query string data ») → routes sans query (`/contacts/account/<id>`).
- `git pull` refuse si `.claude/projet.md` est modifié localement : `git diff > patch ; git apply -R ; pull ; git apply --3way`.
- Sortie Bash résumée par le hook → `python3 + subprocess` pour git/gh.
- Railway : un service dont le diff ne matche pas ses `watchPatterns` ne redéploie PAS (ia sur N) ; l'API bloquée 33 min → `railway redeploy --from-source --service belllum-backend-service --environment production -y`.
- Laura : 6 messages consommés aujourd'hui sur 50 (M1 ×2, M2 ×1, K ×2, L3 ×1).
- Onglet navigateur créé par la session : `1606347432` — à fermer en fin de session.
