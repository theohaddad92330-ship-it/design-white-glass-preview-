# TF1 restitution produit — état d'exécution (2026-07-21)

Source : `BELLUMAI_TF1_RESTITUTION_PRODUIT_COMPLETE_LOUIS_2026-07-21.pdf` (49 p, Louis/Théo).
Backlog canonique = P0-01→P0-10 (p46) + P1/P2 (p47) + extras (score p28, zones blanches p32-33,
provenance p9-16).

Triage complet du code réel effectué avant tout changement : la majeure partie du **backend P0 est
déjà livrée** par l'équipe ; les trous sont surtout du câblage UI + quelques vrais chantiers.

Convention : 1 PR/concern, base `origin/main`, TDD, i18n FR+EN, entrée changelog, **pas de merge auto
en prod** (merge = deploy). Nommage sans suffixe de version.

---

## Fait cette session (branches off origin/main, non mergées)

| Branche                            | Sujet           | Contenu                                                                                                                                                                                                                               |
| ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `feature/org-graph-contract`       | P0-06 Phase 0   | Contrat `OrgGraph` (@bellum/contracts) + 19 tests d'invariants. Keystone de la refonte organigramme.                                                                                                                                  |
| `fix/onboarding-restore-welcome`   | P0-01           | Onboarding → `/welcome` (écran validé, profil réel, 4 promesses, double CTA) au lieu de `/search`. Test de non-régression + changelog.                                                                                                |
| `feat/scope-confirm`               | P0-02           | Récap de périmètre AVANT de payer : objet résolu (entité registre vs nom), périmètre, marché, coût ; « Modifier » revient au formulaire, « Confirmer et lancer » débite. Helper `buildScopeSummary` + test d'intégration + changelog. |
| `feat/contacts-extend-by-angle`    | P0-03           | Recherche contacts par angle (entité chips + thème) → `ContactScope.entity/.theme`, merge dans le stock. Le backend l'acceptait déjà ; le web n'envoyait pas de scope. Tests hook→api→request + changelog.                            |
| `feat/message-inline-retry`        | P0-05           | Échec de génération = entrée d'erreur INLINE avec « Réessayer » (rejoue l'angle stocké, pas de prompt dupliqué) au lieu d'un toast fugace. Test du hook + changelog.                                                                  |
| `feat/credits-breakdown`           | P0-07           | `creditBreakdown` (plan/essai vs recharge) rendu dans la pastille crédits + carte Facturation ; date d'expiration de l'essai. `topup_analyses` ajouté au type web. Helper + view-model testés + changelog.                            |
| `feat/run-seller-context-snapshot` | P0-08           | Snapshot `profileData` par run (`analysis_runs.seller_context` jsonb + migration) ; resume rejoue le snapshot au lieu de re-dériver le profil courant. Spec 5 tests.                                                                  |
| `feat/enrich-linkedin-correction`  | P0-04           | Champ URL LinkedIn dans « Compléter l'identité » → `enrichContactSchema.linkedin_url`, override la clé de match Apollo. Tests dialog + changelog.                                                                                     |
| `feat/support-contact`             | P0-09 (partiel) | Adresse support canonique `support@bellum-it.com` dans le ContactDialog.                                                                                                                                                              |

---

## P0 — état détaillé + prochain pas

### P0-01 — Page post-questionnaire — ✅ FAIT (branche ci-dessus)

La `WelcomeScreen` était construite + branchée sur le vrai profil (`useEsnProfile` + `useProfileContext`)
mais orpheline (nav → `/search`, décision « time-to-value »). Redirigée vers `/welcome`.

### P0-02 — Company/scope confirmé avant run — 🟢 étape de confirmation FAITE ; snapshot restant

Fait cette session (`feat/scope-confirm`) : **étape de récap avant paiement** — l'objet résolu (entité
registre vs résolution par nom), le périmètre et le marché sont montrés ; rien n'est collecté/débité tant
que le rep n'a pas confirmé. Reste : **priorités** (thèmes/personas/régions/exclusions =
`selected_angles`/`excluded_angles`), **coût dérivé du scope**, et l'**objet `ScopeSnapshot`** persisté
(aucun `ScopeSnapshot`/`canonical_company_id`/`seller_context_version`/`estimated_credits` en base —
`startAnalysisSchema` ne les porte pas). Prochain pas : `scopeSnapshotSchema` (11 champs) dans
`packages/contracts` → l'alimenter depuis l'étape de confirmation → persister sur le run.

