# Restitutions Théo — tableau de bord unique

**À lire AVANT toute session sur ces chantiers.** Ce fichier est le seul endroit
où l'on répond à « on en est où ? ». Le reste (plans d'exécution, mémoires de
session) raconte ce qu'on a voulu faire ; ici on note ce qui est **prouvé**.

## Les 4 sources

Copiées dans `agent_docs/sources/` (gitignoré — 41 Mo de binaire n'ont rien à
faire dans chaque clone). Chemins stables, à lire avec l'outil Read et son
paramètre `pages` :

| Rapport                                   | Fichier                                                                                      | Pages |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | ----- |
| TF1 — restitution produit                 | `agent_docs/sources/BELLUMAI_TF1_RESTITUTION_PRODUIT_COMPLETE_LOUIS_2026-07-21.pdf`          | 49    |
| Annexe organigramme / account mapping     | `agent_docs/sources/BELLUMAI_ANNEXE_ORGANIGRAMME_ACCOUNT_MAPPING_2026-07-21.pdf`             | 32    |
| Annexe méthodologie sales ESN             | `agent_docs/sources/BELLUMAI_ANNEXE_METHODOLOGIE_SALES_ESN_2026-07-21.pdf`                   | 31    |
| Restitution finale — nouvelles briques V2 | `agent_docs/sources/BELLUMAI_RESTITUTION_FINALE_NOUVELLES_BRIQUES_PRODUIT_V2_2026-07-21.pdf` | ~20   |

**Ces PDF contiennent des captures annotées et des maquettes cibles.** L'outil
Read les rend en image. Une maquette EST la spécification : un écran au bon
vocabulaire mais à la mauvaise structure est _partiel_, jamais _livré_. Lire par
tranches de 5 pages et écrire ses conclusions au fil de l'eau — plusieurs agents
sont morts en gardant tout en tête jusqu'à un unique gros write.

## Règle de vérité

Un point n'est « livré » que si on peut citer la ligne de code, le champ de
contrat, l'endpoint ou la chaîne i18n qui le prouve. Les pièges rencontrés, tous
réels sur ce projet :

- **calculé sans consommateur** — les horizons 7/30/60/90 ont été livrés, testés,
  et n'ont jamais eu d'appelant ;
- **capturé sans lecteur** — `commercial_status` remonte du kanban et n'atteint
  aucun prompt ;
- **livré sur la mauvaise surface** — le garde-fou board protégeait une section
  du bas de page, pas le chemin affiché en tête ;
- **structurellement impossible** — un edge ne peut pas dépasser 70 de confiance
  alors que « vérifié » commence à 90.

## État des audits (2026-07-22) — les 4 sont rendus

| Rapport                        | Audit                                       | PR   |
| ------------------------------ | ------------------------------------------- | ---- |
| Organigramme                   | `audit-org-mapping-2026-07-22.md`           | #714 |
| Organigramme — volet maquettes | `audit-org-mapping-maquettes-2026-07-22.md` | #722 |
| Méthodologie                   | `audit-methodo-2026-07-22.md`               | #716 |
| TF1                            | `audit-tf1-2026-07-22.md`                   | #721 |
| Restitution V2                 | `audit-restitution-v2-2026-07-22.md`        | #720 |

Verdict des audits organigramme et méthodologie : **1 critère de Definition of
Done sur 8** pleinement atteint, de chaque côté. Le squelette existe ; c'est la
matière qui manque.

## Vague de la nuit du 2026-07-22 → 23 — MERGÉE

