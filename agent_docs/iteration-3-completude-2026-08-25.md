# Itération 3 — complétude par archive

> Mesuré le 25/08/2026, après traitement des dix archives du dossier Drive
> `1QgndnItlLAeH24ecZSyMUFQBAWIUvlMR`.

---

## 1. Ce que « complétude » veut dire ici, et ce qu'elle ne dit pas

Un pourcentage sur un chantier n'a de sens que si sa définition tient en une
ligne. Celle-ci :

> **complétude = (items de la source qui portent un STATUT avec sa preuve)
> ÷ (items de la source)**

Ce que ça mesure : **l'archive est-elle épuisée ?** — c'est-à-dire, reste-t-il
une ligne dont personne ne sait si elle est livrée, refusée ou différée.

Ce que ça **ne** mesure **pas** : le produit. Une archive peut être à 100 % avec
des exigences non livrées, si chacune porte son refus ou son report écrit. C'est
même le cas normal : sept des dix archives sont des documents dont l'essentiel
était déjà fait ou délibérément refusé.

**Deux colonnes valent mieux qu'une**, et le tableau les sépare : ce qui est
**statué** (l'archive est close) et ce qui est **livré** (le produit a changé).

---

## 2. Le tableau

| Archive                                 | Nature                            | Items                                 | Statués | **Complétude** | Livré en code                                                                                                                       | Reste, et où                                                      |
| --------------------------------------- | --------------------------------- | ------------------------------------- | ------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **00** Gouvernance                      | 25 contradictions + 11 invariants | 36                                    | 36      | **100 %**      | Registre en code + GA-38 · 2 chemins morts réparés (secteur projet/mission, colonnes industrielles du site) · 1 trou d'autorisation | 1 invariant sans porteur, NOMMÉ (`beta_feedback_is_not_reusable`) |
| **08** Miroir de code                   | Audit                             | 140 miroirs + 5 247 fichiers          | 140     | **100 %**      | — (audit)                                                                                                                           | rien                                                              |
| **01** Architecture / UX                | 4 sources, 50 tickets             | 50 + 30 règles                        | 50 + 30 | **100 %**      | 3 primitives · 3 registres (GA-39/40/41) · 4 comptes faux · jeu de recette des 20 requêtes                                          | 22 règles d'interaction non gardées, chacune nommant son écart    |
| **02** CRM / ATS / matching / missions  | 4 PDF                             | **139**                               | **139** | **100 %**      | **9 défauts d'honnêteté corrigés** (voir §3)                                                                                        | 32 absences, dont 29 en attente d'une décision — §9 du tracker    |
| **03** IA / Laura / observabilité       | PDF 6, PDF 10, Tome 6             | 6 chapitres + 17 métadonnées          | 23      | **100 %**      | `environment` + `release` sur chaque trace Langfuse · l'équivalence fausse corrigée                                                 | 35 interventions métier · 9 surfaces · 15 métadonnées             |
| **04** Intégrations / données / sécu    | PDF 7, Tome 2                     | 3 sections + 8 gardes + 4 résolutions | 15      | **100 %**      | — (les 8 gardes existaient déjà)                                                                                                    | 4 champs sur 7 d'une fiche source                                 |
| **05** Accessibilité / plan / 2ᵉ marché | Tomes 1, 3, 4, 5 + 2 CSV          | 4 sommaires + 758 lignes de données   | tous    | **100 %**      | — (ingestion **refusée**, mesures à l'appui)                                                                                        | 1 golden « filiale de groupe étranger »                           |
| **06** DATAFORGE / Stelya               | V9, V10, addendum                 | 78 870 lignes + 8 résolutions         | tous    | **100 %**      | — (ingestion **refusée** : `PRIOR_ONLY` sur 100 % des lignes)                                                                       | rien                                                              |
| **07** Business / tarifs / démo         | Grille, devis, modèles            | 7 lignes de grille + 7 résolutions    | 14      | **100 %**      | Garde de parité de la remise annuelle                                                                                               | rien                                                              |
| **09** Carte de référence               | Inventaire maître                 | 11 binaires + 15 sections             | 26      | **100 %**      | — (audit) + certificat d'épuisement                                                                                                 | rien                                                              |

**Les dix archives sont à 100 % de statut, et marquées `_DONE` sur le Drive.**
Aucune ligne n'est laissée sans verdict.

---

## 3. Ce que le produit a réellement gagné

Quatorze pull requests. Les neuf corrections de l'archive 02 sont toutes de la
même famille — **un écran qui affirme quelque chose de faux** :

| Défaut                                                | Ce qu'il produisait                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `COALESCE(SUM(...), 0)` sur les 4 chiffres d'affaires | « Encaissé : 0 € » partout, comme un montant mesuré                  |
| `unavailableReason` rendu brut                        | « unavailable » en anglais sur un écran français                     |
| `billing_cadence` ignorée du calcul                   | Une mission au forfait « prête à facturer » tous les mois            |
| Le `else` de `summarizeReadiness`                     | Toute valeur neuve comptée « facturée »                              |
| `truncated` jamais rendu                              | Un journal d'audit tronqué présenté comme complet                    |
| `reactivate()` sans lecture du consentement           | Un talent au consentement expiré remis dans les propositions clients |
| `priority_gate` nulle en démo                         | Un portefeuille où la porte n'a jamais été franchie                  |
| Commission d'intermédiaire absente                    | La marge des missions en sous-traitance **surévaluée**               |
| Paiement et annulation sans geste                     | Deux mesures structurellement vides, et un « facturé » irréversible  |

Plus **deux gardes borgnes** réparées : GA-36 ne lisait que la première colonne
d'un `ALTER TABLE` multi-colonnes (sept colonnes fantômes, dont `paid_at`), et la
garde des `UPDATE … RETURNING` ne regardait qu'en aval — elle signalait donc le
code le plus sûr comme fautif.

---

## 4. Ce qui reste, et pourquoi ce n'est pas un backlog

Trois familles, une seule appelle du code :

1. **Une décision produit** — les 35 interventions métier du tome 6 (c'est un
   second axe, pas un rattrapage), les 9 surfaces de Laura (chacune est un
   écran), la contestation d'une facture (`disputed_at` existe, le geste non).
2. **Une donnée qu'on ne collecte pas** — la satisfaction client et consultant,
   déjà déclarées non mesurables AVEC leur raison ; les cibles chiffrées des
   KPI, qui supposent un champ numérique là où le contrat porte une phrase.
3. **De la traçabilité documentaire** — `BEL-ARCH-004` jamais cité, le persona
   P4, les identifiants `TAL-0x`. Aucun effet sur le produit.

**Le travail restant n'est pas d'écrire du code, c'est de trancher.** C'est la
conclusion du chantier, et elle vaut mieux qu'une liste de 32 tickets.