### P0-03 — Contacts déterministes — 🟢 partiellement FAIT ; reste le funnel

Fait cette session : extension par angle (voir branche). Reste :

- **Funnel visible** « 214 détectés → 146 vérifiés → 82 compatibles → 30 classés → 9 prioritaires ».
  Le `lifecycleTally` (5 buckets) existe déjà (`ContactsKpiStrip`) → le rendre en bandeau ordonné ;
  et renvoyer le compte des hits écartés (`_drop_out_of_scope_hits` dans `phase2_contacts.py`) pour
  afficher « X écartés (hors périmètre) » au lieu de les jeter silencieusement.
- **État `rejected` persistant** : aujourd'hui les hits hors-scope sont supprimés, jamais écrits ;
  `orgIdentityStatusSchema` (org-graph) modélise `rejected`/`historical` mais le lifecycle contact
  persistant ne les a pas.

### P0-04 — Enrichissement transparent — 🟢 FAIT (champ LinkedIn compris)

0 résultat = 0 débit (`contacts.service.ts`, guardé sur `matched`), toast typé « aucun crédit débité »,
correction du nom, bouton caché quand prouvablement rien. Fait cette session
(`feat/enrich-linkedin-correction`) : **champ URL LinkedIn** dans `EnrichIdentityDialog` →
`enrichContactSchema.linkedin_url`, override la clé de match Apollo. **Reste (polish)** : nommer le
provider tenté dans le message d'échec (exige que l'IA renvoie le provider).

### P0-05 — Génération message — 🟢 FAIT (retry inline compris)

Chaîne réelle (web `/ia/message` → API → FastAPI `/message/generate`), câblée canal→génère→personnalise→
envoie, aucun crédit (rien à rembourser), pas de bouton mort. Fait cette session
(`feat/message-inline-retry`) : le toast transitoire est remplacé par une **entrée d'erreur inline** avec
un bouton « Réessayer » qui rejoue l'angle stocké sans dupliquer le prompt.

### P0-06 — Organigramme — 🟠 EN COURS (Phase 0 faite ; 1-7 restent)

Plan : `agent_docs/org-mapping-plan.md`. Phase 0 (contrat `OrgGraph`) livrée. Suite : Phase 1
(arbre entités `parentId` + séparation gouvernance légale Pappers), Phase 2 (edges sourcés + moteur de
confiance, algo p14), Phase 3 (prompt golden-testé), 4 (persist `graph_version`+`rejectedItems`),
5 (rerun par entité/famille/niveau), 6 (UI 4 vues vérifié/inféré), 7 (golden sets + migration).

### P0-07 — Crédits/plan — 🟢 FAIT (une suite restante)

Fait cette session : détail plan/essai vs recharge + date d'expiration essai. Le **ledger** (débits/
refunds/historique) était déjà livré (`credit-ledger.entity.ts`, `GET /credits/ledger`, `CreditLedgerCard`).
**Reste** : la **date de renouvellement d'un plan payant** — pas dans le payload ; exige que l'API expose
`period_start`/`next_reset` dans `GET /credits` (pas de date inventée).

### P0-08 — Context Resolver — 🟢 repro FAITE (résolution + snapshot par run)

