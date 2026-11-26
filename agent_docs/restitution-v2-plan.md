# Restitution produit V2 (21/07/2026) — plan d'exécution

Source : `BELLUMAI_RESTITUTION_FINALE_NOUVELLES_BRIQUES_PRODUIT_V2_2026-07-21.pdf`
(Théo / Louis / produit / design / eng). Critique par écran + wording cible +
implications backend/data + mockups cibles + prompts de mise en œuvre.

Branche : `feat/restitution-v2`. Chaque vague = commit vérifié (tsc + vitest verts).

Thèse produit du rapport : **BellumAI n'est pas une collection de modules**.
L'utilisateur doit pouvoir demander « que dois-je faire maintenant ? » et obtenir
un conseil contextualisé, prouvé, exécutable. Trois vrais moteurs de valeur :
**Copilote** (surface centrale de décision) · **Découvrir** (sourcing sans idée
préalable) · **Besoins/signaux/compte** (matière commerciale propriétaire).
Risques à fuir : onglets sans workflow réel, modules « façade » sans valeur,
données non actionnables/non traçables, pages faibles gardées « parce qu'elles
existent déjà ».

---

## ✅ Livré sur cette branche

| Commit                                                                     | Portée                                                                   | Résout                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| `feat(web): restitution V2 — nav hierarchy + wording`                      | Nav réordonné + wording 10 écrans FR+EN                                  | §2 §3 §4 §5 §6 §8 §9 §11 §12 §16 (wording) |
| `feat(web): comptes — Demander au Copilote + badge Données à rafraîchir`   | Menu ligne → `/chat?accountId=` ; badge staleness 90 j                   | §4 idées suppl.                            |
| `feat(web): besoins — split confirmées/à qualifier + provenance`           | En-tête « X détectées : Y confirmées, Z à qualifier » + ligne provenance | §6 §7                                      |
| `feat(web): contacts — badge Déjà contacté + colonne Donnée vérifiée le`   | Badge relation existante (user_status ≠ new) ; Source+Date fusionnées    | §5                                         |
| `feat(web): veille — Me prévenir automatiquement ouvre les vraies alertes` | Bouton stub → `/settings/notifications` (prefs réelles)                  | §11                                        |

> ⚠️ **Skew contrat en cours** : la copie de travail `main` a gagné 2 états lifecycle contact `historique`/`rejete` (annexe p15) PAS encore sur origin/main. Quand ça atterrit, `ContactTableRow.LIFECYCLE_BADGE_VARIANT` (5 états) et `ContactsLifecycleFilter.test` (tally 5 états) devront être complétés — à réconcilier au merge avec les changements Contacts de cette branche.

### Wording appliqué (before → after, FR+EN)

- **Nav** : ordre Dashboard · Copilote · Découvrir · Comptes · Contacts · Besoins ·
  Veille · Équipe · Historique. « Connaissances » retiré du menu (page pas encore
  supprimée, cf. reste-à-faire).
- **Comptes** : Portefeuille de comptes / En observation / Comptes à potentiel /
  Hors priorité ; « Comptes proches de votre cible ».
- **Contacts** : contacts identifiés / coordonnées à compléter / prêts à contacter ;
  « Enrichir coordonnées ».
- **Besoins** : Opportunités détectées / Signaux à traiter rapidement / À rapprocher
  de vos offres / Sources et inférences Bellum ; « Actualiser et approfondir ».
- **Veille** : « Vos signaux prioritaires », À requalifier, « Décidez si ce signal
  mérite une action », « Me prévenir automatiquement ».
- **Historique** → « Journal d'activité » / « Dernières actions enregistrées » /
  « Journal partagé et conformité » (page `/actions`, i18n `actions`/`routes`).
- **Équipe** → « Workspace commercial » / Comptes par propriétaire / Comptes sans
  responsable / Contacts à traiter.
- **Copilote** → « Votre copilote commercial », « Ce que Bellum utilise / garde en
  tête », « Actions rapides ».
- **Découvrir** → « Trouver de nouveaux comptes », Par critères / Par opportunités
  détectées / Par comptes comparables, « Afficher les comptes correspondants ».

---

## 🔜 Structurel restant (backend existe — livrable à la journée)

### Contacts (§5)

- ✅ **Colonne « Source » → « Donnée vérifiée le »** : FAIT — colonnes Source+Date
  fusionnées, provider en sous-titre discret de la date (`updated_at`).
- ✅ **Badge « déjà contacté »** : FAIT — `user_status ≠ new`. (Note : `email_sent_at`
  n'est PAS sur le list item, seulement `user_status` → c'est la bonne source liste.)
- ✅ **Filtres « prêts à contacter » / « à compléter »** : DÉJÀ LÀ avant ce chantier
  (chips lifecycle server-side ; `actionnable` = prêt à contacter).
