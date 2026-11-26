### Passe B — archive 05 ACCESSIBILITÉ / SCORING / PLAN DE COMPTE / ORGGRAPH / SECOND MARCHÉ

> Mode lecture seule. Reconstruit depuis la matière brute, jamais depuis le tracker.
> Tracker contredit : `agent_docs/archive-05-accessibilite-plan-second-marche-2026-08-25.md` (122 lignes).

**Fichiers ouverts : 24 / 24**

| Fichier                                                | Rôle                                          | Verdict                                                                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md` (21 l.)                                    | 4 résolutions + 3 instructions                | **porteur**                                                                                                                                                                                  |
| `original_markdown_sources/T1.md` (1285 l.)            | tome 1 — pivot d'accessibilité                | **porteur**                                                                                                                                                                                  |
| `original_markdown_sources/T3.md` (1110 l.)            | tome 3 — barrière d'achat, scoring par profil | **porteur**                                                                                                                                                                                  |
| `original_markdown_sources/T4.md` (1038 l.)            | tome 4 — second marché, territoire            | **porteur**                                                                                                                                                                                  |
| `original_markdown_sources/T5.md` (1478 l.)            | tome 5 — plan de compte, **ORGGRAPH §27**     | **porteur — le plus mal couvert**                                                                                                                                                            |
| `data/comptes-adressables-v0.csv` (281 + entête)       | 281 comptes scorés                            | **porteur**                                                                                                                                                                                  |
| `data/esn-referentiel-v0.csv` (477 + entête)           | squelette ESN                                 | **porteur**                                                                                                                                                                                  |
| `code_evidence/access_code.txt` (3377 l., 11 fichiers) | instantané du dépôt                           | non porteur **comme demande** — mais porteur d'un constat, ci-dessous                                                                                                                        |
| `source_pdfs/*.pdf` × 4                                | doublons des T1/T3/T4/T5                      | non porteurs — consigne : lire les `.md`                                                                                                                                                     |
| `MANIFEST_SHA256.md` + `.csv`                          | intégrité                                     | non porteurs. 22 fichiers au manifeste + les 2 manifestes = **24 sur disque**, concordance vérifiée                                                                                          |
| `repo_mirrors/*.md` × 10                               | copies de docs du dépôt                       | non porteurs, **et prouvé** : `diff` des 10 contre leur homologue vivant dans `agent_docs/` → **10 × IDENTIQUE, 0 ligne d'écart**. Ce sont des états du dépôt, pas des demandes de la source |

⚠️ **Constat sur `code_evidence/access_code.txt`** : 11 fichiers de code y sont versés (`access.ts`, `access-entities.ts`, `first-move.ts`, `account-access.service.ts`, `account-access.controller.ts`, `account-entities.service.ts`, `account-gate.service.ts`, `access_scoring.py`, `account_score.py`, `account_score_axes.py`, `entities.py`). **Aucun n'est un fichier OrgGraph.** `organigramme|orgGraph|decisionRole` y apparaît **4 fois**, toutes de passage dans `entities.py` (l. 3269, 3273, 3340, 3346). L'archive s'appelle `…_ORGGRAPH_…`, la première résolution de son README porte sur l'OrgGraph, et **le paquet de preuves de code ne contient pas une ligne d'OrgGraph**. Le verdict « TENUE » du tracker sur cette résolution ne repose donc sur rien qui ait été mesuré dans cette archive.

---

#### ⚠️ ORGGRAPH d'abord — ce que cette archive dit et que le chantier neuf ignore

La matière OrgGraph de l'archive est **`T5.md` PARTIE G, §27** (l. 779-831), plus `§14.6` (l. 214-222), `§17.1` (l. 393-404), `§34` (l. 1040), `§35` (l. 1056) et `PR3` du ticket `BEL-PLAN-001` (l. 1322-1326).

Le tracker `archive-05` écrit **une seule ligne** sur l'OrgGraph (l. 108) : la résolution « OrgGraph vérifié, Buying Committee et Access Graph sont distincts » est **TENUE**. Le tracker du tome 5 (`agent_docs/tome5-plan-de-compte-2026-08-23.md`, 102 lignes pour 1478 de source) en écrit **deux** (l. 34 et l. 73-75), toutes deux sur le seul renommage « à vérifier » → « inconnu », déclaré _sans objet_.

**PARTIE G n'est ouverte par aucun des deux.** Voici ce qu'elle contient.

##### O1 — La règle des 60 % : le nombre a survécu, la règle non. (le plus lourd)

La source (`T5.md:798-802`) :

> **« Un organigramme où tout est coloré est un organigramme inventé. »**
> Contrainte dure : sur un compte sans enrichissement lancé, **au moins 60 % des nœuds sont gris**. **Si le générateur colore plus, il invente.**
> Test : sur les 7 comptes du golden set sans enrichissement, mesurer la part de gris. **Sous 60 %, le prompt est trop généreux.**

Repris en KPI (`T5.md:1040`) — _« Part de gris dans l'organigramme sans enrichissement | ratio | > 60 % | **le générateur invente-t-il** »_ — et en règle dure du ticket (`T5.md:1323`) : _« sans enrichissement lancé, au moins 60 % des nœuds sont de rôle `inconnu`. Un test le vérifie sur les 7 comptes de référence. »_

Ce que le dépôt porte — `apps/web/src/features/accounts/view/account-detail/tabs/organigramme/orgGraphData.ts:92-103` :

```ts
export const MOSTLY_INFERRED_RATIO = 0.6
export function isMostlyInferred(verified: number, inferred: number): boolean | null {
  const total = verified + inferred
  if (total === 0) return null
  return inferred / total >= MOSTLY_INFERRED_RATIO
}
```

appelé en `:196` avec `isMostlyInferred(verifiedEdges.length, inferredEdges.length)` et rendu en étiquette par `OrgGraphViews.tsx:120-122`.

**Trois transpositions, toutes silencieuses** — et le commentaire du code les avoue à moitié (`orgGraphData.ts:82` : _« Restauré le 26/08 depuis la spécification du 21/08, qui l'écrivait comme un garde-fou d'honnêteté : "≥ 60 % de nœuds gris sur un organigramme non enrichi" »_) :

|                  | La source demande                                                                              | Le dépôt fait                                                                                         |
| ---------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Dénominateur** | les **nœuds** (personnes)                                                                      | les **arêtes** hiérarchiques                                                                          |
| **Numérateur**   | les nœuds de **rôle de décision `inconnu`**                                                    | les arêtes de **provenance inférée**                                                                  |
| **Sens**         | un **plancher qui accuse le générateur** — sous 60 % de gris, le prompt invente, on le corrige | un **plafond qui informe le lecteur** — au-delà de 60 % d'arêtes devinées, la carte porte une mention |
| **Condition**    | _sans enrichissement lancé_                                                                    | aucune condition d'enrichissement                                                                     |
| **Où**           | test sur les 7 comptes de référence, côté générateur                                           | rendu, côté web                                                                                       |

Conséquence mesurable : un graphe dont **toutes** les arêtes seraient officielles (`mostlyInferred = false`, aucune mention) peut porter **100 % de personnes colorées** d'un rôle de décision attribué au titre, sans enrichissement. La règle qui devait interdire exactement ça ne s'applique nulle part. La coloration se fait en `apps/ia/app/services/org_graph_assembler.py:276-279` :

```py
def _decision_roles(contact: dict[str, Any]) -> list[str]:
    role = str(_get(contact, "role") or "").strip().lower()
    mapped = _ROLE_TO_CONTRACT.get(role)
    return [mapped] if mapped else []
```

— le rôle de décision est dérivé du **titre**, c'est-à-dire d'un signal d'**identité**. Aucune garde ne compte les gris.

**C'est la décision n°6 du paquet neuf, sur l'axe RÔLE au lieu de l'axe RELATION.** « Une preuve d'IDENTITÉ ne prouve jamais une RELATION » — elle ne prouve pas davantage un **rôle de décision**. Le paquet neuf va corriger `reportingTo` ; la même faute vit sur la coloration, et le garde-fou qui l'aurait vue a été transposé sur les arêtes.

##### O2 — `reports_to` : la preuve d'identité EST la preuve de relation, et sa fraîcheur est affirmée sans date (P0, déjà signalé le 22/07)

`apps/ia/app/services/org_graph_assembler.py:557-569` :

```py
mgr_id = _resolve_manager(_get(c, "reportingTo", "reporting_to"))
if mgr_id and mgr_id != pid:
    candidates.append({
        "fromId": pid, "toId": mgr_id, "relation": "reports_to",
        "sources": evidence or [EdgeSource(id=f"s-{pid}-mgr", kind=kind, fresh=True)],
        ...
    })
```

Deux défauts sur la même ligne, et c'est **exactement l'arête que le paquet neuf classe P0** :

1. `kind` est la provenance du **contact** (apollo / pappers / …). En l'absence d'autre preuve, la preuve de l'**identité de la personne** est reversée telle quelle comme preuve du **lien de rattachement**. Même motif en `:551` (`member_of`) et `:531` (sources de la personne).
2. `fresh=True` est **affirmé en dur, sans aucune date**. Or `org_resolver.py:123` fait `fresh_date=any(s.fresh for s in sources)`, et `org_confidence.py` accorde `W_FRESH_DATE = 10`. **Chaque arête `reports_to` sans preuve gagne +10 points de confiance pour une fraîcheur qu'elle ne peut pas prouver**, sur une échelle où `VERIFIED_MIN = 90`.

Ce n'est pas neuf : `agent_docs/audit-org-mapping-2026-07-22.md:164-165` l'écrivait le 22 juillet — _« Date : jamais (`OrgSource.date` sans aucun producteur ; pire, la fraîcheur est affirmée en dur `fresh=True`) »_, et en réserve du critère 8 : _« le +10 de fraîcheur est accordé sans date — un fait non prouvé entre dans le score »_. **Cinq semaines plus tard c'est toujours là**, sur les deux arêtes que le chantier neuf va toucher. Ni `archive-05`, ni le tracker du tome 5 ne le mentionnent.

Le correctif partiel existe et montre la voie : `:471` fait déjà `EdgeSource(id=sid, kind="official_site", fresh=_is_fresh(official["date"]))`. Les trois autres sites ne l'ont pas suivi.

##### O3 — Ce que chaque nœud doit TOUJOURS porter (`T5.md:804-813`)

| Élément                     | Toujours        | Si connu               |
| --------------------------- | --------------- | ---------------------- |
| Intitulé du rôle            | ✓               | —                      |
| Couleur de rôle de décision | ✓               | —                      |
| Nom                         | —               | ✓ après enrichissement |
| **Source de l'inférence**   | **✓**           | —                      |
| **Date de la source**       | **✓**           | —                      |
| **Badge « déduit »**        | **✓ si inféré** | —                      |

Trois obligations _toujours_. `audit-org-mapping-2026-07-22.md:33` et `:164` les donnent **MANQUANTES** (`sources: []` en dur, `OrgSource.date` sans producteur). GA-50 (`apps/web/src/architecture/org-link-provenance.test.ts`) tient depuis le 28/08 l'origine du **trait**, pas la source ni la date du **nœud**, et pas de badge « déduit ». La demande de la source n'est reprise dans aucun tracker.

##### O4 — Le chemin recommandé a TROIS formes, et il part de TOI (`T5.md:815-831`)

```
  TOI ──(relation, mars 2026)──▶ Claire M. ──(même équipe)──▶ Head of Data
       ⚠ relation de 5 mois, à revalider
```

| Forme                  | Quand                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| **Relation directe**   | un contact existe dans la couche zéro                                               |
| **Relation à un saut** | un contact connaît quelqu'un de l'entité cible                                      |
| **Entrée froide**      | aucune relation — on cible le rôle le plus accessible, **et on le dit sans détour** |

Le dépôt (`apps/api/src/modules/org-graph/org-graph-path.ts`) ordonne les personnes **à l'intérieur** du compte par rôle d'achat, avec un garde-fou froid/chaud. Il ne modélise ni le nœud « TOI », ni le saut par un tiers, ni la **date de la relation** avec son avertissement de péremption. `entrée froide`, `un saut`, `introduction` : zéro occurrence. C'est le croisement couche zéro × organigramme (U26/U29 du tome 1) posé sur la carte, et il n'existe nulle part.

##### O5 — Le code couleur (`T5.md:222`)

`§14.6` demande **deux** ajustements. Le tracker du tome 5 répond au premier (le renommage, _sans objet_) et **ne nomme pas le second** : _« Adopter le code couleur de Pariente, qui rend la carte lisible en une seconde. »_ `audit-org-mapping-2026-07-22.md:107` et `-maquettes:89` le donnent MANQUANT (« aucun encodage visuel de la famille métier »). Item perdu entre deux trackers.

##### O6 — ⚠️ L'archive CONTREDIT la décision n°4 du paquet neuf : l'arbre est L0-**L5**, pas L0-L4

Le paquet neuf tranche « L'arbre est L0-L4 ». Le dépôt porte **six** bandes, et la sixième est chargée de sens :

`apps/ia/app/services/org_graph_assembler.py` (`_ACCESS_BY_LEVEL`) : `L4:90 · L3:85 · **L5:70 — achats, canal parallèle** · L2:65 · L1:45 · L0:25`, et le commentaire cite l'ontologie p7 : _« l'opérationnel (L3/L4) est la porte d'entrée, la gouvernance (L0/L1) la moins accessible à froid, **les achats (L5) un canal à part** »_. `org-mapping-plan.md:118` fige `level` « fermé sur **L0-L5** ». Le rôle `procurement` est ordonné en avant-dernier dans `org-graph-path.ts:44-53` et gardé par `test_public_sector_procurement_role_is_ranked` (`apps/ia/tests/test_named_account_golden_sets.py:444`).

**Coder L0-L4 retire la bande achats du tri de chemin et casse une garde existante.** À trancher avant d'écrire, pas après. (Sur le reste de la décision 4, aucun conflit : `influencer` est déjà un rôle et non un niveau, `packages/contracts/src/schemas/org-graph.ts:55-65`.)

##### O7 — Le plafond d'affichage sur un groupe géant (`T5.md:1051`)

_« Groupe à 1 000 filiales (VINCI) → **4 entités maximum affichées**, les mieux scorées, avec "+ 996 autres" »_, et son hypothèse jumelle `T5.md:1465` (_« le budget de 120 s tient-il sur un groupe à 1 000 filiales ? »_). C'est la contrainte de la vue focale — la décision n°3 du paquet neuf. Nommée nulle part.

##### Ce que l'archive CONFIRME au paquet neuf (à réutiliser, pas à réinventer)

- **Décision 5** — « un bloqueur n'entre jamais dans le chemin mais on ne falsifie pas la structure » : la source la pose deux fois, en `T5.md:1239` (erreur n°9 — _« Confondre RH et acheteur réel → badge "oriente, ne décide pas" »_, un badge qui reste dans la structure et sort du chemin) et `T5.md:831` (l'entrée froide s'affiche sans détour). Le dépôt tient déjà le second volet (`blocker: Number.POSITIVE_INFINITY`, `org-graph-path.ts:52`) ; le badge « oriente, ne décide pas » n'existe pas.
- **Décision 7** — corrections sourcées, versionnées, réversibles : `T5.md:1109-1116` (versions datées, aucune n'écrase la précédente) + `T1.md:1240-1244` (« Ce n'est pas exact » → provenance `human`, jamais écrasée).
- **Décision 8** — réutiliser : `org-mapping-plan.md:10-26` liste ~70 % de primitives déjà là.

---

#### Le dénombrement reconstruit

Depuis la matière brute uniquement.

| Tome             | Ce que la source dénombre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T1** (1285 l.) | 6 demandes explicites · 7 non-dits · 6 points gardés / 4 refusés / 5 manques · 3 champs + 1 objet · **8 blocs de barème dont 20 pts jamais calculés** · **5 axes A1-A5 (6/5/5/3/1)** · 4 états de verrouillage · **table de proportion 4×4** · 4 coûts d'accès typiques · **7 modes d'entrée** · 3 modes de recherche · 5 filtres · 3 tris · 4 familles · 4 `relation_kind` · 6 sources branchées · **5 demi-vies** · 3 principes communautaires · **40 use cases (8/7/9/6/4/6)** · **6 cadences de péremption du refus** · 11 écrans · 4 paliers de profondeur · 5 situations d'onboarding · 4 familles de requêtes · 13 tickets `BEL-ACC-*` · **10 décisions D51-D60**                                                                                                                                                                                                                          |
| **T3** (1110 l.) | 9 faits de benchmark sourcés · **6 proxies pondérés** · **6 barèmes de statut** · **6 paliers de taille** · **1 formule + ses bornes** · **4 classes + « non estimable »** · 281 comptes / 6 statuts / 164 secteurs · 20 comptes les plus accessibles · **13 comptes Pariente avec leur verdict humain** · **6 signaux correcteurs datés** · 7 surfaces · 4 candidats de nom · **11 colonnes** · 5 filtres · 4 familles · 4 états d'écran · **8 profils × 8 axes = 64 poids** · 5 questions d'accueil · 8 règles de déduction ordonnées · 8 stratégies · 4 tickets `BEL-ADR-*` · **7 KPI** · **12 cas limites** · 3 décisions                                                                                                                                                                                                                                                                     |
| **T4** (1038 l.) | 3 rôles simultanés d'une ESN · 477 entités · **9 étages d'enrichissement** · ~40 champs `esn_directory` avec leur decay · **12 signaux de débordement** · **4 axes de débordement (35/25/25/15)** · 3 règles de mesurabilité · **8 indicateurs territoriaux avec formule** · 5 blocs Territoire · **8 étapes du cycle partenaire** · 3 onglets · **10 automatisations PAR-01..10** · 7 blocs de fiche · **5 axes de score partenaire (25/20/20/25/10)** · 4 recommandations · 5 tickets · **14 cas limites** · **8 KPI** · 4 décisions                                                                                                                                                                                                                                                                                                                                                            |
| **T5** (1478 l.) | 5 critères Pariente · **12 patterns** · 5 faiblesses challengées · **8 blocs de plan (7 générables)** · **6 axes de score d'entité (25/25/20/15/10/5)** · 4 points du premier mouvement · **6 catégories d'interdit + leurs seuils** · **7 phases (5 déterministes) + budget dur 120 s** · **golden set de 30 comptes + 8 assertions + seuil d'activation 24/30** · **7 plans travaillés** · **§27 ORGANIGRAMME : 5 rôles + 6 lignes d'inférence + règle des 60 % + 6 éléments par nœud + 3 formes de chemin** · 3 colonnes de board · **7 règles de bascule + plafond 8** · **8 questions du Sprint 3** · **12 phrases par univers** · **5 axes de fit (30/25/20/15/10)** · **6 déclencheurs de rafraîchissement chiffrés en crédits** · 8 blocs de brief · **12 erreurs dont 6 bloquantes** · 2 rôles de répartition + 2 vues · 5 tickets · **8 KPI** · 9 cas limites · **6 décisions D77-D82** |

**Le tracker `archive-05` (122 lignes, 4 sections)** : mesure les 2 CSV (§1), diffe les sommaires et statue 3 cas nommés (§2), valide les 4 résolutions du README (§3), pose 4 refus (§4).
**Il ne cite pas un seul axe, pas un seul barème, pas un seul seuil, pas un seul KPI, pas un seul cas limite.** Il délègue aux quatre trackers de tome. Trois d'entre eux (T1 548 l., T3 133 l., T4 144 l.) sont sérieux et inventoriés item par item ; **le quatrième, celui du tome 5, fait 102 lignes pour 1478 de source et n'ouvre jamais PARTIE G**. C'est précisément là que vit l'ORGGRAPH.

---

#### Ce que le tracker ne mentionne NULLE PART

Colonne « Pourquoi c'est un trou » : _absent de `archive-05`_ **et** absent du tracker de tome correspondant **et** vérifié absent du code (ou présent sous une autre forme).

| #      | Ce que la source demande                                                                                                                                                    | Où                                                           | Pourquoi c'est un trou                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | La règle des 60 % de gris est un **plancher sur le GÉNÉRATEUR**, mesuré sur les **nœuds de rôle `inconnu`**, sur les **7 comptes de référence sans enrichissement**         | `T5.md:798-802`, `:1040`, `:1323`                            | Le nombre 0.6 a survécu, la règle non : `orgGraphData.ts:92-103` en fait un **plafond d'étiquette** sur les **arêtes inférées**. Numérateur, dénominateur et sens changés. Aucun test côté générateur. Aucun tracker ne le nomme                                                                                                                                                                                                              |
| **2**  | Un lien de rattachement porte **sa propre** preuve, et une date réelle                                                                                                      | `T5.md:806-813`                                              | `org_graph_assembler.py:565` reverse la preuve d'**identité** du contact comme preuve du lien `reports_to`, **et** pose `fresh=True` sans date → **+10 de confiance fabriqués** (`org_resolver.py:123` → `org_confidence.W_FRESH_DATE`). Signalé le 22/07 (`audit-org-mapping-2026-07-22.md:164-165`), jamais repris. **C'est le P0 du chantier neuf**                                                                                        |
| **3**  | Chaque nœud porte **toujours** : source de l'inférence · date de la source · badge « déduit »                                                                               | `T5.md:804-813`                                              | `sources: []` et `OrgSource.date` sans producteur (audit du 22/07, l. 33). GA-50 tient l'origine du **trait**, pas du **nœud**. Aucun badge « déduit »                                                                                                                                                                                                                                                                                        |
| **4**  | Le chemin recommandé a **3 formes** — directe / à un saut / **entrée froide** — part de **TOI**, et affiche la **date** de la relation avec son avertissement               | `T5.md:815-831`                                              | `org-graph-path.ts` n'ordonne que l'intérieur du compte. `entrée froide`, `saut`, nœud « TOI » : zéro occurrence                                                                                                                                                                                                                                                                                                                              |
| **5**  | Adopter le **code couleur** de Pariente                                                                                                                                     | `T5.md:222`                                                  | `§14.6` demande deux ajustements ; le tracker du tome 5 ne répond qu'au premier (l. 34, l. 73-75). MANQUANT à l'audit du 22/07 (l. 107)                                                                                                                                                                                                                                                                                                       |
| **6**  | Sur un groupe à 1 000 filiales : **4 entités maximum**, « + 996 autres »                                                                                                    | `T5.md:1051`, `:1465`                                        | La contrainte de la vue focale (décision n°3 du paquet neuf). Nommée nulle part                                                                                                                                                                                                                                                                                                                                                               |
| **7**  | **T6 de `BEL-ADR-001` : les 13 comptes Pariente → concordance ≥ 12/13 avec la note humaine**                                                                                | `T3.md:1035`, verdicts humains en table `T3.md:218-233`      | **Aucun test.** `archive-05` n'en parle pas. Le tracker du tome 3 (item 13) le classe PARTIEL avec une raison **fausse et hors sujet** : « SEB, Fnac, VINCI et Pernod ne sont pas dans le CSV » — or **VINCI y est deux fois** (l. 252, 282), et surtout **le verdict humain est dans le TOME, pas dans le CSV**. Le golden est constructible tel quel. C'est le seul dispositif de vérification du modèle avant production, et il est perdu  |
| **8**  | Les **7 plans travaillés** sont le jeu de référence du plan de compte (`§17` : « comptes du document Pariente : 13 »)                                                       | `T5.md:280-367`, `:446-751`, `:381-404`                      | Le tracker `archive-05` (§2) les convertit en **archétypes d'org-mapping** et les mesure contre `apps/ia/tests/test_named_account_golden_sets.py` — un test qui garde TF1/SG/Crédit Agricole/SNCF/PME/public, c'est-à-dire la phase 7 de `org-mapping-plan.md`, **pas** la génération de plan ni la barrière. Substitution : « A est équivalent à B » dispense de lire A. Les **8 assertions** de `T5.md:393-404` ne sont rejouées nulle part |
| **9**  | La **bibliothèque d'angles** : 12 phrases par univers, structure `preuve + transposition + engagement`, et le **refus de générer sans preuve mobilisable**                  | `T5.md:905-943`                                              | Absent du code (`openingLine`/`angleLibrary`/phrase par univers : zéro) et de tous les trackers. Le refus explicite (« Aucune preuve mobilisable dans cet univers ») est la partie qui protège de la promesse creuse                                                                                                                                                                                                                          |
| **10** | Les **6 déclencheurs de rafraîchissement** avec leur coût en crédits (1/2/2/1/1/4), et le tiroir « ce qui a changé » dont la section **INCHANGÉ est obligatoire**           | `T5.md:1117-1151`                                            | Lot E du tracker du tome 5 n'a livré que le **badge de fraîcheur**. Aucun déclencheur, aucun tiroir. Or la section « inchangé » est ce qui distingue « j'ai vérifié » de « je n'ai rien regardé »                                                                                                                                                                                                                                             |
| **11** | Les **deux vues filtrées par rôle** (arbitrage / exécution) et la **règle de non-chevauchement** — un compte en attente d'arbitrage n'apparaît pas dans la file d'exécution | `T5.md:1264-1273`, exigée en PR6 du ticket `T5.md:1436-1437` | Lot D livré sans elles. Zéro occurrence. Sans la règle, deux personnes travaillent le même compte sans le savoir                                                                                                                                                                                                                                                                                                                              |
| **12** | La **grille de 8 questions du Sprint 3**, et « **la réponse à la question 3 alimente `access_fact`** »                                                                      | `T5.md:882-899`                                              | `access_facts` **existe** (livré au tome 1) ; **ce producteur-là n'existe pas**. Classique « colonne lue, jamais écrite » : la source déclarative la plus fiable (elle vient du compte lui-même) n'a aucun chemin d'écriture                                                                                                                                                                                                                  |
| **13** | **6 erreurs bloquantes** sur 12 : n° 1, 3, 6, 7, 10, 12                                                                                                                     | `T5.md:1229-1244`                                            | Le tracker du tome 5 (D81) n'en retient que deux (« celles qui écrivent » : 9ᵉ compte en Focus, no-go sans motif). **Quatre refus disparaissent sans être nommés** : réintroduire un compte écarté (1), plan complet sur un Sprint 3 (3), message sans rôle ni signal ni preuve (7), contacter hors périmètre (12). Item traité en bloc                                                                                                       |
| **14** | La **répartition Ilan / Eris** est un modèle générique de 7 lignes (qui décide / qui prépare)                                                                               | `T5.md:1250-1282`, escalade `:1276-1283`                     | Ni tracker ni code. C'est le pendant organisationnel du n° 11                                                                                                                                                                                                                                                                                                                                                                                 |
| **15** | Les **5 axes du fit** nommés (Sujets 30 · Maturité 25 · Taille de mission 20 · Précédent 15 · Appétence externe 10) et la phrase franche sous 40                            | `T5.md:1066-1088`                                            | Le tracker (T5-B) refuse **un second score** — arbitrage légitime — mais jette du même geste les **axes**. Or la doctrine du dépôt dit « un score n'est jamais nu, ses axes nommés ». `fitTierFor` dérive du score d'intérêt et n'expose pas ces cinq axes. Refuser le nombre n'autorise pas à perdre la décomposition                                                                                                                        |

---

#### Renvois morts, contradictions, blocs non éclatés

**Contradiction n°1 — jamais nommée : le CSV contredit deux des sept plans travaillés du même paquet.**

Le tracker mesure la **forme** du CSV (« 51 tuples numériques distincts pour 281 lignes » — **mesure revérifiée, exacte**) et refuse l'ingestion. Très bien. Mais personne n'a confronté le CSV aux **cas travaillés livrés dans la même archive** :

| Compte               | `comptes-adressables-v0.csv`                                | `T5.md` (plan travaillé)                                                     | Accord              |
| -------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| Agicap               | l. 39 — 1.0 · **A**                                         | `§23` — 1,1 · **A**                                                          | ✓                   |
| Club Med             | l. 195 — 3.7 · **B**                                        | `§21` — 3,9 · **B**                                                          | ✓                   |
| Groupe Bel           | l. 206 — 4.2 · **B**                                        | `§22` — 4,4 · **B**                                                          | ✓                   |
| **Fortuneo**         | l. 170 — **2.5 · classe A « Ouvert probable »**             | `§25` — **5,8 · classe C, « à qualifier »**                                  | ✗ **contradiction** |
| **Vinci Autoroutes** | l. 252 — **6.8 · classe C « Semi-ouvert / intermédiaire »** | `§20` — **CIBLE #1, score d'entité 88/100, « la porte digitale du groupe »** | ✗ **contradiction** |
| Groupe SEB           | absent                                                      | `§16` — 4,6 · B                                                              | —                   |
| Fnac Darty           | absent                                                      | `§24` — 6,4 · C                                                              | —                   |

Le cas VINCI est celui que les deux tomes appellent _« le cas qui prouve la valeur du modèle »_ (`T3.md:236-242`) et qui justifie `BEL-ADR-003`, _« le ticket le plus important du chantier »_. Le CSV du même paquet range Autoroutes en « il faut un chemin » là où le plan en fait la porte n°1. La cause est identifiable — le CSV applique la barrière /10 à une **entité** alors que le tome applique le score d'entité /100 — mais **rien dans l'archive ne dit qu'il ne faut pas lire les deux nombres sur la même ligne**, et c'est exactement la confusion d'échelles que le tracker dénonce ailleurs (« le score du dépôt est sur 20, pas sur 10 »).

**Contradiction n°2 — résolue en silence entre deux tomes.** `T1.md:247-256` pose l'adressabilité en **5 axes / 20 points**, dont `A1 · Verrouillage · 6 pts`. `T5.md:62-69` déclare cette fusion **erronée** (« Le PDF 11 les avait fondus. C'est une erreur, et le terrain le corrige ») et ouvre `D71`. Le tracker du tome 3 tranche bien D71 (« deux ; la barrière ALIMENTE A1 »), mais `archive-05` — le tracker qui porte le `DONE` de l'archive — présente les quatre résolutions du README comme « TENUES » sans mentionner qu'une contradiction interne au paquet a dû être arbitrée pour cela.

**Renvoi mort n°1 — un drapeau sans condition de levée.** `ANTI_ADVICE_ENABLED = false` est livré (tracker tome 5, T5-C) et la condition de sortie est citée dans le tracker : 24/30 comptes jugés pertinents, aucun faux (`T5.md:406-412`). Mais le **golden set de 30 comptes est explicitement refusé** (« il demande une notation humaine, pas du code », l. 68). Le drapeau ne peut donc **jamais** être levé : la condition renvoie à un jeu qui n'existe pas et qu'on a décidé de ne pas construire. Un interrupteur éteint avec une condition d'allumage inatteignable est un interdit permanent qui ne se dit pas.

**Renvoi mort n°2.** `T1.md:461` renvoie le score partenaire à « 5 axes (PDF 9 §26.4) » et `T1.md:195` / `:841` fait dépendre `BEL-ACC-006` de `BEL-R2R1-001` (objet Partner, PDF 9) — _« jamais construit »_. Le tome 4 a livré `partner_relations` avec 5 axes ; le renvoi au PDF 9 n'a jamais été fermé, et `archive-05` ne le referme pas.

**Bloc non éclaté n°1 — `archive-05` §2, « les sommaires ont été diffés ».** Le tracker démontre que la seconde série §12-19 du tome 1 est bien couverte (elle l'est : le tracker du tome 1 fait 548 lignes). Puis il applique le **même verdict de non-troncature** au tome 5 (« §0.1-0.5 puis §14-45 … le contenu est continu ») — ce qui est vrai de la **numérotation** et faux de la **couverture** : le contenu est continu et le tracker du tome 5 s'arrête à 102 lignes, sans jamais ouvrir PARTIE G. Vérifier qu'un fichier n'est pas tronqué n'est pas vérifier qu'il a été lu.

**Bloc non éclaté n°2 — `T4.md:1035`, D62.** « `esn_directory` partagé ? **oui**, avec **deux catégories de tables déclarées** (tome 7) ». Le tracker du tome 4 tranche D62 « oui » et ne reprend pas la seconde moitié de la phrase — la déclaration de catégorie de table, qui est ce qui empêche une donnée d'espace de fuir dans une table partagée. (Le dépôt a bien une garde de portée, mais le lien explicite demandé par la source n'est écrit nulle part.)

**Aucun conflit avec la doctrine.** Vérifié ligne à ligne : les quatre tomes **refusent** activement la probabilité (`T1.md:132-155` refuse « 87 % » et le remplace par un faisceau compté ; `T3.md:1046` et `T5.md:1342` en font un interdit de ticket), imposent « non mesuré ≠ 0 » partout (`T1.md:247`, `T3.md:1012-1016`, `T4.md:811`), sortent un axe non mesurable du dénominateur (`T3.md:1013`), et refusent de produire un score sous 3 proxies (`T3.md:1015`) — soit exactement « sous 3 axes il n'y a pas de score ». **Rien à refuser dans cette archive.**

---

#### Verdict : le `DONE` est-il défendable ?

**Non — et le mot qui manque au tracker est celui qui donne son nom à l'archive.**

Ce qui est solide, et qu'il faut garder : les mesures du §1 sur les deux CSV sont **exactes** (les 51 tuples, revérifiés ; les 302 domaines devinés), le refus d'ingérer les scores est **juste** et bien motivé (`prior_is_not_fact`, échelles /10 ≠ /20), et les trackers des tomes 1, 3 et 4 sont de vrais inventaires item par item, avec leurs refus nommés. Sur l'accessibilité, la barrière, le territoire et le second marché, le `DONE` tient largement.

Ce qui l'invalide :

1. **L'archive s'appelle `ORGGRAPH` et personne n'a ouvert la partie OrgGraph.** `T5.md` PARTIE G (§27) porte sept exigences ; le tracker `archive-05` en écrit une ligne (« TENUE »), le tracker du tome 5 en écrit deux, sur le seul point déclaré _sans objet_. Le paquet de preuves de code de l'archive ne contient **aucun** fichier OrgGraph. Un verdict « TENUE » sans corpus n'est pas une vérification, c'est une reconduction.
2. **Le garde-fou central de la partie perdue est dans le dépôt sous une forme qui ne garde pas la règle.** `MOSTLY_INFERRED_RATIO = 0.6` compte des arêtes inférées et informe le lecteur ; la source demandait de compter des nœuds gris et d'accuser le générateur. C'est le motif « une garde protège une règle, elle ne l'invente pas », sur le nombre le plus visible du tome — et il a rendu invisible le fait que la coloration des rôles se fait au titre, sans preuve.
3. **Le seul dispositif de vérification avant production est perdu deux fois** : les 13 comptes Pariente (concordance ≥ 12/13) et les 8 assertions du golden set de 30. Le premier est écarté sur une raison factuellement fausse ; le second est converti en archétypes d'org-mapping et déclaré couvert. Ce dépôt a déjà payé cette perte-là.
4. **Un défaut P0 du chantier qui démarre aujourd'hui est dans le dépôt, signalé le 22/07, et aucun tracker de cette archive ne le porte** : `org_graph_assembler.py:565` fait de la preuve d'identité la preuve de la relation `reports_to`, et lui offre +10 de confiance pour une fraîcheur affirmée sans date.

**Ce qui doit remonter avant qu'on code par-dessus, dans l'ordre :** O2 (le `fresh=True` et la preuve d'identité sur `reports_to`) · O1 (rétablir la règle des 60 % sur les nœuds, côté générateur, avec son test sur les comptes de référence) · O6 (trancher L0-L4 contre L0-L5 : la bande achats est câblée et gardée) · O3 et O4 · puis le trou n° 7 (les 13 comptes de référence).
