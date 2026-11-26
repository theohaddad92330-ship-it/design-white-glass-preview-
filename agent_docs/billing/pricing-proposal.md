# Proposition de grille pricing — alignement modèle roadmap (PDF)

> **Statut : GRILLE RECOMMANDÉE (§3) VALIDÉ Louis 16/07 — IMPLÉMENTÉE.**
> La grille du §3 (Starter-Solo 119 € / Team 259 € / Growth 599 € / Beta 59 € /
> Enterprise sur devis, sièges inclus 1 / 3 / 8, quotas 15-20 / 50-100 / 120-300)
> est en place : `PLAN_CONFIG` (`credits.service.ts`), contrats (`planSchema` /
> `checkoutSchema`), migration `1785850000000-PricingGridFinal` (rename
> `pro`→`team`, `business`→`growth`, grandfathering sièges starter), miroirs web
> (`apps/web/src/lib/plans.ts`, PlansGrid/PlanPicker) et site marketing
> (`apps/website/messages/*`). Sièges : **option 1 du §3 retenue** (add-on
> 29 €/siège conservé au-delà de l'inclus). Décisions résiduelles : voir §4.
>
> Historique : chaque montant non déductible d'un coût réel était marqué
> `HYPOTHÈSE À VALIDER` ; les valeurs du §3 sont désormais **VALIDÉ Louis 16/07**.

---

## 1. Point de départ — ce qui était en prod avant la validation du 16/07

> ⚠️ Section HISTORIQUE : cette grille a été remplacée par le §3 (validé et
> implémenté le 16/07). Conservée pour la traçabilité du raisonnement de marge.

Grille précédente (`PLAN_CONFIG`, `apps/api/src/modules/credits/credits.service.ts`),
prix TTC mensuels, tous plans avec **3 sièges de base** + add-on **+29 €/siège/mois** :

| Plan (code) | Prix/mois | Analyses/mois  | Enrichissements/mois | Sièges inclus             |
| ----------- | --------- | -------------- | -------------------- | ------------------------- |
| `trial`     | 0 €       | 40             | 75                   | 3 (essai 7 j, sans carte) |
| `starter`   | 119 €     | 15             | 20                   | 3                         |
| `pro`       | 159 €     | 40             | 75                   | 3                         |
| `business`  | 289 €     | 100 (fair use) | 200                  | 3                         |

Annuel : **−20 % × 12 mois**, arrondi à l'euro (`ANNUAL_DISCOUNT = 0.8`, serveur-autoritaire).
Recharges hors-abonnement (`TOPUP_PACKS`) : analyses +5 / +20 / +50, enrichissements +25 / +100 / +300.

### Coûts réels unitaires (fournis)

- **Analyse** (run complet Claude + APIs) : **~0,65 €** / analyse.
- **Enrichissement** (contact Apollo) : **~0,08 €** / enrichissement.

### Marge d'abonnement à **pleine consommation** (worst case)

`COGS = 0,65 × analyses + 0,08 × enrichissements`

| Plan                 | COGS plein | Marge à pleine conso                         |
| -------------------- | ---------- | -------------------------------------------- |
| `starter` (15/20)    | 11,35 €    | **90,5 %** ✅                                |
| `pro` (40/75)        | 32,00 €    | **79,9 %** ⚠️ (juste sous la cible 80 %)     |
| `business` (100/200) | 81,00 €    | **71,9 %** ❌ (sous la cible à pleine conso) |

> Lecture : la marge cible **> 80 %** n'est tenue **à pleine consommation** que par
> Starter. Pro est à la limite, Business passe dessous **si** le client sature son
> quota (rare en pratique — la conso réelle moyenne est bien inférieure au cap,
> donc la marge effective reste haute). C'est le principal signal chiffré : soit
> remonter les prix des paliers hauts, soit descendre les quotas, soit assumer une
> marge < 80 % sur le worst-case des gros comptes (couvert par les packs de recharge).

---

## 2. Mapping actuel → hypothèses de nommage PDF

Le PDF roadmap structure l'offre autour de 5 paliers. Correspondance **proposée**
(le nommage PDF est une hypothèse de lecture — à confirmer avec la source) :

| Palier PDF (hyp.) | Code actuel le plus proche | Cible client                             | Sièges (PDF)     |
| ----------------- | -------------------------- | ---------------------------------------- | ---------------- |
| **Beta**          | _(nouveau)_ `beta`         | Design partners / onboarding beta        | ~2 (cible usage) |
| **Starter-Solo**  | `starter`                  | Commercial ESN solo / indépendant        | 1                |
| **Team**          | `pro`                      | Petite équipe commerciale ESN            | 3                |
| **Growth**        | `business`                 | ESN en croissance, plusieurs commerciaux | 6–10             |
| **Enterprise**    | _(nouveau, sur devis)_     | Grand compte / déploiement custom        | custom           |

> Le PDF ne donne (à ma connaissance) que **Team = 3 sièges** et **Growth = 6–10
> sièges** comme points durs. Le reste du mapping est une hypothèse de travail.

---

## 3. Grille RECOMMANDÉE — **VALIDÉ Louis 16/07, implémentée**

Modèle cible : **sièges inclus dans le palier** + **crédits mutualisés au
workspace** + **packs de recharge** pour l'overage. Annuel −20 % conservé.

> ✅ **VALIDÉ Louis 16/07.** Tous les montants € et quotas de cette section sont
> implémentés tels quels (codes plan : `starter` = Starter-Solo, `team` ex-`pro`,
> `growth` ex-`business`). Ils sont dimensionnés pour tenir **marge > 80 % à
> pleine consommation** avec les coûts fournis (0,65 € / 0,08 €).

| Palier           | Prix/mois `HYPOTHÈSE`            | Prix/an (−20 %) `HYPOTHÈSE` | Sièges inclus                    | Analyses/mois `HYPOTHÈSE` | Enrich./mois `HYPOTHÈSE` | COGS plein | Marge pleine conso                                      |
| ---------------- | -------------------------------- | --------------------------- | -------------------------------- | ------------------------- | ------------------------ | ---------- | ------------------------------------------------------- |
| **Beta**         | **59 €**                         | — (mensuel only)            | 3 (base ; cible **2** à l'usage) | 20                        | 40                       | 16,20 €    | **72,5 %** _(palier d'appel, marge assumée plus basse)_ |
| **Starter-Solo** | **119 €** _(= actuel, non-hyp.)_ | 1 142 €                     | 1                                | 15                        | 20                       | 11,35 €    | **90,5 %** ✅                                           |
| **Team**         | **259 €**                        | 2 486 €                     | 3                                | 50                        | 100                      | 40,50 €    | **84,4 %** ✅                                           |
| **Growth**       | **599 €**                        | 5 750 €                     | 8 _(milieu de 6–10)_             | 120                       | 300                      | 102,00 €   | **83,0 %** ✅                                           |
| **Enterprise**   | **sur devis**                    | sur devis                   | custom                           | custom                    | custom                   | —          | contractuel                                             |

Justification du dimensionnement (méthode, pour rejouer les nombres) :

- **Règle de marge** : pour tenir > 80 %, il faut `prix ≥ 5 × COGS_plein`. Les
  quotas ci-dessus sont choisis pour que `5 × COGS` reste **sous** le prix proposé.
- **Beta** est un **palier d'appel** : marge volontairement plus basse (72 %),
  assumée car l'objectif est l'acquisition de design partners, pas la marge. Le
  prix 59 € et les quotas 20/40 correspondent à ce qui est **effectivement livré
  dans le code** (plan `beta` de `PLAN_CONFIG`) — mais ils restent une hypothèse
  produit tant que la beta n'est pas commercialisée.
- **Team** reprend la cible « 3 sièges » du PDF ; quotas relevés vs `pro` (50/100
  au lieu de 40/75) pour justifier l'écart de prix face à Starter-Solo tout en
  gardant 84 % de marge.
- **Growth** vise le milieu de la fourchette PDF (8 sièges). Le prix 599 € couvre
  8 sièges (≈ l'équivalent de 8 × add-on 29 € = 232 € de sièges + ~360 € de socle
  produit) — ordre de grandeur cohérent avec le modèle add-on actuel.
- **Enterprise** : pas de prix catalogue — négociation commerciale + quotas custom.

### Sièges : cohérence avec l'add-on existant — **option 1 retenue (VALIDÉ Louis 16/07)**

Le modèle précédent = **3 sièges partout + 29 €/siège**. La grille validée **fait
varier les sièges inclus par palier** (1 / 3 / 8). Deux options d'implémentation
existaient :

1. **[RETENUE]** Garder l'add-on 29 €/siège au-delà des sièges inclus du palier
   (mixte inclus + add-on) — **le moins de refonte** (la logique add-on existe
   déjà). Implémentée : `PLAN_CONFIG[plan].seats` + `EXTRA_SEAT_PRICE_CENTS`.
   Les abonnés starter ACTIFS pré-rename sont grand-fathered à 3 sièges
   (+2 `extra_seats` gratuits, migration `1785850000000`).
2. Sièges strictement bornés par palier, upsell = changer de palier — plus simple
   à comprendre, mais supprime l'add-on granulaire. Non retenue.

---

## 4. Trois questions ouvertes — état après validation du 16/07

1. **Prix exacts Team & Growth. → TRANCHÉ (VALIDÉ Louis 16/07).** Team = 259 €
   et Growth = 599 € (la colonne recommandée du §3), avec les sièges inclus
   variables (1 / 3 / 8) + add-on 29 €/siège conservé.

2. **Quotas inclus & mutualisation. → TRANCHÉ (VALIDÉ Louis 16/07).** Quotas
   mutualisés au workspace confirmés (quota porté par l'owner, partagé par les
   membres — comportement existant) avec les volumes recommandés : Team 50/100,
   Growth 120/300. Stratégie retenue = quotas tenant la marge > 80 % à pleine
   conso + packs de recharge pour l'overage.

3. **Essai 7 j vs plan Beta. → STATU QUO (non tranché par la validation).** Le
   proposal laissait la question ouverte ; la validation du 16/07 porte sur la
   grille payante. Les deux parcours **coexistent** donc, comme avant : `trial`
   = essai 7 j sans carte auto au signup (quotas conservés 40/75 — non redéfinis
   par la grille) ; `beta` = plan payant 59 € réservé, assigné à la main.
   Décision produit (essai seul, beta seule, ou routage par canal) toujours à
   prendre si besoin.

---

## 5. Ce que le code fait (mis à jour 16/07 après implémentation)

- **Fait (pré-validation)** : plan `beta` (59 €, 20/40, 3 sièges de base) dans
  `PLAN_CONFIG`, **exclu de la grille publique de checkout** (réservé onboarding,
  assigné via le backoffice admin). Grille de coûts crédits par action
  (`CREDIT_COSTS`), coût d'analyse paramétrable par périmètre (`scope_mode`) —
  tout à 1. Ledger durci (refund enrichissement prêt, ligne ledger sur le refill
  mensuel).
- **Fait (validation 16/07, branche `feat/pricing-grid-final`)** : grille §3
  implémentée de bout en bout — `PLAN_CONFIG` (prix/quotas/sièges par palier +
  `label`), renommage `pro`→`team` / `business`→`growth` (contrats, admin,
  checkout, reset mensuel, webhooks avec alias legacy `pro`/`business`/`scale`),
  migration `1785850000000-PricingGridFinal` (rename data + grandfathering
  sièges starter actifs), miroirs `apps/web` (plans.ts avec `id` serveur,
  PlansGrid, PlanPicker sièges variables, i18n FR+EN) et site marketing
  (`apps/website/messages` FR+EN — grille, FAQ, essai « gratuit » sans mention
  d'un palier Pro disparu).
- **Ne fait pas** : pas de palier Enterprise en base/checkout (sur devis — un
  CTA « parler à notre équipe » sur le site) ; l'essai `trial` garde ses quotas
  historiques 40/75 (non redéfinis par la grille, §4.3) ; les packs de recharge
  (`TOPUP_PACKS`) et l'annuel −20 % sont inchangés.