- **Colonne mobile 06/07** : reste. Champ `phone` existe (un seul, pas de `mobile`),
  pas de `phone_verified`. Afficher le tel quand présent ; pas de gate « vérifié ».
- **Action de masse** : sélection + `ContactSelectionPanel` existent déjà (generate/
  enrich/bulk-send, `POST /contacts/send-email/bulk` capé 50). Manque « select all »
  header + actions attribuer/ajouter au plan.

### Veille (§11)

- **« Pourquoi Bellum me montre ça ? »** : PAS de champ raison/relevance par signal
  (`accountSignalItemSchema` = type/date/source/freshness). → soit dériver un texte
  (score + fraîcheur + type), soit ajouter un champ côté IA. Le « signalHint »
  actuel est une phrase statique générique.
- ✅ **Bouton « Me prévenir automatiquement »** : FAIT — n'est plus un stub, ouvre
  `/settings/notifications` (prefs réelles `buy_signals`/`weekly_digest`). Reste
  possible : un toggle inline par compte/secteur (règles personnelles).
- **Historique de signal** : `freshness`+`date` existent, pas de first-detection/diff.

### Historique (§8)

- Recherche par **compte / membre / type / date** : le `/actions` ne filtre que
  type/status/période (pas compte, pas membre, pas texte). La page `/settings/activity`
  (namespace `activityLog`) EST plus capable (allMembers/allEvents/allPeriods). →
  soit brancher ces filtres sur `/actions`, soit fusionner les deux surfaces.
- « Ce qui a changé depuis ma dernière connexion » : pas de donnée `since-last-login`
  sur l'historique (existe sur sessions auth `last_seen_at`, réutilisable).

### Découvrir (§16-19)

- Cartes déjà riches : `score`, `scoreFactors[]` (auditables), `signals[]` (avec la
  raison « pourquoi maintenant »), `dataConfidence`, `angle` (labellisé IA),
  `portfolioState`. Save/replay search existe (`useSavedSearches`).
- **Manque** : action **« attribuer à un collègue »** (assign-to-member existe dans
  action-history, pas dans Discover) ; presets (« comptes qui recrutent »…) ; mode
  « laisse Bellum choisir ». « Ajouter au portefeuille » = via Analyser (1 crédit).

### Connaissances (§15) — décision ferme, mais c'est un CHANTIER (pas un delete)

- ✅ Retirée du **menu** (fait Vague 1). L'utilisateur ne la voit plus dans la nav.
- ⚠️ **Suppression complète = relocaliser 5 onglets** : Templates, Playbooks,
  Méthode, Données CRM, Mes documents. « Supprimer la page » sans perdre ces
  capacités = les re-monter ailleurs (Copilote / Réglages / playbooks). Ce N'EST
  PAS un simple `rm` de route — à traiter comme un mini-chantier avec décisions
  produit sur où va chaque onglet.
- **NE PAS supprimer** le namespace `knowledge.json` ni `resources.ts` : la carte
  Mémoire du Copilote (`MemoireCard`) consomme `knowledge:memory.*`.
- **Ajout de doc** : l'upload fichier existe DÉJÀ dans le Copilote
  (`Chat.tsx AttachFileButton` → même `POST /rag-documents/ingest`). Seul l'import
  Google Drive (`DriveImportDialog` → `POST /google/drive/ingest`) est à re-monter.

---

## 🏗️ Grands chantiers (multi-jours — slice 1 de chacun LIVRÉE)

> ✅ **Slice 1 des 3 chantiers livrée + testée** (branche `feat/restitution-v2`) :
>
> - **A** `feat(ia): copilote — boucle d'orchestration outils` : tool-calling flag-gated (`CHAT_TOOLS_ENABLED`, OFF par défaut → byte-identique), 1er outil `compare_accounts`, transparence « actions ». 8 tests IA.
> - **B** `feat(web,api): manager cockpit` : crédits par membre (`credit_ledger`) + doublons de couverture (`user_actions`). Service spec + page web. i18n FR+EN.
> - **C** `feat(api): opportunity graph — table opportunities + backfill` : table + RLS + backfill déterministe depuis les analyses. Spec migration.
>
> Le « Reste (slice 2) » de chaque chantier est en fin de section correspondante / dans les commits.

### A. Copilote = interface d'orchestration (§12-14) — thèse n°1

Cible : le haut de page affiche connecteurs actifs, contexte utilisé, comptes
actifs, profil, playbooks, base interne, mémoire. Les réponses proposent des
**actions réelles**.

- **Existe** : `POST /ia/chat` (proxy → IA `/chat/message`), panneau transparence
  `ContextDisclosure` (active/sources/not_consulted — SANS fraîcheur), RAG, mémoire.
