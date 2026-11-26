# Org Mapping — plan d'exécution (refonte agent organigramme, Annexe Théo 2026-07-21)

Source : `BELLUMAI_ANNEXE_ORGANIGRAMME_ACCOUNT_MAPPING_2026-07-21.pdf` (32 p, Théo).
Thèse Théo : _le graphe actuel est structurellement faux_ — root = 1er contact trié,
niveaux = decision-role, pas d'edge manager, board mélangé au comité d'achat.

> Note nommage : on ne versionne pas les noms (pas de « v2/v3 »). Une feature garde son
> nom et évolue ; le contrat s'appelle `OrgGraph`, l'agent « Organigramme / Account Mapping ».

## Reframe (gap analysis code, 2026-07-21)

~70% des primitives cibles EXISTENT déjà. Le net-new réel est étroit. NE PAS reconstruire
ce qui suit :

- Buying committee déterministe 8 rôles + Power/Interest — `apps/ia/app/knowledge/buying_committee.py`
- Ontologie entités (opérationnel/filiale_strategique/SPV/cédée/homonyme/bruit) + zones prio —
  `apps/ia/app/services/entities.py`, `prioritization.py`
- Classif déterministe titre→niveau→rôle — `decision_role.py`, `hierarchy_level.py`
- Contact lifecycle 5/7 états — `packages/contracts/src/schemas/classified-data.ts` (`CONTACT_LIFECYCLE_STATES`)
- Rerun partiel par phase + `ContactScope`/`StrategyScope` — `apps/api/src/modules/analysis/analysis-ondemand.service.ts`
- Zones blanches cockpit (score %, matrice famille×niveau, next-best-action) — `apps/web/.../tabs/TabCoverage.tsx`,
  endpoint `/accounts/:id/coverage-gaps`, contrat `packages/contracts/src/schemas/coverage.ts`
