# OrgGraph — croisement du lot 04 : items 72 à 100 (§6 + §7)

> Mode : **croisement, lecture seule.** Rien n'a été codé. `origin/main` mesuré = `deaff12e0` (identique au
> `HEAD` de la branche courante — vérifié par `git rev-parse HEAD` / `git rev-parse origin/main` avant de
> commencer). Le commit qui livre l'essentiel de ce lot est `244209f1e` (« feat(web): corriger un organigramme
> a enfin son geste », 30/08 11:53), lui-même ancêtre de `origin/main` — confirmé par
> `git merge-base --is-ancestor`.
>
> Sources ouvertes : `agent_docs/recomptages/ORGGRAPH-inventaire.md` (l.170-209, items 72-100) ;
> `agent_docs/sources/jeudi-27-aout/txt/OUTER_PDF-22_ORGGRAPH_FINAL_2026-08-27.txt` (l.226-280, §7/§8) ;
> `agent_docs/sources/jeudi-27-aout/jeudi-27-aout/04_correction_personne_preuves.png` et
> `03_tous_contacts_couverture.png` (**ouvertes à l'image**) ; `agent_docs/orggraph-final-2026-08-29.md` ;
> `agent_docs/orggraph-inventaire-existant-2026-08-30.md` ; `agent_docs/orggraph-contradictions-2026-08-30.md`.
> Chaque affirmation de ces trois derniers documents a été **revérifiée contre le code d'aujourd'hui**, pas
> recopiée — deux l'ont été (le `grep` initial « zéro appelant » du 30/08 matin s'est révélé **périmé de
> quelques heures** : le commit `244209f1e`, publié le même jour à 11h53, a câblé exactement ce qui manquait).

---

#### Le compte

| Statut          | Items                                               | Nombre |
| --------------- | --------------------------------------------------- | ------ |
| **LIVRÉ**       | 72, 73, 74, 75, 76, 78, 79, 80, 81, 87              | 10     |
| **PARTIEL**     | 77, 84, 88, 90, 91, 92                              | 6      |
| **ABSENT**      | 82, 83, 85, 86, 89, 93, 94, 95, 96, 97, 98, 99, 100 | 13     |
| **NON PROUVÉ**  | —                                                   | 0      |
| **PÉRIMÉ**      | —                                                   | 0      |
| **À CLARIFIER** | —                                                   | 0      |
| **Total**       |                                                     | **29** |

10 + 6 + 13 = 29. Aucun item ne manque, aucun n'est compté deux fois (vérifié en relisant la liste
numérotée une à une contre le tableau ci-dessous).

---

#### Le chemin de correction : passe-t-il par `applyFieldUpdates`, est-il sourcé, versionné, réversible ?

**Sourcé, versionné, réversible : oui, mesuré.** **Passe par `applyFieldUpdates`/`decideFieldWrite` : non —
et ce n'est pas un oubli, c'est une seconde implémentation, écrite le même jour.**

- `grep -rln "applyFieldUpdates\|decideFieldWrite" apps --include="*.ts"` (hors `.spec.`) rend **huit fichiers** :
  `accounts.service.ts`, `cv-parse.service.ts`, `contacts.service.ts`, `crm-core/provenance.service.ts`,
  `crm-core/record-edit.service.ts`, `delivery/mission-expenses.service.ts`,
  `delivery/supplier-invoices.service.ts`, `projects/project-pipeline.service.ts`. **`org-graph-correction.ts`
  et `org-graph-correction.service.ts` n'y sont pas.** Ni l'un ni l'autre n'importe `@bellum/contracts`
  `applyFieldUpdates` ou `decideFieldWrite`.