- **Manque clé** : `/ia/chat` renvoie du **texte seul** — AUCUN tool/function-calling
  dans `chat.py`. Le prompt est tool-_aware_ (`tools_summary`) mais n'exécute rien.
- **Toutes les actions existent déjà comme endpoints séparés** (à câbler au chat) :
  - générer message : IA `POST /message/generate`, `/icebreaker/generate`, `/battlecard/generate`
  - créer rappel : action-router `schedule_reminder` (`POST /actions/dispatch`)
  - enrichir contact : action-router `enrich_contact` → Apollo (1 crédit) ; MCP `/mcp/contacts/:id/enrich`
  - MàJ CRM : action-router `create_crm_task` → HubSpot/Salesforce ; MCP `/mcp/contacts/:id/log-crm`
  - comparer comptes : IA `POST /compare`
  - résumer signaux : IA `POST /summary/generate`, `POST /weekly/briefing`
  - préparer call / prochaine action : IA `POST /phase/4/plan` ; MCP `/mcp/accounts/:id/actions`
- **Net-new** : couche tool-calling dans `chat.py` (exposer les endpoints comme
  outils Claude) OU un routeur d'intentions côté API ; header connecteurs/contexte ;
  fraîcheur par source dans la transparence. **Le plus gros et le plus différenciant.**

### B. Manager cockpit (§9-10)

Cible : portefeuille + pipeline par membre, actions partagées/délégation, agenda,
conso crédits par user, mémoire collective/playbooks, **détection des doublons**
(deux sales sur le même compte/territoire), carte de couverture.

- **Existe** : `GET /manager/team-stats` (members[] avec accounts/contacts/emails/
  analyses/last_activity/assigned/stale ; coverage assigned/unassigned ;
  unassigned_sample) + `PATCH /accounts/:id/assign`.
- **Existe mais gated opérateur** : `team-kpis.service` (par commercial :
  creditsConsumed, messagesSent+provenance, responses, rdv, deals, response/rdv
  rates…) — réutilisable pour donner au manager la conso crédits/perf par user.
- **Net-new** : détection doublons (aujourd'hui `assigned_to` = 1 seul owner,
  aucune requête « 2 reps même compte/secteur ») ; carte de couverture
  secteur/territoire/persona/techno ; playbooks/mémoire partagés d'équipe UI ;
  agenda/rappels par commercial.

### C. Besoins = base propriétaire « Opportunity Graph » (§6-7)

Cible : base compte × besoin × signal × projet × source × date × confiance × offre
× contact ; suivi de cycle de vie (nouveau/confirmé/obsolète/transformé/converti) ;
capitalisation multi-comptes/multi-users ; logique « 5 vus, 8 autres dispo » (crédits).

- **Existe** : `GET /accounts/needs` (projection de `raw_analysis`) ; `kind`
  (pain/challenge/program/implication) distingue déjà exprimé/inféré/projet ;
  `urgency` ; offre rattachée. Signaux (avec date/source/type) vivent côté Veille.
- **Manque au niveau besoin** : `date`, `source` explicite, `confidence`/score par
  besoin (score = compte-level), lien besoin↔signal, cycle de vie/statut.
- **Actions détail** demandées (§7) — backend partiel :
  - Ajouter au plan : `POST /accounts/:id/plan/actions` (manuel) / `PATCH /plan-items/:id`
  - Ajouter au CRM : `POST /crm/hubspot/export` (contact-scopé) / action-router `create_crm_task`
  - Trouver décideurs : **pas d'endpoint dédié** (org dérivé client-side des contacts)
  - Générer angle : `POST /accounts/:id/plan/angles` = append MANUEL ; pas d'IA on-demand
  - Créer rappel : action-router `schedule_reminder`
  - ⚠️ Les intents action-router sont **keyés sur `contactId`**, jamais sur un
    besoin → câbler depuis un besoin = résoudre un contact cible ou ajouter des
    intents need-scopés. « Trouver décideurs » et « générer angle on-demand » = 0
    backend aujourd'hui.

---

## Décisions ouvertes (Louis / Théo)

1. **Prochain grand chantier** : A (Copilote orchestration, le plus différenciant),
   B (manager cockpit, plus tractable), ou C (Opportunity Graph, le plus lourd data) ?
2. **Contacts colonne « vérifiée le »** : `updated_at` comme proxy accepté, ou
   attendre un vrai `verified_at` côté enrichissement ?
3. **Historique** : brancher les filtres compte/membre sur `/actions`, ou fusionner
   avec `/settings/activity` (déjà plus capable) ?
4. **Veille « pourquoi »** : texte dérivé (score+fraîcheur+type) suffisant en V1, ou
   champ raison produit côté IA ?
