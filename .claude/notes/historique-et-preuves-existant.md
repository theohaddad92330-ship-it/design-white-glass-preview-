# M1-10 — Historique & preuves : ce qui EXISTE avant d'écrire

Mesuré le 14/09/2026 sur la branche `historique-et-preuves`, issue de `integration-p`
(`ba8e00e96`). ⚠️ Le cadrage des points avait été fait sur `main` AVANT le merge de
`integration-p` : **l'arbre a changé sous les pieds du cadrage**, et cinq lignes du
registre sont déjà périmées. Le constat ci-dessous est celui de l'arbre RÉEL.

## 0. Ce que `integration-p` a déjà livré et que le cadrage ne pouvait pas voir

`#2115` a absorbé les quatorze onglets dans **sept sections**
(`AccountDetailTabsBar.tsx:88-110`). La septième s'appelle déjà **`historyProofs`**
— libellé FR « Historique & preuves » (`i18n/locales/fr/accounts.json:535`) — et elle
empile `['missions', 'proofs', 'history']` dans UN seul rendu continu
(`AccountDetailTabContent.tsx:236-249` : `subSections.map(...)`, toutes rendues,
pas une à la fois).

Conséquence directe : **les points de FUSION 2124.32 / .33 / .35 / .36 / .38 / .40
sont acquis** — anciennes missions, preuves, témoignages, timeline, activités et
interactions sont déjà dans la même section, empilés. Ils ne se recodent pas ; ils se
GARDENT (un test qui sait dire non si un des trois sort de la section).

## 1. Capacité par capacité — calculée / persistée / RENDUE

| Capacité | Calculée | Persistée | **Rendue** | Appelant prouvé |
| --- | --- | --- | --- | --- |
| Missions livrées du compte | oui | `missions` | **oui** | `TabProofs.tsx:134` bloc `delivered`, dans la section `historyProofs` |
| Preuves du compte | oui | `proofs` | **oui, partiellement** | `TabProofs.tsx:149` — rend `claim`/`strength`/`scope`/`technologies` SEULEMENT |
| `proof.mission_id` | — | `proofs` (`proof.ts:38`) | **NON** | aucun lecteur dans `TabProofs.tsx` |
| `proof.created_at` | — | `proofs` (`proof.ts:45`) | **NON** | aucun lecteur dans `TabProofs.tsx` |
| `proof.detail` | — | `proofs` (`proof.ts:40`) | **NON** | aucun lecteur |
| **REX collectés** | oui | `rex_entries` | **NON** | ⚠️ `capitalisation.service.ts:121` LIT les lignes (`this.rex.find`) et ne s'en sert QUE pour calculer `pendingFrom(...)` (`:128`). `summary` / `what_worked` / `what_failed` sont lus en base, puis JETÉS : ils ne sont dans aucune réponse. C'est le défaut n°1 du dépôt, version « lu et jeté ». |
| REX en attente | oui | dérivé | **oui** | `TabProofs.tsx:234` |
| Témoignages | — | `testimonials` | **oui** | `TabProofs.tsx:247` |
| Timeline des activités | oui | `activities` | **oui** | `TimelinePanel.tsx` monté par `AccountDetailTabContent.tsx:195` (cas `history`) |
| Mémoire relationnelle | oui | dérivée (`engagement`) | **oui, non nommée** | `RelationLine` (`TimelinePanel.tsx:168`), appelée `:76` — un indicateur à 3 états sans titre de section |
| Filtres de timeline | — | — | **4 valeurs** | `TimelinePanel.tsx:95` `['all','email','call','meeting']`, alors que `ACTIVITY_KINDS` en porte douze (`activity.ts:49-73`) |
| Résultat d'un événement | — | `activities.outcome` | **appels seulement** | `TimelinePanel.tsx:280` garde `activity.kind === 'call'` |
| Lien vers l'objet | — | `activities.external_url` | **oui, quand le fournisseur en donne un** | `TimelinePanel.tsx:289` |
| **Corrections humaines** | oui | `record_field_audit` | **oui, MAIS ailleurs** | `RecordHistory.tsx` → `useRecordHistory` → `GET /accounts/:id/history` (`crm-core.controller.ts:68`). Monté dans `AccountRecordCard.tsx:147`, lui-même rendu par `TabOverview.tsx:282` — donc dans la section **Synthèse**, jamais dans Historique & preuves. Rien à recoder : à REPLACER. |
| Tâches restantes | oui | `tasks` | **oui** | `TaskList` (`AccountDetailTabContent.tsx:194`) — « ce qu'il RESTE à faire », jamais ce qui a été fait |
| Actions déjà exécutées | — | `activities` (`task`/`workflow`/`stage_change`/`gate_decision`) | **NON atteignables** | les kinds existent mais aucun filtre ne les expose (voir ci-dessus) |
| Les six sous-sections nommées | — | — | **NON** | aucun des six libellés n'existe : `git grep` rc=1 sur les six |
| État vide prescrit | — | — | **NON** | `TabProofs.tsx:120-130` rend `empty.title` + `empty.description`, deux phrases courtes, **aucune porte de sortie** |

## 2. Ce qui n'a PAS de champ en base, et ce que ça implique

`proofSchema` (`proof.ts:35-61`) porte exactement :
`id · account_id · mission_id · claim · detail · strength · scope · sector ·
anonymised · created_at · technologies`.

Donc **problème**, **résultat**, **expertise**, **source** et **version** n'existent
nulle part — ni colonne, ni écrivain, ni formulaire. Les afficher suppose une
migration additive ET un chemin d'écriture : un champ neuf que personne ne remplit
afficherait « non renseigné » sur 100 % des preuves, ce qui est pire qu'absent.

## 3. La démo

`proofs`, `rex_entries` et `testimonials` sont **vides à dessein**, avec leur raison
déjà écrite (`demo-coverage.ts:881-887`) : une preuve, un REX ou un témoignage
inventés attribueraient à l'ESN du visiteur un résultat qu'elle n'a pas obtenu.
`activities` est **seedée** (`demo-coverage.ts:260`) : tout ce qui touche la timeline
(filtres, résultat, lien) SE VOIT en démonstration.

## 4. Ce que ce lot va donc faire

Ne pas recoder la fusion (acquise). Livrer ce qui manque VRAIMENT :
les six sous-sections nommées, le REX lu-et-jeté enfin rendu, les corrections
replacées, l'état vide à cinq portes, les six filtres de timeline, le résultat pour
toute nature d'événement, et les trois champs de preuve déjà persistés que rien ne
lisait (mission, autorisation de citation, date).
