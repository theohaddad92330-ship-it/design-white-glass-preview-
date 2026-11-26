# Archive 06 — DATAFORGE, multi-domaines, Stelya

> Source : `BELLUMAI_ITERATION_3_06_DATAFORGE_MULTIDOMAIN_STELYA_2026-08-24.zip`
> (137 404 274 octets, 16 fichiers au manifeste — **16 intègres**, SHA-256 recalculé).
> Croisée le 25/08/2026, après `00`, `08`, `01`, `02`, `03`, `04` et `05`.

Deux chantiers clos — **DATAFORGE V10** et l'**addendum Stelya** — plus l'héritage
V9 (188 Mo de CSV) et le transport canonique V10 (345 Mo décompressés).

---

## 1. Le pack V10, mesuré — et le piège que j'ai failli reproduire

### ⚠️ D'abord la méthode, parce qu'elle a manqué de peu

Ma **première** mesure découpait les lignes sur `;`. Elle a rendu 79 274 lignes,
1 198 comptes, et une colonne `account__siren_siret` contenant… de la prose
(« Société Générale → ` internal-vs-external delivery` »).

C'était **faux** : le fichier a des champs guillemetés qui contiennent des `;`.
Publier ces chiffres aurait été exactement le défaut que je venais de reprocher à
l'archive 04 — un artefact d'analyse naïve pris pour une mesure. Reparsé avec un
vrai lecteur CSV (guillemets, doublage, sauts de ligne inclus), les nombres
changent. **Les trois mesures ci-dessous viennent du parseur correct.**

### Ce que le fichier contient

| Mesure                           | Valeur                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------- |
| Lignes                           | **78 870** — soit exactement 1 195 × 66                                             |
| Comptes distincts                | **1 195**                                                                           |
| Domaines distincts               | **66**                                                                              |
| Colonnes                         | 158                                                                                 |
| `evidence_tier`                  | **D = 76 871 (97,5 %)** · C = 1 451 (1,8 %) · B = 412 (0,5 %) · **A = 136 (0,2 %)** |
| `scoring_policy`                 | `PRIOR_ONLY__RECALCULATE_WITH_SELLER_…` sur **100 % des lignes**                    |
| SIREN à 9 chiffres               | **4** (corrigé le 29/08 — voir plus bas)                                            |
| SIRET à 14 chiffres              | **0**                                                                               |
| Colonne SIREN vide               | 1 161 comptes                                                                       |
| Colonne SIREN portant un crochet | 34 comptes — dont **4 SIREN RÉELS** et 30 marque-places                             |

### Ce que ces trois nombres décident

**Le fichier ne demande pas à être cru — il le dit sur chaque ligne.** Une
colonne `scoring_policy` valant `PRIOR_ONLY__RECALCULATE_WITH_SELLER_…` sur
78 870 lignes sur 78 870, c'est une déclaration : ces scores sont des _a priori_
à recalculer avec le profil du vendeur, pas des observations.

**97,5 % du pack est en Tier D**, que le README de l'archive qualifie lui-même de
« prior interne ». Le Tier A — la preuve — pèse **136 lignes sur 78 870**.

⚠️ **CORRIGÉ LE 29/08/2026 — ce zéro était faux, et il fondait un refus.**

Ce paragraphe disait « zéro identifiant légal », notait que la mémoire du chantier
en comptait **4**, et tranchait pour son propre zéro en le déclarant « reproductible ».
Re-mesuré depuis le CSV canonique (345 Mo, lu en entier) : **la mémoire avait raison.**

Quatre SIREN réels : **DF-0014** et **DF-0415** (le même, `352463574`), **DF-0758**
`542052766`, **DF-0827** `432766947` — tous `[confirmé]`, avec leur source.

**D'où venait le zéro** : les quatre vrais portent des crochets, exactement comme les
marque-places (`352 463 574 (RCS Bourg-en-Bresse) [confirmé — mentions légales]`).
Un classement par « contient un crochet » les range donc avec eux. Le code, lui,
lisait juste — `sirenFrom` comptait déjà les chiffres. **C'est le compte écrit à
côté du code qui mentait**, et le contrôleur interne portait la même erreur (« 34 »).