Onze chantiers lancés en parallèle sur des périmètres **disjoints** (la condition
pour qu'ils ne se rebasent pas les uns sur les autres), tous mergés sur `main`.
`main` re-vérifié après la vague : contracts build, parité changelog 25/25, tsc
`apps/web` et `apps/api` propres.

| Livré                                                                      | PR   |
| -------------------------------------------------------------------------- | ---- |
| Newsletter changelog (catalogue déplacé vers `@bellum/contracts`)          | #736 |
| Onglet Messages mort supprimé + deux notes de confiance distinctes         | #742 |
| `commercial_status` atteint enfin les messages + 2 goldens de différence   | #744 |
| Cockpit Manager tranche 2 (charge d'actions, couverture portefeuille)      | #745 |
| Comptes proches expliqués, besoins à qualifier, copilote sur la ligne      | #748 |
| Cockpit zones blanches p19 (champs orphelins branchés)                     | #747 |
| Jeux de comptes nommés p29/p30 (TF1/SG/CA/SNCF/PME/public/2 ESN)           | #751 |
| Carte d'influence structurelle p20 + sources citées + paliers de confiance | #750 |
| Cadence de relance dérivée du scénario relationnel                         | #752 |
| Copilote : nature de chaque source + fraîcheur du dossier consulté         | #749 |
| Onboarding calé sur l'offre d'un abonné existant                           | #746 |

Seconde salve, mergée dans la foulée (mêmes règles, périmètres disjoints) :

| Livré                                                                                             | PR   |
| ------------------------------------------------------------------------------------------------- | ---- |
| Scope amont sur la recherche ciblée + export CRM besoin + angle à la demande (back)               | #755 |
| Onglet Signaux : fraîcheur affichée (badge « Archivé » > 24 mois)                                 | #754 |
| Vue d'ensemble : provenance de chaque fait + fraîcheur globale                                    | #756 |
| Offres/finance/vocabulaire : provenance honnête (« Estimations Bellum », badge Pappers en preuve) | #757 |
| Câblage UI des 3 endpoints #755 (bouton export CRM, générer un angle, refus scope 409 visible)    | #758 |

**Bilan : 16 PRs sur la nuit du 2026-07-22→23.** `main` re-vérifié vert après
chaque merge et une dernière fois à la fin : contracts build, tsc `apps/web` +
`apps/api` propres, suite contracts 547/547 (parité changelog + schéma partagé).

⚠️ **La CI GitHub Actions ne garde RIEN** : ses jobs échouent en 1-3 s (quota
Actions épuisé), et l'auto-merge fusionne malgré le rouge parce que ces checks ne
sont pas requis. Le seul vrai garde-fou est la vérif locale (tsc + parité) faite
avant chaque merge. Voir [[worktree-verify-and-changelog-rebase]] et
[[ci-and-autocommit-behavior]].

## Vague du 23/07 après-midi — restitution V2 (PR #767, #774)

Audit relu écran par écran **et vérifié dans le navigateur** :
`agent_docs/audit-restitution-v2-2026-07-23.md` (remplace celui du 22/07, rendu
avant les 16 PR de la nuit).

| Livré                                                                                                                                                                         | PR   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **P0 prod** — boucle de redirection (~160 `GET /onboarding/state` en 3 s → 429 → « Oups ») : un seul rebond par identité, destination selon l'état réel du compte             | #767 |
| Outils du copilote **activés par défaut** (`CHAT_TOOLS_ENABLED` → kill-switch `CHAT_TOOLS_DISABLED`)                                                                          | #767 |
| Signaux comptés dans la transparence (§13) + mention de pied du copilote (maquette p.15)                                                                                      | #767 |
| Filtre « coordonnées à compléter » (même prédicat que le compteur) + export de la sélection                                                                                   | #767 |
| Badge « compte porté par un collègue » sur la liste (§4 + doublons §10)                                                                                                       | #767 |
| Bouton « Nouveautés » qui affichait la clé brute `menu.title` depuis #736                                                                                                     | #767 |
| **Questionnaire progressif** : 6 blocs, ~30 questions, logique conditionnelle §28, synthèse « voici ce que Bellum a compris », profil lu par le prompt copilote (critère §12) | #774 |

**Checklist §31 : 7 livrables sur 8** (contre 2 le 22/07 au matin). Le 8e —
« Workspace repensé ou scope réduit » — est un arbitrage produit (D7), pas un
trou de code.

### Vérifié en prod après déploiement

Dashboard, Comptes, Équipe et Découvrir chargent ; plus de boucle ni d'écran
« Oups ». Le cockpit Équipe rend bien les blocs de la maquette p.11 (crédits avec
quota, actions partagées avec onglets, carte de couverture, activité récente) et
Découvrir sa barre haute p.20 (« Lancer sans idée de départ », « Expliquer la
méthode », présélections).

## Vague du 24/07 — restitution V2, 6 chantiers en parallèle (agents)

Lancés en agents parallèles sur périmètres disjoints, mergés après vérif locale.
Changelog consolidé à part (#788) pour éviter le conflit connu.

| Chantier (§ rapport) | PR   | Livré                                                                                                    | Différé (données absentes / décision produit)                                                          |
| -------------------- | ---- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Copilote §14         | #781 | Bandeau connecteurs ACTIFS + réponse en carte structurée (Objectif/Angle/Cas d'usage)                    | Production systématique des 3 sections = rebase du golden fingerprint IA (passe dédiée)                |
| Découvrir §18-19     | #782 | Palier de fit nommé + vue liste + volume détecté                                                         | Filtres unifiés secteur×signal×fit (D8) ; « attribuer à un collègue » (candidats `new` sans accountId) |
| Cockpit manager §10  | #783 | Bloc Rappels & agenda + Playbooks partagés                                                               | Pipeline valorisé €, objectif/perf par commercial, mémoire/commentaires d'équipe (objets absents — D7) |
| Besoins→CRM §7       | #784 | Push besoin = objet CRM idoine (HubSpot Deal, Pipedrive Deal, Attio Note, Salesforce Task)               | Teasing paywall §6 (aucun plafond de besoins par palier en billing)                                    |
| Veille §11           | #785 | Règles perso (secteur/techno/compte/besoin/personne) + tag « correspond à votre règle » + cadence digest | Envoi effectif du digest quotidien (préf prête, TODO scheduler)                                        |
| Historique §8        | #786 | Mode « depuis ma dernière connexion » (snapshot sign-in) + traçage score/profil                          | Repère posé à l'ouverture du Journal, pas au boot global (module auth hors périmètre)                  |

Fix au passage : `/consultants/` (Vivier #780) livré sans titre de route → test
« aucun écran n'hérite du titre précédent » rouge sur main, réparé (#787).

**Checklist §31 : 8/8 amorcés.** Restent des décisions produit assumées (D6/D7/D8)
et l'envoi du digest — pas des trous de code silencieux.

### Vérif finale main (24/07)

API tsc + web tsc propres ; web 1769 verts ; API 2930 verts (2 seuls rouges =
tests Salesforce qui appellent vraiment le réseau, timeout sandbox, préexistants) ;
contracts build + 574 verts (parité changelog incluse). IA non touchée par la vague.

## Vague du 24/07 — les 4 décisions produit tranchées (Louis) + fix Copilote

Louis a tranché D1/D7/D8 + le digest. Livré en agents parallèles + main :

| Décision             | Choix                                        | PR   | Différé assumé                                                               |
| -------------------- | -------------------------------------------- | ---- | ---------------------------------------------------------------------------- |
| **D7 cockpit**       | TOUT (pipeline € + objectifs + commentaires) | #796 | Le montant € est SAISI, jamais inventé ; besoins sans montant comptés à part |
| **D8 Découvrir**     | Rail unifié croisable (fin des 3 modes)      | #795 | « comptes comparables » gardé en panneau secondaire (non croisable)          |
| **D1 Connaissances** | Re-hébergée dans Réglages                    | #798 | /knowledge redirige (liens préservés)                                        |
| **Digest quotidien** | Envoi câblé                                  | #801 | — (opt-in strict, filtré par les règles de veille §11)                       |

Fix trouvé pendant le diag « le copilote me répond plus » : `GET /ia/chat/history`
faisait **500 systématique** (`COALESCE(conversation_id TEXT, id UUID)` refusé par
Postgres, mort depuis la migration 1786600000000). Corrigé #793. Le « no reply »
initial, lui, était un transitoire de fenêtre de déploiement (l'envoi `/ia/chat`
répond bien).

Fix collatéral : `/consultants/` (Vivier #780) livré sans titre de route → test
« aucun écran n'hérite du titre précédent » rouge sur main, réparé #787.

### Vérif finale main (24/07)

tsc api + web propres ; **web 1828 verts · API 2975 verts · contracts 586** ;
email cadence-aware buildé. IA non touchée par cette vague (hors discover.py).

**Restitution V2 : les 8 livrables de la checklist §31 sont désormais tous
amorcés ou livrés.** Ce qui subsiste = tuning (systématiser les 3 sections du
Copilote via rebase du golden IA) et les blocages OPÉRATEUR (creds SUPABASE sur
le service IA, `FIRECRAWL_MAX_PAGES=3` à purger) — pas des trous de code.

## Vague finale du 24/07 — « fais tout ce qui manque »

| Chantier                       | PR                                                 | Livré                                                                                                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Copilote complet (§12/§13/§14) | #811                                               | 3 outils de proposition de plus (enrichir contact, export CRM, lancer recherche) ; réponses structurées SYSTÉMATIQUES (golden IA rebasé délibérément) ; « sauvegarder cette réponse » sur l'endpoint d'épinglage existant                                 |
| Contacts actions de masse (§5) | #810                                               | `contacts.assigned_to` + attribution en lot (RBAC, scoping workspace) ; ajout au plan en lot avec compteurs RÉELS (« N ajoutés, M déjà au plan »)                                                                                                         |
| Contacts → Copilote (§5)       | #813                                               | `/chat?prompt=` pré-remplit la saisie SANS envoyer + bouton « Demander au Copilote »                                                                                                                                                                      |
| Objets transverses (§20)       | #815                                               | MemoryItem : nature / origine / **expiration** (un fait épinglé n'est plus vrai pour toujours ; les expirés sortent du contexte copilote) · Signal : importance DÉRIVÉE de règles existantes (jamais un score arbitraire) + lien vers l'action déclenchée |
| Vocabulaire D3                 | #807                                               | Un compte a un seul vocabulaire de statut (menu aligné sur les onglets ; valeurs en base inchangées)                                                                                                                                                      |
| Vocabulaire D4                 | #814                                               | Le Copilote ne dit plus trois fois la même chose (« Ce qui a servi à cette réponse »)                                                                                                                                                                     |
| Rouges de main                 | #812                                               | `/pilotage/` sans titre de route (même classe que `/consultants/` #787)                                                                                                                                                                                   |
| **D6 Découvrir**               | Le geste ATTRIBUE vraiment (arbitrage Louis 24/07) | #820                                                                                                                                                                                                                                                      | « Ajouter à mon portefeuille » crée/réattribue le compte (`status='prospect'`, `assigned_to`), sans crédit ni faux dossier ; l'analyse plus tard réutilise CETTE ligne |
| Rouge de main (#818)           | #819                                               | `enrichment.annualRevenue` n'existait pas sur le type — le `tsc --noEmit` du build web était ROUGE ; corrigé en amont en persistant le CA numérique d'Apollo                                                                                              |

### Vérif finale (24/07, sur `main` APRÈS le merge de #820)

tsc api + web propres · **web 1900 · API 3076 · IA 3721 · contracts 614** — suites
complètes lancées sur la `main` mergée, pas sur une branche.

Deux dettes d'hygiène constatées au passage, laissées telles quelles :

- `prettier --check` échoue sur `main` (catalogue changelog + ce tracker). Le
  catalogue est écrit en guillemets doubles depuis toujours ; le reformater =
  ~1 400 lignes de bruit et un conflit garanti avec toute branche en cours.
  À faire dans un commit dédié quand la file de PR est vide.
- GitHub Actions reste hors service (quota) : la vérification locale EST le garde-fou.

### Les trois derniers arbitrages, tranchés et livrés (24/07)

- **D2 Veille** — page unique + **facettes combinables** (statuts en OU, prioritaires/règles en ET). Un onglet répondait à une question à la fois ; le croisement « nouveau SUR un compte prioritaire » était impossible. Chaque puce annonce son compte avant le clic.
- **D5 Signal × Besoin** — le signal d'achat devient la **5ᵉ nature** de l'Opportunity Graph (`kind = 'signal'`, migration `1788245117903`), visible dans l'écran Besoins sous son propre onglet. Séparés dans les compteurs à dessein : un signal annonce peut-être un besoin, il n'en est pas un.
- **§6 boucle d'apprentissage** — l'agrégat de ce que l'équipe a fait de ses besoins (converti / transformé / obsolète, par secteur × offre) part avec chaque run (`workspace_learning`, clé omise quand vide ⇒ prompt byte-identique) et s'affiche dans Pilotage. Ce sont des décisions humaines COMPTÉES : ni score, ni prédiction, et un prior sur l'ESN — jamais un fait sur la cible.

### Ce qui reste — et pourquoi

- **§6 teasing « 8 autres besoins disponibles »** : aucun plafond de besoins par palier n'existe côté billing — on ne fabrique pas un faux paywall.
- **§6, la moitié « Data Forge / CRM / RAG alimentent le graphe »** : la boucle livrée capitalise sur les USAGES (cycles de vie déplacés). Faire ENTRER des besoins depuis le CRM ou les documents RAG demanderait une extraction LLM sur du texte non structuré — c'est-à-dire fabriquer des besoins que personne n'a écrits. À cadrer avec une exigence de citation, pas à improviser.
- **BLOCAGES OPÉRATEUR** (chez Louis, pas du code) : `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` absentes du service `bellum-ia-service` sur Railway (8 familles de routes IA mortes) ; `FIRECRAWL_MAX_PAGES=3` à purger (affame la source « site officiel » de l'organigramme).

## Ce qui reste — décisions produit, PAS des trous de code (ne pas coder sans feu vert)

- **Refonte du prompt organigramme p23-28** : change ce que l'IA écrit sur CHAQUE
  compte. Sans lui, pas de carte d'influence métier peuplée.
- **Provenance par-fait absente côté back** (notée par les agents #754/#756/#757) :
  pas d'URL de preuve par signal (`recentSignalSchema`), pas de `collected_at`
  par source financière, pas de date par techno de la stack, pas de catégorie
  fermée de positionnement. Toute matérialisation = changement de contrat IA.
- **`FIRECRAWL_MAX_PAGES=3`** encore posé sur Railway — affame la source « site
  officiel » de l'organigramme. À purger (opérateur).

## Écarts révélés, à trancher en produit (ne pas masquer)

Le livrable #751 documentait cinq trous par des sentinelles `xfail(strict=True)`.
**DEUX ont été bouchés (#799)** — leurs sentinelles sont redevenues des tests
verts. Restent trois trous, tous en amont ou en décision produit :

- **Plafond p14** : registre (A) + site officiel (A) = 80, _jamais_ « vérifié »
  (seuil 90) ; fournisseur (B) + officiel (A) = 100. Deux preuves de même nature
  remplissent une seule fois le facteur +30. Asymétrie de la grille, décision
  produit — pas un bug.
- ~~**L5 Achats**~~ **FAIT (#799)** : `classify_hierarchy_level` a un tier
  « achats » (procurement/purchasing/sourcing/contrôle de gestion), mappé sur L5
  par l'assembleur. Un « Directeur des Achats » n'est plus rabattu en direction.
- **Zone blanche non située** : une zone sans entité/famille/niveau ne porte que
  `reason` ; la p30 exige les 3 axes. Reste xfail — l'assembleur n'invente pas
  ces axes (à raison), il faut que le classifieur amont situe la zone.
- **`estimatedAvailable`** (stock estimé DoD n°5) : jamais posé. Reste xfail — un
  chiffre honnête exige un vrai comptage Apollo (coût), pas une invention.
- ~~**`accessScore`**~~ **FAIT (#799)** : l'assembleur pose `accessScore` sur
  chaque siège (dérivé déterministe du niveau + statut d'identité). Le tri du
  chemin ne retombe plus sur `confidence`.

### Autres lignes du rapport bouchées depuis (tracker remis à jour 24/07)

- **Filtre « projet » + score de confiance vivant + jeux de contrôle (7 cas)** —
  **FAIT (#792)** : 6e axe d'exploration, confiance globale recalculée à chaque
  rendu (à jour après correction sans full rerun), golden contrat + chemin.
- **Digest de veille quotidien (§11)** — **FAIT (#801)** : cron 06:30, opt-in
  strict, filtré par les règles de veille, e-mail cadence-aware (« du jour »).
- **Liens hiérarchiques de l'organigramme** — **FAIT** (assembleur : index
  titre→personne + garde d'ambiguïté, `_resolve_manager`).
- **Sources sur les nœuds** — **FAIT** (`_person_sources` + preuve site officiel).
- **Horizons 7/30/60/90** — **FAIT** (`test_action_horizons.py`).
- **Relation kanban jusqu'à la phase 1** — **FAIT** (`commercial_status` threadé
  `analysis-ondemand`/`ia.client` → phase 1 research).
- **DoD golden « petite vs grande ESN », « froid vs client actif »** —
  **FAIT (#791)** (`test_dod_golden_sets.py`, `test_esn_stage.py`).

## Pièges d'outillage (coûtent une heure à chaque fois)

- **Worktree sans `node_modules`** : symlink depuis le dépôt principal, `@bellum/*`
  pointé sur les packages DU WORKTREE, **et `npm run build` dans
  `packages/contracts`** — sinon `tsc` invente des `TS2305` qui n'existent pas.
- **Le typecheck passe en dernier**, juste avant le push : ni jest ni vitest ne
  typent, et deux régressions TS sont parties en prod par ce trou.
- **Conflit changelog** : les deux côtés ajoutent une entrée en tête du même
  fichier. Se résout par union — mais sur le JSON, reconstruire depuis les
  versions indexées (`git show :2:` / `:3:`), car recoller les textes coupe un
  objet en deux.

## Ce qui bloque, et chez qui

| Blocage                                | Chez                 | Détail                                                                                                                                                                                                                    |
| -------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8 familles de routes IA mortes en prod | **opérateur**        | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` absentes du service `bellum-ia-service` sur Railway. Casse icebreaker, message, battlecard, summary, weekly, compare, scorer, activity. Aucun code ne remplace cette config. |
| « Depuis ma dernière connexion »       | **décision produit** | `last_seen_at` est un heartbeat réécrit à chaque refresh de token. Snapshot au sign-in (exact, fenêtre longue) ou heuristique d'inactivité (intuitif, approximatif) ?                                                     |
| Prompt organigramme refondu (p23-28)   | **feu vert**         | Change ce que l'IA écrit sur chaque compte. Sans lui : aucune carte d'influence métier, aucun `sponsors`/`owns_budget`/`procures_for`.                                                                                    |

## Chantiers ouverts, par valeur — TOUS FERMÉS (24/07)

Les cinq chantiers de valeur sont bouchés (voir la section « Écarts » ci-dessus
pour les PR). Il ne reste, côté organigramme/méthodo, QUE des items bloqués
opérateur (SUPABASE/Firecrawl sur Railway) ou en attente de décision produit
(refonte du prompt p23-28, plafond de confiance p14, zone blanche située,
`estimatedAvailable`, « depuis ma dernière connexion »). Aucun trou de code
silencieux restant.

1. ~~Liens hiérarchiques~~ **FAIT** (assembleur, index titre→personne).
2. ~~Sources sur les nœuds~~ **FAIT** (`_person_sources` + site officiel).
3. ~~Horizons 7/30/60/90~~ **FAIT** (`test_action_horizons.py`).
4. ~~Relation kanban~~ **FAIT** (`commercial_status` → phase 1).
5. ~~DoD non verrouillée~~ **FAIT (#791)** (golden ESN + froid/actif).

## Convention de mise à jour

Après chaque PR mergée qui répond à un point : cocher la ligne ici, en citant la
PR. Ne jamais écrire « fait » sur la foi d'un plan d'exécution — seulement sur
une preuve dans le code ou un audit.
