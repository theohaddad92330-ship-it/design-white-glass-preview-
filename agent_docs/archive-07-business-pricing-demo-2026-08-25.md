# Archive 07 — business, tarifs, démo, bêta, contexte produit

> Source : `BELLUMAI_ITERATION_3_07_BUSINESS_PRICING_DEMO_BETA_PRODUCT_CONTEXT_2026-08-24.zip`
> (14 727 716 octets, 19 fichiers au manifeste — **19 intègres**, SHA-256 recalculé).
> Croisée le 25/08/2026, après `00`, `08`, `01`, `02`, `03`, `04`, `05` et `06`.

C'est l'archive qui porte le plus de matériau **non technique** : la grille
tarifaire telle qu'elle s'affiche, le seul devis contractuel du corpus, deux
modèles économiques, les captures de la bêta, et la mémoire de l'ancien GPT.

---

## 1. La grille tarifaire de l'image correspond au produit livré

Le README pose une résolution nette : « **aucun ancien prix ne doit être codé
sans lire le repo/backoffice** ». La question n'est donc pas ce que l'image dit,
mais si elle DIVERGE de ce qui est vendu — parce que c'est elle qui circule.

Comparée à `packages/contracts/src/billing/shipped-plan-grid.ts`, ligne à ligne :

| L'image annonce                                          | Le produit livre                                |                                                          |
| -------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| Starter **119 €** HT/mois, 1 utilisateur, **80 crédits** | `priceCents: 11900`, 80 crédits                 | ✅                                                       |
| Starter, siège supplémentaire **+39 €**                  | `extraSeatPriceCents: 3900`                     | ✅                                                       |
| Growth **249 €**, 1 utilisateur, **250 crédits**         | `priceCents: 24900`, 250 crédits                | ✅                                                       |
| Growth, siège supplémentaire **+59 €**                   | `extraSeatPriceCents: 5900`                     | ✅                                                       |
| Team / Enterprise **sur devis**                          | `selfServe: false`                              | ✅                                                       |
| « Crédits non utilisés reportables sur **30 jours** »    | `rollover_credits` + `rollover_expires_at`      | ✅                                                       |
| « Free — 0 € » avec « Explorer la démo »                 | pas un palier : c'est la démonstration publique | ✅ conforme à la résolution « démo simulée ≠ plan Free » |

**Aucune divergence.** C'est notable : sur les neuf archives, c'est la première
capture commerciale qui décrit exactement le produit — le guide produit de
l'archive 01 montrait l'ancienne navigation, et une capture du même paquet
montrait le copilote annonçant des écritures impossibles.

---

## 2. Le défaut trouvé, et il touche le prix annoncé avant paiement

L'image promet « **Facturation annuelle : −20 %** ». Vérifié : la remise existe
partout — mais **pas au même endroit**.

| Consommateur                                     | D'où vient la remise                                  |
| ------------------------------------------------ | ----------------------------------------------------- |
| `apps/api/.../credits/pricing.ts:1`              | `import { ANNUAL_DISCOUNT } from '@bellum/contracts'` |
| `apps/web/.../billing/PlansGrid.tsx:4`           | `import { ANNUAL_DISCOUNT } from '@bellum/contracts'` |
| **`apps/website/.../pricing/live-prices.ts:31`** | **sa propre copie**, `const ANNUAL_DISCOUNT = 0.8`    |

Le doublon est **assumé et documenté** — le commentaire dit « Mirrors
`ANNUAL_DISCOUNT` in `packages/contracts` (the website does not depend on that
package) ». C'est un choix défendable : on ne charge pas un Next.js de marketing
d'un paquet de contrats zod pour une constante.

**Mais le mot « mirrors » ne garde rien.** Le jour où la remise change dans le
contrat, l'API facture la nouvelle et **la page de tarifs affiche l'ancienne** :
le prix annoncé au client avant qu'il paie ne serait pas celui qu'on lui
prélève. Rien ne casse, une page s'affiche. C'est la divergence la plus coûteuse
possible et la moins visible.

**Livré : `annual-discount-parity.test.ts`.** Elle ne fusionne pas les deux
valeurs (ça demanderait la dépendance qu'on refuse) : elle LIT le contrat sur le
disque et refuse l'écart — même idiome que `shared-schema-parity.test.ts`, qui
tient ensemble le zod et le JSON Schema sans les confondre. Quatre tests, dont
celui qui prouve qu'elle lit un corpus réel et celui qui prouve qu'elle sait dire
NON.

**Preuve destructive faite** : le contrat passé à `0.75` fait tomber deux tests
sur quatre ; restauré à `0.8`, tout repasse.

---

## 3. Les quatre résolutions du README

| Résolution                                                           | Verdict                                                                                                                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Aucun ancien prix ne doit être codé sans lire le repo/backoffice » | **TENUE** — et vérifiée dans les deux sens au §1 : l'image ne diverge pas                                                                                             |
| « Cash encaissé ≠ MRR »                                              | **TENUE** — les quatre chiffres d'affaires du PDF 5 (signé / produit / facturé / **encaissé**) ne se fondent jamais, et c'est écrit comme la règle centrale du module |
| « Démo simulée ≠ plan Free »                                         | **TENUE** — la carte « Free » du site n'est pas un palier : elle n'existe pas dans le catalogue, elle ouvre `/demo`. Rien à provisionner, aucun crédit                |
| « Aucun ROI ou forecast inventé »                                    | **TENUE** — le prévisionnel est en trois lignes NON pondérées, sans total unique, et la pondération probabiliste a été refusée six fois                               |

### Les trois instructions

| Instruction                                                                | Verdict                                                                                                                   |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| « Mesurer coûts réels via télémétrie/Langfuse »                            | **TENUE** — `provider_costs`, `GET /metrics/cost`, et l'archive 03 vient d'ajouter `environment`/`release` à chaque trace |
| « Utiliser le pipe pour import/CRM goldens, **pas comme vérité produit** » | **TENUE** — `PIPE_MASTER.xlsx` n'est ingéré nulle part                                                                    |
| « Conserver la démo clairement étiquetée »                                 | **TENUE** — dossiers fictifs en `.example`, aucun appel modèle, aucun crédit                                              |

---

## 4. Ce qu'on ne promet pas

| Ce qu'on ne fait pas                                               | Raison                                                                                                                                                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ingérer `BellumAI_BP_Unit_Economics_v2.xlsx` ou `PIPE_MASTER.xlsx` | Ce sont des modèles de travail, et le README le dit lui-même pour le pipe : « pas comme vérité produit ». Les charger produirait des chiffres d'affaires qui ne viennent d'aucune facture.                                |
| Exploiter le devis KEYRUS                                          | C'est un document commercial nominatif, et le seul tarif contractuel réel du corpus. Il se lit, il ne se code pas : un prix négocié avec un client n'est pas une grille.                                                  |
| Rejouer `memoire-ancien-GPT`                                       | Historique de feedback, déjà supplanté par les neuf trackers de chantier. Conservé comme archive.                                                                                                                         |
| Faire dépendre `apps/website` de `@bellum/contracts`               | Ce serait la seule façon de supprimer le doublon, et elle coûte plus qu'elle ne rapporte : un site de marketing n'a pas besoin d'un paquet de contrats zod. La garde de parité tient la promesse pour un dixième du prix. |