- À la place, le module construit son **propre** mécanisme, en trois pièces qui, ENSEMBLE, obtiennent le
  même résultat doctrinal par une route différente :
  1. **Verrou optimiste dans le `WHERE` SQL**, pas en JavaScript (`org-graph-correction.service.ts:304-326`) —
     `UPDATE accounts SET org_graph_version = $4, … WHERE … AND COALESCE(org_graph_version,1) = $3`. Zéro ligne
     touchée ⇒ 409 avec diff (`conflict()`, `:405-430`). C'est la même classe de garantie que `applyFieldUpdates`
     vise, mais portée par Postgres plutôt que par une comparaison de rang de source.
  2. **Une preuve humaine est toujours de rang A** (`org-graph-correction.ts:44-52`, règle 4) —
     `confidence: 100, verified: true` **inconditionnellement**, quel que soit le `evidenceKind` choisi par
     l'utilisateur (workspace_user, official_site, org_chart, registry…). C'est l'équivalent fonctionnel de
     `fieldSourceRank('human') >= fieldSourceRank(current)` dans `decideFieldWrite`, mais écrit à la main,
     câblé nulle part au registre de rangs partagé (`packages/contracts/src/schemas/provenance.ts`).
  3. **Rejeu inconditionnel après chaque run** (`AccountsService.replayOrgCorrections`,
     `accounts.service.ts:2679-2732`, appelée depuis `applyOrgChart`) — chaque correction active
     (`reverted_at IS NULL`) est réappliquée sur le graphe qu'un run IA vient d'écrire, **dans l'ordre
     chronologique**, sans comparaison de rang : une correction humaine d'il y a trois semaines écrase
     toujours la valeur qu'un run frais vient de produire. C'est la substance exacte de « une correction
     humaine gagne toujours, quelle que soit sa date » — mesurée en exécution dans
     `apps/api/src/modules/org-graph/org-graph-correction.spec.ts` (vérifié par lecture, non ré-exécuté ici).

**Verdict** : la RÈGLE (« une correction humaine gagne toujours ») est honorée sur le graphe — mais elle est
implémentée en PARALLÈLE de l'arbitre partagé, pas au travers de lui. C'est exactement le motif que la
doctrine nomme ailleurs : deux mécanismes qui portent la même promesse finissent par diverger — ici
`decideFieldWrite` connaît un cinquième cas (`isBlank(incomingValue) && incomingSource==='human' → write`)
que `applyOrgCorrections` réplique à la main (règle 3, « une valeur retirée redevient inconnue, pas nulle »),
et rien ne garantit qu'un futur changement de `decideFieldWrite` se propage ici. **À signaler, pas à corriger
en urgence** : la donnée manipulée (un graphe à nœuds et arêtes, pas un enregistrement à champs plats) ne
tient pas dans la signature `Record<string, unknown>` d'`applyFieldUpdates` sans réécriture ; c'est une
justification technique plausible, mais elle n'est écrite nulle part dans le code — aucun commentaire des
deux fichiers ne dit « on n'utilise pas l'arbitre partagé parce que… ».

**Sourcé** — oui : chaque correction pose un `OrgSource` avec `kind`, `grounding: 'A'`, `date`, `claim`
(`org-graph-correction.ts:96-113`) ; le contrat force UNE preuve par CLAIM typé
(`ORG_CORRECTION_CLAIM_BY_FIELD`, `packages/contracts/src/schemas/org-graph-correction.ts:97-108`) — un
titre corrigé ne peut jamais prouver une relation.

**Versionné** — oui : `org_graph_version` bumpé sous verrou (ci-dessus), et le ledger (`org_graph_corrections`)
garde `graph_version_before`/`graph_version_after` par ligne.

