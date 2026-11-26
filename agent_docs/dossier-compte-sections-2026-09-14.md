# Dossier compte — des quatorze onglets aux sept sections (D8, 14/09/2026)

#2115, #2130. Contexte complet : `CLAUDE.md` § Design rules et
`AccountDetailTabsBar.tsx` (commentaire au-dessus de `ACCOUNT_SECTIONS`).

Ce document verse au dépôt ce que le code calcule déjà — **il ne décide rien
lui-même**. La table ci-dessous est une retranscription de
`buildTabMappingTable()` (`apps/web/src/features/accounts/view/account-detail/accountDetailSearch.ts`) ;
`apps/web/src/architecture/dossier-compte-migration-doc.test.ts` échoue si les
deux divergent — modifier une ligne ici sans toucher le code (ou l'inverse) fait
rougir la CI.

## Ce qui ne bouge pas

`TAB_KEYS` reste le contrat du paramètre d'URL `?tab=` : aucune clé n'est
renommée, aucune n'est retirée. Ce qui change, c'est l'AFFICHAGE — les onglets
sont absorbés par sept sections, chaque ancien onglet devenant une sous-partie
atteinte par ancre. **Une seule page porte tout** : `/accounts/$id` — il
n'existe pas de route dédiée par sous-partie, donc la « page propriétaire » de
la table est la même pour toutes ses lignes.

⚠️ **Le 14/09/2026 au soir, `TAB_KEYS` est passé de quatorze à dix-huit clés**
(#2115.22/.23/.26/.27, décision de Louis : on COMPLÈTE les sections plutôt que
de reformuler leurs points). Quatre objets que les libellés de section
promettaient existaient déjà dans le code sans être montés dans la bonne
section : `programs` (Périmètres — retiré par #3677 le 05/10/2026, alias de `veille`), `needs` (Opportunités), `messages` (Plan
d'action), `memory` (Historique & preuves). Ajoutés en FIN de liste, comme tous
les précédents. Un seul mouvement touche une valeur déjà connue : `messages`,
alias de `plan` depuis #2130.79, redevient CANONIQUE — la section Plan d'action
porte maintenant la sous-partie qui lui manquait, et le laisser en alias en plus
aurait fait diverger `resolveTab` (qui lit `TAB_KEYS` en premier) de
`buildTabMappingTable` (qui applique les alias en dernier). Le lien de mai 2026
ouvre toujours la même section, sur une ancre plus précise.

## La table de correspondance complète

Colonnes : la valeur `tab` reconnue dans l'URL (canonique ou alias) → l'onglet
canonique vers lequel elle résout → la section qui le contient → l'ancre
précise (`id` posé par `AccountDetailTabContent`, `href` écrit par
`AccountDetailTabsBar` — les deux via `subSectionAnchorId`) → la page
propriétaire → si la valeur déclenche la notice de migration (#2115.33).

**La colonne « Notice de migration » n'est PAS libre** : `canonique` = la
valeur est un membre de `TAB_KEYS`, jamais de notice (elle n'a pas bougé).
`raccourci de section` = né AVEC les sept sections (#2115.14-20), jamais de
notice (rien n'y surprend). `ancien (notice)` = une valeur qui précède les
sections — `resolveLegacyTabNotice` répond un objet défini.

| Valeur `tab`           | Onglet canonique | Section                                | Ancre                  | Page propriétaire | Notice de migration  |
| ---------------------- | ---------------- | -------------------------------------- | ---------------------- | ----------------- | -------------------- |
| `access`               | `access`         | Écosystème & accès (`ecosystem`)       | `dossier-access`       | `/accounts/$id`   | canonique            |
| `apercu`               | `overview`       | Synthèse (`synthesis`)                 | `dossier-overview`     | `/accounts/$id`   | ancien (notice)      |
| `besoins`              | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | ancien (notice)      |
| `brief`                | `brief`          | Synthèse (`synthesis`)                 | `dossier-brief`        | `/accounts/$id`   | canonique            |
| `carte-d-influence`    | `organigramme`   | Organigramme (`organigramme`)          | `dossier-organigramme` | `/accounts/$id`   | ancien (notice)      |
| `carte-influence`      | `organigramme`   | Organigramme (`organigramme`)          | `dossier-organigramme` | `/accounts/$id`   | ancien (notice)      |
| `committee`            | `committee`      | Personnes (`people`)                   | `dossier-committee`    | `/accounts/$id`   | canonique            |
| `contacts`             | `contacts`       | Personnes (`people`)                   | `dossier-contacts`     | `/accounts/$id`   | canonique            |
| `couverture`           | `coverage`       | Personnes (`people`)                   | `dossier-coverage`     | `/accounts/$id`   | ancien (notice)      |
| `couverture-du-compte` | `coverage`       | Personnes (`people`)                   | `dossier-coverage`     | `/accounts/$id`   | ancien (notice)      |
| `coverage`             | `coverage`       | Personnes (`people`)                   | `dossier-coverage`     | `/accounts/$id`   | canonique            |
| `ecosystem`            | `partners`       | Écosystème & accès (`ecosystem`)       | `dossier-partners`     | `/accounts/$id`   | raccourci de section |
| `ecosystem-access`     | `partners`       | Écosystème & accès (`ecosystem`)       | `dossier-partners`     | `/accounts/$id`   | raccourci de section |
| `ecosysteme`           | `partners`       | Écosystème & accès (`ecosystem`)       | `dossier-partners`     | `/accounts/$id`   | raccourci de section |
| `ecosysteme-acces`     | `partners`       | Écosystème & accès (`ecosystem`)       | `dossier-partners`     | `/accounts/$id`   | raccourci de section |
| `evaluation`           | `evaluation`     | Synthèse (`synthesis`)                 | `dossier-evaluation`   | `/accounts/$id`   | canonique            |
| `fiche`                | `overview`       | Synthèse (`synthesis`)                 | `dossier-overview`     | `/accounts/$id`   | ancien (notice)      |
| `finance`              | `finance`        | Stratégie financière (`finance`)       | `dossier-finance`      | `/accounts/$id`   | canonique            |
| `historique`           | `history`        | Historique & preuves (`historyProofs`) | `dossier-history`      | `/accounts/$id`   | raccourci de section |
| `historique-preuves`   | `missions`       | Historique & preuves (`historyProofs`) | `dossier-missions`     | `/accounts/$id`   | raccourci de section |
| `history`              | `history`        | Historique & preuves (`historyProofs`) | `dossier-history`      | `/accounts/$id`   | canonique            |
| `history-proofs`       | `missions`       | Historique & preuves (`historyProofs`) | `dossier-missions`     | `/accounts/$id`   | raccourci de section |
| `influence`            | `organigramme`   | Organigramme (`organigramme`)          | `dossier-organigramme` | `/accounts/$id`   | ancien (notice)      |
| `memory`               | `memory`         | Historique & preuves (`historyProofs`) | `dossier-memory`       | `/accounts/$id`   | canonique            |
| `messages`             | `messages`       | Plan d'action (`actionPlan`)           | `dossier-messages`     | `/accounts/$id`   | canonique            |
| `missions`             | `missions`       | Historique & preuves (`historyProofs`) | `dossier-missions`     | `/accounts/$id`   | canonique            |
| `needs`                | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | ancien (notice)      |
| `notes`                | `overview`       | Synthèse (`synthesis`)                 | `dossier-overview`     | `/accounts/$id`   | ancien (notice)      |
| `opportunites`         | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | raccourci de section |
| `opportunities`        | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | raccourci de section |
| `organigramme`         | `organigramme`   | Organigramme (`organigramme`)          | `dossier-organigramme` | `/accounts/$id`   | canonique            |
| `overview`             | `overview`       | Synthèse (`synthesis`)                 | `dossier-overview`     | `/accounts/$id`   | canonique            |
| `partners`             | `partners`       | Écosystème & accès (`ecosystem`)       | `dossier-partners`     | `/accounts/$id`   | canonique            |
| `people`               | `organigramme`   | Organigramme (`organigramme`)          | `dossier-organigramme` | `/accounts/$id`   | raccourci de section |
| `perimeters`           | `sites`          | Périmètres (`perimeters`)              | `dossier-sites`        | `/accounts/$id`   | raccourci de section |
| `perimetres`           | `sites`          | Périmètres (`perimeters`)              | `dossier-sites`        | `/accounts/$id`   | raccourci de section |
| `personnes`            | `organigramme`   | Organigramme (`organigramme`)          | `dossier-organigramme` | `/accounts/$id`   | raccourci de section |
| `plan`                 | `plan`           | Plan d'action (`actionPlan`)           | `dossier-plan`         | `/accounts/$id`   | canonique            |
| `plan-action`          | `plan`           | Plan d'action (`actionPlan`)           | `dossier-plan`         | `/accounts/$id`   | ancien (notice)      |
| `plan-d-action`        | `plan`           | Plan d'action (`actionPlan`)           | `dossier-plan`         | `/accounts/$id`   | ancien (notice)      |
| `programmes`           | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | ancien (notice)      |
| `programs`             | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | ancien (notice)      |
| `projects`             | `projects`       | Opportunités (`opportunities`)         | `dossier-projects`     | `/accounts/$id`   | canonique            |
| `proofs`               | `proofs`         | Historique & preuves (`historyProofs`) | `dossier-proofs`       | `/accounts/$id`   | canonique            |
| `score`                | `evaluation`     | Synthèse (`synthesis`)                 | `dossier-evaluation`   | `/accounts/$id`   | ancien (notice)      |
| `signaux`              | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | ancien (notice)      |
| `sites`                | `sites`          | Périmètres (`perimeters`)              | `dossier-sites`        | `/accounts/$id`   | canonique            |
| `synthese`             | `overview`       | Synthèse (`synthesis`)                 | `dossier-overview`     | `/accounts/$id`   | raccourci de section |
| `synthesis`            | `overview`       | Synthèse (`synthesis`)                 | `dossier-overview`     | `/accounts/$id`   | raccourci de section |
| `veille`               | `veille`         | Opportunités (`opportunities`)         | `dossier-veille`       | `/accounts/$id`   | canonique            |
| `zone-blanche`         | `coverage`       | Personnes (`people`)                   | `dossier-coverage`     | `/accounts/$id`   | ancien (notice)      |
| `zones-blanches`       | `coverage`       | Personnes (`people`)                   | `dossier-coverage`     | `/accounts/$id`   | ancien (notice)      |

Les quatre cas nommés par le lot P2a : `score` → Synthèse#evaluation,
`couverture` → Personnes#coverage, `access` → Écosystème & accès#access,
`missions` → Historique & preuves#missions — les quatre lignes ci-dessus les
montrent, calculées par le même mécanisme que les 40 autres.

Les trois valeurs `fiche` / `messages` / `notes` n'apparaissaient dans AUCUNE
version antérieure de `TAB_ALIASES` : retrouvées par `git log --follow -p` sur
`AccountDetailTabsBar.tsx` (mai-juillet 2026, avant même #1104 qui a créé le
mécanisme d'alias). Sans cette entrée, un lien de cette époque tombait — et
tombe encore, hors de ce lot — silencieusement sur l'onglet par défaut.

## Consommateurs restants (#2115.38-39, #2130.86-88)

**Aucune suppression dans ce lot, même de code mort.** Ce qui suit est un
AUDIT — la liste de qui appelle encore chaque backend — pas une action.

### Accès — `apps/api/src/modules/account-access/account-access.controller.ts`

`@Controller('accounts')`.

| Route                              | Ligne du contrôleur               | Appelant web                                                                                                      |
| ---------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET /accounts/access-summary`     | `account-access.controller.ts:50` | `apps/web/src/features/accounts/view/accounts-list/useAccessSummary.ts:31` — la LISTE des comptes, pas le dossier |
| `GET /accounts/:id/access`         | `account-access.controller.ts:57` | `apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx:135`                                       |
| `POST /accounts/:id/access`        | `account-access.controller.ts:76` | `apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx:162`                                       |
| `POST /accounts/:id/access/answer` | `account-access.controller.ts:94` | `apps/web/src/features/accounts/view/account-detail/tabs/TabAccess.tsx:147`                                       |

`TabAccess.tsx` reste le rendu de la sous-partie `access`, section Écosystème &
accès — les quatre routes restent toutes appelées.

### Couverture — `apps/api/src/modules/coverage-gaps/coverage.controller.ts`

`@Controller('accounts')`.

| Route                             | Ligne du contrôleur         | Appelant web                                                                                                                                    |
| --------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /accounts/:id/coverage-gaps` | `coverage.controller.ts:42` | `apps/web/src/features/accounts/api.ts:552` (fonction `coverageGaps`), via le hook `apps/web/src/features/accounts/hooks/useCoverageGaps.ts:12` |

Le hook a DEUX appelants dans le dossier — même clé de requête, un seul appel
réseau (§33) : `apps/web/src/features/accounts/view/account-detail/tabs/TabCoverage.tsx:59`
(le rendu de la sous-partie `coverage`, section Personnes) et
`apps/web/src/features/accounts/view/AccountDetail.tsx:64` (la décision
`hiddenTabs` — masquer la sous-partie si la couverture n'offre aucune action).

### Historique — `apps/api/src/modules/activities/activities.controller.ts`

`@Controller('activities')`.

| Route                    | Ligne du contrôleur           | Appelant web                                                                                                                            |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /activities`        | `activities.controller.ts:30` | `apps/web/src/features/activities/api.ts:24` (`activitiesApi.timeline`), via `apps/web/src/features/activities/hooks/useTimeline.ts:11` |
| `POST /activities`       | `activities.controller.ts:42` | `apps/web/src/features/activities/api.ts:27` (`activitiesApi.log`), via `useTimeline.ts:28`                                             |
| `DELETE /activities/:id` | `activities.controller.ts:53` | `apps/web/src/features/activities/api.ts:30` (`activitiesApi.remove`), via `useTimeline.ts:44`                                          |
| `POST /activities/sync`  | `activities.controller.ts:66` | `apps/web/src/features/activities/api.ts:34` (`activitiesApi.sync`), via `useTimeline.ts:63`                                            |

Chaîne complète jusqu'à l'écran : `useTimeline.ts` → `TimelinePanel.tsx` →
rendue dans la sous-partie `history`, section Historique & preuves
(`AccountDetailTabContent.tsx`, `case 'history'`), aux côtés de `TaskList`
(module `tasks`, hors du périmètre de cet audit — famille distincte).

### La garde

`apps/web/src/architecture/dossier-compte-migration-doc.test.ts` relit les
quatre routes ci-dessus et vérifie que chacune existe encore, mot pour mot,
dans le fichier `*.controller.ts` cité — elle rougit si une route listée ici
disparaît d'un contrôleur sans que ce document soit mis à jour EN MÊME TEMPS
qu'un audit renouvelé le justifie.