Ce que ça coûtait : ce zéro justifiait le refus « Compléter les SIREN depuis ce
fichier ». Il justifiait aussi de ne pas regarder que **DF-0014 et DF-0415 sont le
même groupe** — or `priorsForSiren` faisait un `findOne` sur un index non unique,
donc deux comptes d'une même grappe pouvaient recevoir les priors l'un de l'autre.
40 grappes, 85 comptes concernés. Corrigé par le lot D6 (`is_cluster_primary`,
écrite par le pack et jamais lue jusque-là).

---

## 2. Les cinq résolutions du README

| Résolution                                                          | Verdict                                                                                                                                                                     |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « V10 prévaut sur V9 »                                              | **TENUE** — le chantier V10 est le seul branché ; le V9 est ici en héritage                                                                                                 |
| « Tier D est un **prior interne** »                                 | **TENUE, et gardée** — `prior_is_not_fact` (`dataforge-priors-stay-internal.spec.ts`). Vu la mesure (97,5 % en D), c'est l'invariant qui protège le plus de lignes du dépôt |
| « Procurement route V10 est **seed-only** »                         | **TENUE** — les routes d'achat servent de graine à l'analyse, jamais de fait affiché                                                                                        |
| « Le secteur Project/Mission ne remplace pas le secteur corporate » | **TENUE** — c'est `c05`, et l'archive 00 a livré le chemin d'écriture qui manquait : rien n'est pré-coché depuis le compte, le repli est NOMMÉ à l'écran                    |
| « Feedback Stelya anonymisé / généralisé »                          | **TENUE** — le prisme industriel est un 8ᵉ pack de domaine, sans référence nominative                                                                                       |

### Les trois instructions

| Instruction                                            | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| « Ne jamais ingérer le CSV comme table métier unique » | **TENUE** — staging + résolveur, jamais d'écriture directe                                                                                                                                                                                                                                                                                                                                                                           |
| « Entity Resolver par SIREN/alias »                    | **TENUE** — et la mesure ci-dessus dit pourquoi il était indispensable : le pack n'apporte aucun SIREN                                                                                                                                                                                                                                                                                                                               |
| « Conserver goldens IT et **ajouter non-IT** »         | **TENUE** — 6 fichiers de test dédiés au prisme (`test_industrial_decision_role`, `test_offer_domains`, `test_offer_portfolio_focus`, `test_portfolio_context`, `test_domain_focus`, `test_domain_focus_user_prompts`) et 6 autres qui exercent explicitement un vendeur NON-IT (`test_desilo_phase3/4_deterministic`, `test_domain_job_filters`, `test_domain_market_filters`, `test_it_labels_outside_lens`, `test_offer_domains`) |

---

## 3. Ce qu'on ne promet pas

| Ce qu'on ne fait pas                  | Raison                                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingérer le transport canonique V10    | 97,5 % de Tier D et une `scoring_policy` qui dit `PRIOR_ONLY` sur 100 % des lignes. Le pack lui-même refuse d'être une table métier.                                                                                                                                       |
| Compléter les SIREN depuis ce fichier | Il n'en porte aucun, et il l'écrit : `[à compléter lot 2 — Pappers/Sirene]`. La voie est le résolveur d'entité, déjà livré.                                                                                                                                                |
| Rejouer l'héritage V9                 | « V10 prévaut sur V9 » est une résolution de l'archive elle-même. Les 188 Mo du V9 sont conservés comme archive, pas comme source.                                                                                                                                         |
| Mesurer le `MASTER_PACK` (102 Mo)     | Le transport canonique EST la voie d'intégration déclarée ; le master pack est l'amont. Le mesurer demanderait de le décompresser entièrement pour un chiffre qui ne change aucune décision — les trois résolutions ci-dessus tiennent déjà. **Non mesuré**, dit tel quel. |