- Judge gate déterministe (point d'extension LLM déjà routé) — `apps/ia/app/graph/judge.py`
- Graphe web React Flow (nœuds+edges, légende rôles, chemin recommandé) — `apps/web/src/components/account/RelationFlow.tsx`
- Mémoire de correction (directives texte) — table `account_feedback`

## Les vrais trous

1. Pas d'edge typé (`reports_to`/`member_of`/`sponsors`/`owns_budget`/`influences`/`procures_for`)
   avec `source`+`confidence`+`verified`. Relations = strings (`reportingTo`, nom d'entité).
2. Pas d'arbre entités `parentId` ; direction des edges Pappers jetée (`pappers/cartographie.py:16-23`) ;
   rattachement personne→entité par nom, pas par id.
3. Pas de confiance par edge/nœud (formule p14 : A officielle +30, LinkedIn +20, titre +15,
   même org id +15, 2 sources +10, <12 mois +10, contradiction -30, LLM seul plafond 49 ;
   seuils 90-100 vérifié / 70-89 probable / 50-69 hypothèse / <50 zone à vérifier).
4. Web : plein/pointillé = profondeur, pas vérifié/inféré (aucun champ `verified` ; disclaimer global).
5. Pappers dirigeants (mandataires sociaux) mélangés au buying committee — `phase2_contacts.py` merge
   `merge_contact_seeds(seeds + pappers_seeds)` ; committee type tout par titre, ignore `source`.
6. Pas de 4-vues togglables ; pas de vue « organigramme vérifié » (hiérarchie sourcée seule).
7. Pas de `graph_version`/`rejectedItems`/`promptHash` ; dossier écrasé ; correction ne bump pas de
   version ni recalcule le score.

Nuances :

- Le « root = 1er contact trié » du spec est vrai côté WEB (`OrgChart.tsx:79-107` dérive l'arbre du
  `decision_role` à la volée), pas côté IA (l'IA n'a pas de notion de root — le LLM narre l'organigramme).
- Zones blanches : 3 impls parallèles (soft `uncoveredZones` LLM + hard `whiteSpaces` research +
  endpoint `/coverage-gaps` déterministe). Manquent partout : `family` sur la zone, `estimatedAvailable`/stock.
- Contact states : manquent `historical` (ex-employé/reverse-prospect — `reverse_prospecting.py` existe en IA
  mais pas d'état lifecycle) et `rejected`.

## Plan par phases (aligné aux 8 étapes du spec p31)

Convention : 1 PR par phase, TDD, tests verts avant merge, i18n FR+EN, entrée changelog, golden tests.
Contract-first : chaque phase type off le contrat `OrgGraph`. Rétro-compat : l'ancien format reste lisible
tant que la migration (phase 7) n'a pas tourné.

### Phase 0 — Contrat `OrgGraph` (spec §1+§5) — KEYSTONE, net-new — FAIT (PR à venir)

Défini dans `@bellum/contracts` (`packages/contracts/src/schemas/org-graph.ts`, source de vérité zod).
Champs (p17) :
`entities[]{id,name,type,parentId,country,status,sources[],confidence}`,
`people[]{id,fullName,title,entityId,family,hierarchyLevel,decisionRoles[],identityStatus,sources[],confidence}`,
`hierarchyEdges[]{fromId,toId,type,sourceIds[],confidence,verified}`,
`influenceEdges[]{fromId,toId,topic,stance,confidence,reasoning}`,
`buyingCommittee[]` (REUSE), `uncoveredZones[]` (EXTEND : +family,+estimatedAvailable),
`recommendedPath[]`, `rejectedItems[]{sourceId,reason}`, `graphVersion`, `promptHash`.
Invariants encodés au type (superRefine) : verified⇒sourcé+≥90 ; inféré⇒≤89 ; influence⇒reasoning ;
ids résolvent ; rejeté jamais réaffiché ni dans le chemin. JSON Schema partagé + mirror Python :
ajoutés à la phase qui ÉMET le graphe (resolver/prompt), là où le lock cross-lang sert.

### Phase 1 — Classifieur déterministe durci (spec §2) — surtout REUSE

- Arbre entités `parentId` : reconstruire Groupe→Filiale→BU depuis les edges Pappers (aujourd'hui jetés).
- Rattachement personne→entité par id (aujourd'hui match nom).
- Séparer gouvernance légale (Pappers mandataires) de l'opérationnel : ne PAS auto-classer un
  Président/Gérant Pappers en champion/committee ; famille « Gouvernance L0 ».
- Contact states : +`historical` (ex-employé/reverse-prospect), +`rejected` (jamais réinjecté).

### Phase 2 — Resolver relations sourcées + confiance (spec §3, algo p14) — net-new, plus gros moteur

- Extraire les edges `reports_to` sourcés (site off/organigramme/bio) → `verified=true`.
- Inférer edges probables (LLM) → `verified=false`+confidence+reasoning, plafond 49 si LLM seul.
- Moteur de confiance (poids + seuils ci-dessus), explicable/recalculable.
- Grounding A/B/C/D → plein / pointillé 70-89 / influence-only / rejeté+mémorisé.

### Phase 3 — Nouveau prompt (spec §4, p23-28) — golden-testé

Intégrer au prompt registry les blocs system (rôle/mission, contexte obligatoire, règles hiérarchie,
stratégie, garde-fous) + user prompt structuré (objets, pas paragraphes). Sortie = `OrgGraph`.
Garde-fous : jamais de ligne d'organigramme d'embellissement, pas de board en 1er contact ESN froide,
influence hypothétique OK si confidence+reasoning, contact non vérifié hors recommendedPath.

### Phase 4 — Persist graph_version + rejectedItems (spec §5) — FAIT

Deux colonnes `accounts` hors du blob (migration `1787946118427`) : `org_graph_version` (compteur
monotone) + `org_rejected_items` (`[{sourceId, reason}]`) — les deux seules choses qui doivent SURVIVRE
au blob, que chaque run réécrit.

- Correction user (`POST /accounts/:id/feedback`) → `OrgGraphVersionService.recordCorrection` : bump de
  version + mémorisation du rejet + **élagage déterministe du graphe stocké** (le contact écarté quitte
  people/edges/committee/path, la séquence est renumérotée, le résultat re-valide le contrat). Le dossier
  affiché bouge sans full rerun.
- Run suivant : `AnalysisService` relit la mémoire (portée ENTREPRISE × workspace, comme `directivesFor`)
  → job → `analyzeGraph` (`org_graph_version` / `org_rejected_items`, clés omises à leur valeur neutre)
  → état du graphe IA → `assemble_org_graph(graph_version=, rejected_items=)` qui saute les ids mémorisés
  et les reconduit, cumulativement, dans `rejectedItems`.
- Retour de run : `applyOrgChart` hisse `graphVersion`/`rejectedItems` du graphe émis vers les colonnes
  (version via GREATEST, ardoise FUSIONNÉE et dédoublonnée — jamais écrasée).
  Reste : le « recalcul du score » de la p30 (recalculer le score du compte après correction) n'est pas fait
  — seul le graphe est recalculé. Les corrections passent par le feedback existant ; pas encore de geste
  d'édition directe du graphe.

### Phase 5 — Rerun partiel par entité/famille/niveau + enrich ciblé (spec §6) — 2/3 FAIT

- **`ContactScope` + `family` + `level` — FAIT.** Contrat zod (`family` texte libre comme `theme`,
  `level` fermé sur L0-L5 ∪ c_level/n1/n2), pydantic côté IA, et expansion déterministe
  `app/services/contact_segments.py` (miroir des `FAMILY_DEFS` de `coverage.service.ts`) :
  famille+niveau → les titres RÉELS de cette case ; famille seule → tous ses titres ; niveau seul → la
  bande `person_seniorities` Apollo (et les personas ne se recombinent plus en filtre de titres).
  Précédence : scope explicite > thème > segment > personas. UI : chaque zone blanche de la carte de
  couverture porte « Lancer une recherche ciblée » → `enrich-contacts` scopé sur SA case.
- **« Recalculer le chemin » — FAIT.** `POST /analysis/:id/recompute-path` → `recomputeRecommendedPath`
  (`org-graph-path.ts`, pur) : réordonne depuis le graphe STOCKÉ (rôle d'achat du comité > rôles de la
  fiche, accessibilité en départage, rejetés/ex-employés/stock brut/opposants exclus, garde-fou L0 à
  froid, borne 5 étapes), bump de version, zéro appel IA, zéro crédit. Bouton dans la vue « chemin
  recommandé ». L'objectif rédigé par l'IA est conservé ; une personne qui ENTRE reçoit un objectif
  générique dérivé de son rôle.
- **Reste : « vérifier une relation » sur un edge** (recherche web/CRM ciblée sur UN lien, puis
  re-résolution du grounding/confiance de cet edge). Net-new côté IA (endpoint de vérification +
  provenance), pas un simple câblage : laissé pour une PR dédiée.

### Phase 6 — UI 4 vues + rendu vérifié/inféré (spec §7) — net-new rendu

- View-switcher : organigramme vérifié / carte d'influence / buying committee / chemin recommandé.
- Edges : plein=verified, pointillé+confidence=inféré (depuis la DATA, pas la profondeur).
- Alimenter le graphe depuis `OrgGraph` stocké (pas dérivé du `decision_role` à la volée).
- Vue « organigramme vérifié » = hierarchyEdges verified seuls.

### Phase 7 — Golden sets + tests + migration (spec §8) — net-new

7 cas golden (TF1, Société Générale, Crédit Agricole, SNCF, PME 200, Secteur public, 2 profils ESN) +
invariants (p30). Migration des runs existants (ancien format → `OrgGraph`).

## Ordre / dépendances

Phase 0 (contrat) débloque tout → 1,2,3 en parallèle une fois le contrat figé → 4 (persist) →
5 (rerun) + 6 (UI) → 7 (golden+migration) en continu dès la phase 2.

## Definition of Done (spec p32)

TF1 affiche groupe→BU→familles→niveaux (pas board→board→influenceurs) ; liens vérifiés/inférés
visuellement distincts ; filtre entité/métier/niveau/rôle/projet/confiance ; chemin adapté au profil ESN
excluant les contacts trop hauts ; zones blanches déclenchent recherche ciblée + stock/crédit ; graphe
maj après enrichissement sans full rerun ; chaque nœud/edge porte source/date/statut/confiance ;
aucune hiérarchie inventée présentée comme un fait.