Fait cette session (`feat/run-seller-context-snapshot`) : colonne `analysis_runs.seller_context` jsonb
(migration `1787070000000`) — le `profileData` résolu est snapshotté au lancement, et le **resume rejoue
ce snapshot** au lieu de re-dériver le profil courant (un profil édité entre-temps ne change plus les
phases reprises). Fallback profil courant pour les runs antérieurs à la colonne. Spec 5 tests. La note
originale (résolution server-side déjà faite, PR #391) reste vraie ci-dessous.

### P0-08 (note historique) — Context Resolver — résolution server-side

Le profil ESN est résolu **server-side** et threadé partout (analysis/discover/score/contacts/chat/MCP —
`esnAnswersToProfileData`) ; le front n'est plus la source de vérité (PR #391). **Manquant** : le snapshot
profil+prompt **par run** pour la reproductibilité. `analysis_run` ne stocke que `prompt_versions`, pas de
`seller_context_version` → un resume re-dérive le profil COURANT, pas celui du run.
Prochain pas : colonne `seller_context_version` sur `analysis-run.entity.ts` (FK
`profiles.profile_context_version`), écrite à la création du run, relue au resume via
`ProfileContextRevisionService.get()`.

### P0-09 — Auth/support — 🟢 mostly done (suites restantes)

Fait cette session : adresse support canonique. Déjà livré : mitigation reload-logout
(`session-manager.ts` `/auth/refresh` silencieux), device-cap borné (2, fail-open), liste sessions/appareils
(`ActiveSessionsRow`), Sentry (logger.error auto-capture), cockpit Manager (coûts/erreurs/providers,
`dashboard-manager/monitoring`). **Reste** : (a) bouton d'aide **persistant global** avec contexte auto
compte/run/navigateur (go-to-market §42) ; (b) event **login/`session_started`** dans le journal
d'activité (`workspaceActivityEventNames` ne l'a pas ; actions automatisées type watchlist non tracées).

### P0-10 — Données/sources — 🟡 partiel (décisions de rendu)

Le coût brut € est **déjà gated** `billing:manage` (le commercial ne voit pas « 0,24 € »), mais l'owner/admin
voit encore le coût provider brut (`AccountCostChip` `api_cost_euros`). Firmographie EN **flaggée**
`firmographics.untranslated` (pas silencieusement anglaise). Badges source (Apollo/Pappers) **inline** vs
un panneau « Sources / qualité » dédié.
Prochain pas (décisions) : (1) ne plus montrer `api_cost_euros` en € même aux admins (crédits/analyses
seulement) ? ; (2) déplacer les badges `source` dans une section « Sources / qualité » commune, garder le
deep-link comme preuve consultable.

---

## Extras (recette produit)

### Score personnalisé (p28) — 🟡

Split /25 commercial + /100 confiance = FAIT (`account_score.py`, `score_axes.py`, `TabEvaluation`).
Manquant : (1) **axes p28** — implémentés = budget/accessibilité/urgence/maturité/fit ; p28 demande
Fit/Timing/Accessibilité/**Concurrence**/**Capacité** (Concurrence + Capacité absents) ; (2) **score
provisoire** + liste « ce qui ferait bouger la note » quand données incomplètes (aucun état provisoire —
seulement badges weakData/qualityCapped) ; (3) **adresse par prénom** dans « Comment ouvrir ce compte »
(pas d'injection prénom dans `bellum_strategy.py`) ; (4) quick-wins/risques **datés + proof_type** par item.

### Zones blanches (p32-33) — 🟡

Existant : `TabCoverage`, `/coverage-gaps`, `coverage.ts`, matrice famille×niveau, next-best-action.
Manquant pour atteindre p33 : (1) comptes **par cellule** famille×niveau (aujourd'hui totaux famille et
niveau séparés → aucune cellule « couverte » prouvable — `coverageGrid.ts`) ; (2) **`confidence` /100**
distinct du `score` de couverture ; (3) **`estimated_available`** (stock Apollo `departmentalHeadCount`)
par famille → ratio disponible-vs-couvert ; (4) réconcilier les dénominateurs (les « 9 contacts » comptent
famille OU niveau, « familles couvertes » compte is_target seulement → 50 % / 0 famille contradictoires).

### Provenance / recomposition page (p9-16) — voir P0-10.

---

## P1 / P2 (p47) — après le socle

P1 : signaux/besoins profonds (rerun partiel, jobs multi-sources), Action Center (pitch/call/séquence/CRM),
zones blanches (ci-dessus), scoring (ci-dessus), site/vidéo/support, Manager (déjà partiel). P2 : CRM/ATS
2-way, MCP (livré), international (Market Packs — packs pays existent déjà côté IA), sécurité entreprise
(SSO/SOC2). Détails p47.

## International (p43)

Packs pays IA déjà actifs (`country != FR`, zéro-flag : BE/US/CA sans clé, CH via Zefix, LU beta).
Reste : sources emploi/registres locaux par pays, golden sets par zone. Voir CLAUDE.md « Packs pays ».