**Réversible** — oui : `revertCorrection` (`org-graph-correction.service.ts:175-261`) pose une pierre tombale
(`reverted_at`) sur la ligne d'origine et insère une ligne d'annulation séparée — « on archive, on ne
supprime pas », appliqué à la lettre à ce ledger précis (mais voir plus bas : `org_rejected_items`, le
mécanisme voisin pour « écarter une personne », n'a **pas** de date du tout).

**GA-35 (ce qui se clique se tabule)** — **aucune violation trouvée**. `grep -rn "onClick"` sur tout
`.../organigramme/` (hors tests) rend 21 occurrences ; chacune vérifiée : toutes portent sur `<Button>`
(le composant `@bellum/ui`) ou `<button type="button">` (`RecommendedPathCard.tsx:71`). Zéro `<div onClick>`.
Le drawer (`OrgCorrectionDrawer.tsx`) et l'historique (`OrgCorrectionsHistory.tsx`) n'emploient que
`<Button>`, `<select>`, `<Input>`, `<Textarea>`, `<label>` natifs.

---

#### Ligne à ligne

| #   | Exigence (`FINAL l.XXX`)                                                                                                                                | Statut      | Preuve `fichier:ligne`                                                                                                                                                                                                                      | Appelant réel                                                                                                                                                                                           | Ce qui manque                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 72  | Étendre mémoire de version / rejets / ajout manuel à la correction fine (l.226-227)                                                                     | **LIVRÉ**   | `apps/api/src/modules/org-graph/org-graph-correction.service.ts` (574 l.), `org-graph-correction.ts` (480 l.), réutilisant `readStoredOrgGraph`/`org_graph_version` existants                                                               | `AccountDetailTabContent.tsx:92-93` (onglet organigramme, cliquable) → `TabOrganigramme.tsx` → `FocalOrgView.tsx:574` → `OrgCorrectionDrawer` → `useCorrectOrgPerson` → `PATCH …/org-graph/corrections` | —                                                                                                                                                                                                                                                                                                                                           |
| 73  | title/entité/niveau/rôle → drawer explicite ; source `workspace_user` automatique ; version bumpée (l.231)                                              | **LIVRÉ**   | `PERSON_CORRECTION_FIELDS` = title, entityId, hierarchyLevel, decisionRoles, reportsTo (`org-graph-correction.ts:68`) ; bump `org-graph-correction.service.ts:309`                                                                          | idem                                                                                                                                                                                                    | `evidenceKind` est **choisi par l'utilisateur** (`CORRECTION_EVIDENCE_KINDS`, défaut `workspace_user`), pas figé — l'AUTORITÉ (rang A) est automatique, la SOURCE affichée ne l'est qu'au défaut                                                                                                                                            |
| 74  | Modifier N+1 → formulaire + source/raison ; jamais drag & drop direct (l.233)                                                                           | **LIVRÉ**   | `correctionEditor(field='reportsTo')` = `{kind:'choice', options: people}` (`orgCorrectionDraft.ts:131-140`) ; `reason` obligatoire (`buildPersonCorrection`, `:186-188`)                                                                   | idem                                                                                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                           |
| 75  | Ajouter une personne → réutilise `DeclareOrgPanel` (l.235)                                                                                              | **LIVRÉ**   | `TabOrganigramme.tsx:146` (vue focale) et `:229` (second rendu) — les deux montages toujours présents                                                                                                                                       | `TabOrganigramme.tsx:146,229` → `useDeclareOrgPeople` → `POST /analysis/:id/org-people`                                                                                                                 | —                                                                                                                                                                                                                                                                                                                                           |
| 76  | Écarter/parti → réutilise les rejected items existants (l.237)                                                                                          | **LIVRÉ**   | `OrgContactDismiss.tsx` → `POST /accounts/:id/feedback` → `OrgGraphVersionService.recordCorrection` (`org-graph.service.ts:69-`) → `mergeRejectedItems(org_rejected_items)`                                                                 | Bouton sur la carte de chaque personne (menu « écarter »), atteignable en un clic                                                                                                                       | `orgRejectedItemSchema` = `{sourceId, reason}` **sans date** (`packages/contracts/src/schemas/org-graph.ts:346-350`) — pas de `dismissed_at`. L'horodatage vit ailleurs (table `account_feedback`), pas dans la mémoire de rejet elle-même                                                                                                  |
| 77  | Vérifier relation → réutilise le relation verifier, résultat **dans le drawer** (l.239)                                                                 | **PARTIEL** | `OrgVerifyRelation.tsx` monté (`FocalOrgView.tsx:563`), chaîne jusqu'à `relation_verifier.py`, verdict appliqué (`org-graph.service.ts:367`)                                                                                                | `FocalOrgView.tsx:563` (bouton SIBLING de la carte, hors du `<Dialog>` du drawer)                                                                                                                       | (a) N'affiche PAS son résultat « dans le drawer » — c'est un bouton séparé sur la carte, pas une section du `OrgCorrectionDrawer` ; (b) sa condition de rendu (`person.reporting && !verified`) n'est quasiment plus jamais vraie depuis le correctif P0, qui ne produit plus d'arête `reports_to` non vérifiée (défaut déjà ouvert : D288) |
| 78  | Annuler correction → ledger réversible (l.241)                                                                                                          | **LIVRÉ**   | `revertCorrection` (`org-graph-correction.service.ts:175-261`), pierre tombale `reverted_at`, ligne d'annulation séparée                                                                                                                    | `TabOrganigramme.tsx:142,223` → `OrgCorrectionsHistory` → bouton « Annuler cette correction » (`:143-153`) → `useRevertOrgCorrection` → `POST …/revert`                                                 | —                                                                                                                                                                                                                                                                                                                                           |
| 79  | Conflit → `expectedGraphVersion` ; 409 + modale de comparaison, jamais de lost update (l.243)                                                           | **LIVRÉ**   | `writeUnderLock` (`org-graph-correction.service.ts:290-326`), UPDATE conditionnel ; `ConflictNotice` (`OrgCorrectionDrawer.tsx:370-423`)                                                                                                    | Rendu dans le `<Dialog>` dès qu'un 409 porte un `OrgGraphConflict` valide (`readGraphConflict`)                                                                                                         | —                                                                                                                                                                                                                                                                                                                                           |
| 80  | Déplacement de mise en page seul autorisable plus tard ; jamais un N+1 implicite (l.248-249)                                                            | **LIVRÉ**   | `grep -rln "dnd\|draggable\|DragDropContext\|useDrag\|useDrop" .../organigramme` → **0 résultat**                                                                                                                                           | n/a — absence vérifiée, pas une capacité à appeler                                                                                                                                                      | —                                                                                                                                                                                                                                                                                                                                           |
| 81  | Drawer 5 champs : Poste, Entité, Niveau, Rôle décisionnel, N+1/manager (maquette 04)                                                                    | **LIVRÉ**   | `ORG_CORRECTION_FIELDS_BY_OBJECT.person` = `['title','entityId','hierarchyLevel','decisionRoles','reportsTo']` (`packages/contracts/src/schemas/org-graph-correction.ts:67-69`)                                                             | Rendu par le `<select>` de champ (`OrgCorrectionDrawer.tsx:178-189`)                                                                                                                                    | —                                                                                                                                                                                                                                                                                                                                           |
| 82  | Bloc « Preuves — une preuve par CLAIM » : Identité&poste (source+date+grade) / Relation, séparément (maquette 04)                                       | **ABSENT**  | recherché dans `OrgCorrectionDrawer.tsx` (423 l., lu intégralement) et `accountOrg.json` (`grep -n "Preuves"` → 0 match)                                                                                                                    | —                                                                                                                                                                                                       | Le drawer montre UNE ligne « Aujourd'hui : {valeur} » (`:194-201`), jamais un bloc structuré à deux cartes affichant les preuves EXISTANTES (source, date de vérification, grade de grounding) séparément pour identité et pour relation                                                                                                    |
| 83  | Relation non prouvée → texte « Aucune preuve relationnelle suffisante — Suggestion LLM conservée comme hypothèse, non comme hiérarchie. » (maquette 04) | **ABSENT**  | `grep -n "preuve relationnelle" apps/web/src/i18n/locales/fr/accountOrg.json` → 0 match                                                                                                                                                     | —                                                                                                                                                                                                       | Ce texte n'existe nulle part dans le dépôt. Le plus proche est `person.reporting.reasoning`, affiché HORS drawer sur la carte (`FocalOrgView.tsx:539-543`) — un texte différent, à un autre endroit                                                                                                                                         |
| 84  | Drawer, 2 actions : « Vérifier la relation » (secondaire) + « Enregistrer la correction » (primaire) (maquette 04)                                      | **PARTIEL** | `DialogFooter` (`OrgCorrectionDrawer.tsx:337-344`) : `Fermer` + `submit` (« Enregistrer la correction »)                                                                                                                                    | idem item 77                                                                                                                                                                                            | « Vérifier la relation » n'est PAS un bouton du drawer — c'est `OrgVerifyRelation`, un composant sibling monté à côté, pas dedans                                                                                                                                                                                                           |
| 85  | Pied de panneau : « Graph version 12 · toute correction est versionnée et réversible. » (maquette 04)                                                   | **ABSENT**  | `grep -n "Graph version\|versionnée et réversible" accountOrg.json` et `OrgCorrectionDrawer.tsx` → 0 match                                                                                                                                  | —                                                                                                                                                                                                       | Aucun texte de pied de panneau affichant la version du graphe ; la version n'apparaît que dans le toast de succès (`t('correction.saved', {version})`, `:122`), pas en permanence                                                                                                                                                           |
| 86  | Entête drawer : nom + badge entité + badge niveau + badge rôle + poste (maquette 04)                                                                    | **ABSENT**  | `DialogTitle` = `t('correction.title', {name})` seul (`OrgCorrectionDrawer.tsx:163-166`) ; `DialogDescription` = texte fixe, pas des badges                                                                                                 | —                                                                                                                                                                                                       | Aucun badge (entité/niveau/rôle) ni ligne « poste » dans l'entête du DRAWER — ces informations existent sur la carte SOUS-JACENTE (`FocalOrgView.tsx`), pas répétées dans le tiroir                                                                                                                                                         |
| 87  | Tableau conservé, mais ne doit jamais faire croire qu'il représente tout le compte (l.260)                                                              | **LIVRÉ**   | `FocalContactsTable` plafonnée à `TOP_CONTACTS = 10` (`FocalOrgView.tsx:637-663`), docblock explicite, lien « voir tous » annonçant le total ou `viewAllContactsUnknownTotal`                                                               | Rendu dans `FocalOrgView.tsx:122`, sur l'écran d'arrivée de l'onglet organigramme                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                           |
| 88  | Top 10 = sponsor, relais, opérationnels proches, statut d'accès (l.264)                                                                                 | **PARTIEL** | `contacts: [...cards].sort(byLevelThenConfidence)` (`focalOrgData.ts:654-655,726`) — tri par NIVEAU puis CONFIANCE                                                                                                                          | idem                                                                                                                                                                                                    | Le tri ne priorise ni le rôle (sponsor/influenceur) ni un « statut d'accès » — et ce dernier n'existe pas du tout dans le code (voir #93)                                                                                                                                                                                                   |
| 89  | Voir tous = drawer/page virtualisée, filtres entité/niveau/rôle/état seed-enrichi/email/tél/fraîcheur (l.266-267)                                       | **ABSENT**  | `AccountDetailTabContent.tsx:102` : `onViewAllContacts={() => onTabChange('contacts')}`                                                                                                                                                     | Bouton « voir tous » (`FocalOrgView.tsx:656-661`) → bascule sur l'onglet Contacts existant, PAS un drawer                                                                                               | L'onglet Contacts (`TabContacts.tsx` + `ContactsToolbar.tsx`) n'offre que recherche libre + 1 filtre de rôle (`roleFilter`) — aucun filtre Entité/Niveau/État/email/téléphone/fraîcheur distinct                                                                                                                                            |
| 90  | Seed = visible et recherchable, profondeur limitée (l.269)                                                                                              | **PARTIEL** | État `verified_identity`/`classified` dans `orgIdentityStatusSchema` (`org-graph.ts:92` porte littéralement `'seed'` en commentaire) ; assembleur Python les émet sous d'autres noms (`_identity_status`, `org_graph_assembler.py:413-418`) | —                                                                                                                                                                                                       | L'assembleur qui produit `identityStatus` n'émet **jamais** littéralement `'seed'` (seulement enriched/classified/verified_identity) ; aucun écran n'affiche un badge « Seed »                                                                                                                                                              |
| 91  | Enrichi = rôle/influence/contexte approfondi (l.271)                                                                                                    | **PARTIEL** | `ENRICHED_STATUSES = new Set(['enriched','actionable'])` (`focalOrgData.ts:387`) ; badge rendu dans les « 4 vues » (`OrgGraphViews.tsx:208`, `OrgInfluenceMap.tsx:568`)                                                                     | `OrgGraphViews.tsx`/`OrgInfluenceMap.tsx`, atteignables via « vue système »                                                                                                                             | Le badge « Enrichi » existe dans les 4 vues, pas dans un contexte Top10/voir-tous (qui n'existe pas, #89)                                                                                                                                                                                                                                   |
| 92  | À éviter = refus/bloqueur/historique négatif ; jamais proposé dans le chemin (l.273)                                                                    | **PARTIEL** | Filtre bloqueur à l'ÉCRAN, inconditionnel (`focalOrgData.ts:549-557`) — jamais affiché dans le chemin recommandé rendu à l'utilisateur                                                                                                      | `FocalOrgView.tsx` (chemin), à chaque rendu                                                                                                                                                             | (a) L'assembleur IA qui produit `recommendedPath` À LA SOURCE ne filtre PAS les bloqueurs (`org_graph_assembler.py:951-984`, seul filtre = `rejected_ids`) — l'exclusion n'est qu'à l'écran et au recalcul serveur à la demande ; (b) aucun statut « refus »/« historique négatif » n'existe (dépend d'`accessStatus`, absent, #93)         |
| 93  | Statut d'accès dérivé par règles (canaux vérifiés, opt-out, historique, coordonnées) (l.278-279)                                                        | **ABSENT**  | `grep -rn "accessStatus\|access_status" apps/web/src apps/api/src apps/ia/app packages/contracts/src` (hors tests) → **0 occurrence**                                                                                                       | —                                                                                                                                                                                                       | Le champ n'existe nulle part. Ce qui existe est un axe DIFFÉRENT : `identityStatus` (complétude de la fiche : enriched/classified/verified_identity), pas l'accessibilité/le consentement                                                                                                                                                   |
| 94  | « Accessible » n'exige pas mécaniquement email ET téléphone (l.279-280)                                                                                 | **ABSENT**  | idem #93 — pas d'`accessStatus` à qui appliquer une règle OU/ET                                                                                                                                                                             | —                                                                                                                                                                                                       | Un OU existe ailleurs pour un concept voisin (« reachable », `classified-data.ts:788-790`, `Boolean(email\|\|phone\|\|linkedinUrl)`) mais sert le tableau Contacts général, pas l'organigramme ni un `accessStatus`                                                                                                                         |
| 95  | Drawer « Tous les contacts » — entête « 2 241 · couverture complète · enrichissement progressif » (maquette 03)                                         | **ABSENT**  | pas de drawer (#89) ; texte introuvable dans `accountOrg.json`/`TabContacts.tsx`                                                                                                                                                            | —                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                           |
| 96  | Drawer — recherche + 3 filtres Entité/Niveau/État (maquette 03)                                                                                         | **ABSENT**  | `TabContacts.tsx` (239 l.) : `search` + `roleFilter` seulement (`ContactsToolbar.tsx`)                                                                                                                                                      | —                                                                                                                                                                                                       | Pas de filtre Niveau ni État (seed/enrichi) dans l'onglet réel                                                                                                                                                                                                                                                                              |
| 97  | Drawer — colonnes Nom/Poste/Entité/L/Rôle/État/Dernière vérif. (maquette 03)                                                                            | **ABSENT**  | `TabContacts.tsx` groupe par entité en cartes (`EntityGroups.tsx`), pas un tableau à colonnes                                                                                                                                               | —                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                           |
| 98  | Drawer — pagination « 1-50 sur 2 241 » + « Enrichir ces 50 »/« Enrichir 50 suivants » (maquette 03)                                                     | **ABSENT**  | `TabContacts.tsx` : pas de pagination par 50 ; `ResearchExpansionCallout` propose un enrichissement en lot SUR LA LISTE FILTRÉE ENTIÈRE, pas par tranche de 50                                                                              | —                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                           |
| 99  | Drawer — légende Seed/Enrichi (maquette 03)                                                                                                             | **ABSENT**  | `grep -n "Seed\|contact utilisable et classé sans LLM" accountOrg.json` → 0 match exact                                                                                                                                                     | —                                                                                                                                                                                                       | —                                                                                                                                                                                                                                                                                                                                           |
| 100 | Date de dernière vérification non vérifiée → `—`, jamais inventée ni 0 (maquette 03)                                                                    | **ABSENT**  | Pas de colonne « Dernière vérif. » nulle part (dépend de #97, absent)                                                                                                                                                                       | —                                                                                                                                                                                                       | Rien à vérifier tant que la colonne n'existe pas — ni violation ni conformité possible                                                                                                                                                                                                                                                      |

---

#### Ce que les maquettes 03/04 montrent et que le code ne fait pas

**Maquette 04 (`04_correction_personne_preuves.png`)** — ouverte à l'image. Elle montre un TIROIR unique
avec, dans l'ordre : entête (nom + 3 badges + poste) → formulaire 5 champs → bloc **Preuves** à deux cartes
(« Identité & poste » avec badge de grade `A` + source + date ; « Relation "rapporte à" » avec le texte
« Aucune preuve relationnelle suffisante ») → deux boutons de pied (« Vérifier la relation » outline,
« Enregistrer la correction » plein) → footer « Graph version 12 · toute correction est versionnée et
réversible. »

Le code livré (`OrgCorrectionDrawer.tsx`) fait le FORMULAIRE (item 81, entier) et le VERROU/CONFLIT (items
79, mieux que la maquette ne le montre — la maquette ne dessine pas le 409). Il ne fait **aucune** des quatre
autres pièces visuelles : pas d'entête à badges (82/86), pas de bloc Preuves lisant les preuves EXISTANTES
(82/83), pas de bouton « Vérifier la relation » dans le tiroir (84), pas de footer de version (85). Le geste
de vérification existe (`OrgVerifyRelation`), mais il vit à côté, sur la carte — un choix documenté et
délibéré dans le code (« le geste s'accroche à la CARTE… le bouton voisin… »), pas un oubli, mais qui laisse
la maquette 04 non recettée sur quatre points visuels sur six.

**Maquette 03 (`03_tous_contacts_couverture.png`)** — ouverte à l'image. Elle montre un DRAWER plein écran
distinct de l'onglet Contacts : entête à trois mesures, recherche + 3 filtres nommés, tableau à 7 colonnes
(dont **L** = niveau et **État** = Seed/Enrichi), pagination par tranche de 50 avec deux boutons d'enrichissement,
légende de bas de page.

Rien de cet écran n'existe. Le bouton « voir tous » de l'organigramme redirige vers l'onglet Contacts
EXISTANT, qui est une liste de cartes groupées par entité avec recherche + 1 filtre de rôle — une forme
différente sur tous les axes mesurables (pas de colonnes, pas de niveau, pas d'état seed/enrichi, pas de
pagination par 50, pas de légende). C'est une substitution assumée dans le code
(`AccountDetailTabContent.tsx:102`, confirmé aujourd'hui identique à ce que l'audit du 30/08 au matin avait
déjà mesuré) — mais elle n'est PAS neutre : un commercial qui clique « voir tous » depuis l'organigramme
atterrit sur un écran qui ne répond à aucun des 5 items 95-99.

---

#### Les défauts trouvés en chemin

1. **La correction d'organigramme n'utilise pas l'arbitre partagé `applyFieldUpdates`/`decideFieldWrite`.**
   Détaillé plus haut. Ce n'est pas un défaut fonctionnel mesuré (la règle « correction humaine gagne
   toujours » est honorée par un mécanisme parallèle testé), mais c'est un écart au TEXTE de la doctrine
   CLAUDE.md (« Toute écriture de champ passe par `applyFieldUpdates` / `decideFieldWrite` ») que rien
   n'explique dans le code, et qui crée exactement le risque que la doctrine veut éviter : deux mécanismes
   qui portent la même promesse, sans lien entre eux, peuvent diverger silencieusement.

2. **`orgRejectedItemSchema` n'a pas de date.** `{sourceId, reason}` — rien d'autre
   (`packages/contracts/src/schemas/org-graph.ts:346-350`). « On archive, on ne supprime pas : un fait périmé
   redevient inconnu AVEC SA DATE » n'est tenu qu'à moitié pour ce mécanisme précis : la RAISON est conservée,
   la DATE ne l'est pas dans la mémoire qui empêche la réinjection (`org_rejected_items`). L'horodatage existe
   ailleurs (la table `account_feedback` sous-jacente a probablement un `created_at`), mais le graphe lui-même
   ne peut pas répondre à « depuis quand cette personne est-elle écartée ? » en lisant sa propre mémoire de
   rejet.

3. **Le bouton « Vérifier la relation » est structurellement privé de sujet dans l'écran d'arrivée**, un
   défaut déjà documenté (D288 dans `orggraph-inventaire-existant-2026-08-30.md`) et **reconfirmé ici
   indépendamment** en lisant `org_graph_assembler.py` (le P0 du 29/08 ne produit plus d'arête `reports_to`)
   et `focalOrgData.ts` (le rendu du bouton dépend de `person.reporting`, qui vient de cette même arête). Ce
   défaut touche directement l'item 77 : le geste « existe » au sens code, mais n'a quasiment jamais
   l'occasion de s'afficher sur un dossier issu du pipeline standard.

4. **Le tri du Top 10 ne peut pas honorer « statut d'accès »** parce que ce champ n'existe pas du tout dans
   le dépôt (confirmé par recherche exhaustive, item 93). Ce n'est donc pas un bug de tri isolé : c'est la
   conséquence directe d'un manque de données amont, qui touche en cascade les items 88, 92, 93, 94.

5. **L'exclusion des bloqueurs du chemin recommandé est appliquée à DEUX couches sur trois** (écran + recalcul
   serveur à la demande), pas à la troisième (l'assembleur IA qui produit le chemin STOCKÉ au moment du run).
   Sans conséquence visible sur cet écran précis (le rendu filtre systématiquement), mais un consommateur qui
   lirait `recommendedPath` sans passer par `FocalOrgView` (export, copilote, API directe) pourrait voir un
   bloqueur proposé — déjà repéré dans `agent_docs/orggraph-contradictions-2026-08-30.md` (C2), reconfirmé
   ici sur le code d'aujourd'hui.

---

#### Ce que je n'ai pas pu vérifier, et pourquoi

- **La maquette `maquette-cible-SNCF-RESEAU.png`** (référencée par l'item 87 et par le FINAL comme modèle du
  tableau conservé) n'a pas été ouverte — seules les maquettes 03 et 04 étaient prescrites pour ce lot.
  L'item 87 est donc jugé sur le TEXTE du FINAL (« ne doit jamais faire croire… ») et le code, pas sur une
  comparaison visuelle avec cette référence précise.
- **Aucun test n'a été ré-exécuté.** Toutes les affirmations « testé » citées (ex. `org-graph-correction.spec.ts`,
  35 tests IA mentionnés dans `orggraph-inventaire-existant-2026-08-30.md`) viennent de la LECTURE du code
  et des fichiers `.spec.ts`/`.test.ts` eux-mêmes (leurs noms et leur présence), pas d'un `pnpm test` relancé
  dans cette session — cohérent avec le mandat « lecture seule, aucune commande qui change l'état », mais à
  garder en tête : un test qui existe et qui a été lu n'est pas un test qui vient de repasser au vert.
- **Le volume réel de graphes affectés par l'absence de date sur `org_rejected_items`** (défaut n°2 ci-dessus)
  n'a pas été mesuré en base — ce croisement porte sur le CODE, pas sur les données de production.
- **La provenance exacte de `evidenceKind` par défaut** (item 73) — j'ai lu le code (`emptyDraft`) qui fixe
  `'workspace_user'` comme valeur INITIALE d'un `<select>` modifiable, mais je n'ai pas fait tourner l'écran
  dans un navigateur pour confirmer qu'aucune validation supplémentaire ne le reverrouille côté client.
