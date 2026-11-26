import { z } from 'zod'

/**
 * LA NOTE DE FRAIS — le domaine (31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN REVIREMENT DATÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `PDF-22_Annexe_les-17-ecrans-cibles`, §05, refusait ce domaine : « le domaine
 * est REFUSÉ. Le motif d'écran est repris. » Le motif cité — « barèmes, TVA
 * récupérable, conservation des justificatifs, politique par client : c'est un
 * produit à part entière. À moitié construit, il nuit. »
 *
 * Louis a LU ce refus et l'a LEVÉ le 31/08/2026. Ce fichier est donc la réponse
 * au motif du refus, et pas son contournement : les quatre pièces nommées dans
 * le refus sont ICI, chacune avec sa dérivation testée. « À moitié construit »
 * était le risque ; ce qui l'écarte, c'est que les quatre existent ensemble.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER N'EST PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS `mission_expenses` (30/08/2026), qui est la LIGNE DE FRAIS d'une
 * mission — une colonne de coût qui corrige la marge. Une note de frais est un
 * DOSSIER : une personne, une période, des justificatifs, un circuit de
 * validation. Le lien entre les deux est écrit, et il est à sens unique : une
 * note VALIDÉE engendre UNE ligne `mission_expenses`, une seule fois
 * (`expense_reports.mission_expense_id` porte la preuve). Sans cette clé, la
 * marge compterait les frais deux fois — ou zéro fois.
 *
 * Ce n'est pas non plus `supplier_invoices` (facture ENTRANTE d'un
 * sous-traitant) : celle-là est ce qu'on doit à une SOCIÉTÉ, celle-ci ce qu'on
 * rembourse à une PERSONNE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI TRAVERSE LES QUATRE DÉRIVATIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * **Un verdict ne se conclut pas d'un silence.** Un barème absent ne dit pas
 * « conforme » ; un taux de TVA non lu ne dit pas « 0 € récupérable ». Les deux
 * rendent `null`, et ce qui n'a pas pu être évalué est COMPTÉ
 * (`unmeasuredLineCount`) pour que l'écran le NOMME — un score dont les axes
 * non évaluables sont tus mesure la complétude de nos données, pas la note.
 */

/**
 * Les QUATRE états d'une note de frais.
 *
 * La première version en portait trois, et disait pourquoi : « un `draft` que
 * rien n'écrirait serait exactement le défaut n°1 du dépôt — du code juste que
 * personne n'appelle. GA-08 permet de l'AJOUTER en fin de liste le jour où un
 * chemin de brouillon existe ». Ce jour est le 31/08/2026 : le dépôt d'une note
 * existe, sa saisie ligne à ligne aussi, et `draft` a donc un écrivain.
 *
 * ⚠️ Il est AJOUTÉ EN FIN, et pas rangé au début où l'ordre du cycle de vie le
 * mettrait. GA-08 gèle l'ORDRE autant que le contenu : pour plusieurs
 * taxonomies du dépôt l'index EST la progression, et rien ne garantit qu'un
 * lecteur d'ici trois mois ne s'appuiera pas sur celui-ci. Un état qui se lit
 * mal dans une liste coûte moins qu'un index qui glisse en silence.
 *
 * La contrainte SQL a été élargie AVANT (`1791005000001`), et le `MAPPING` de
 * GA-12 la relie déjà à cette énumération.
 */
export const EXPENSE_REPORT_STATUSES = ['pending', 'validated', 'rejected', 'draft'] as const
export const expenseReportStatusSchema = z.enum(EXPENSE_REPORT_STATUSES)
export type ExpenseReportStatus = (typeof EXPENSE_REPORT_STATUSES)[number]

/**
 * Les catégories de frais.
 *
 * `other` FERME la liste, à dessein : toute catégorie nouvelle s'insère avant
 * lui sans déplacer aucune valeur existante (GA-08). La contrainte SQL
 * `expense_report_lines_category_check` porte exactement cette liste, et elle a
 * été élargie AVANT que ce fichier ne l'écrive (GA-11 / GA-12).
 */
export const EXPENSE_CATEGORIES = [
  'meal',
  'hotel',
  'train',
  'plane',
  'taxi',
  'car_rental',
  'fuel',
  'toll',
  'parking',
  'mileage',
  'supplies',
  'other',
] as const
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES)
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

/**
 * Sur quelle base le client rembourse : au RÉEL (ce qui a été dépensé) ou au
 * BARÈME (le forfait, quel que soit le ticket). C'est la « politique de
 * remboursement paramétrable par client » du refus levé.
 */
export const EXPENSE_REIMBURSEMENT_BASES = ['actual', 'scale'] as const
export const expenseReimbursementBasisSchema = z.enum(EXPENSE_REIMBURSEMENT_BASES)
export type ExpenseReimbursementBasis = (typeof EXPENSE_REIMBURSEMENT_BASES)[number]

/**
 * La durée de conservation des pièces justificatives comptables en FRANCE —
 * dix ans à compter de la clôture (Code de commerce, L123-22).
 *
 * Elle est NOMMÉE et PARAMÈTRE, jamais codée en dur dans le calcul, pour la
 * raison exacte qui a fait des jours fériés un paramètre du relevé d'activité :
 * dix ans est vrai en France et faux ailleurs, et une durée légale codée en dur
 * devient une donnée fictive dès la première mission hors du pays. Le jour où
 * un pack pays porte sa propre durée, `receiptRetentionUntil` la reçoit sans
 * changer d'une ligne.
 */
export const RECEIPT_RETENTION_YEARS_FR = 10

/** Les faits d'une ligne de frais dont dépendent les dérivations. */
export type ExpenseLineFacts = {
  category: ExpenseCategory
  /** Montant TTC en centimes, strictement positif (contrainte SQL). */
  amountCents: number
  /**
   * Le taux de TVA LU sur le justificatif, en points de base (2000 = 20 %).
   * `null` = pas lu. Jamais 0 par défaut : « 0 % » est un fait fiscal, « je
   * n'ai pas lu le ticket » n'en est pas un.
   */
  vatRateBps: number | null
  spentOn: string
  /**
   * Les kilomètres parcourus — sur une ligne `mileage`, et sur elle seule.
   *
   * Absent ou `null` partout ailleurs : un repas ne parcourt pas de kilomètres,
   * et « 0 km » serait une mesure, donc une mesure fausse. Sur une ligne
   * kilométrique, `null` laisse la ligne NON VÉRIFIÉE — le barème existe, mais
   * il n'y a rien à quoi l'appliquer, et on le DIT.
   */
  distanceKm?: number | null
  /** La puissance fiscale du VÉHICULE, qui choisit le tarif au kilomètre. */
  fiscalHorsepower?: number | null
}

/** Une entrée du barème : ce que la politique du client dit d'une catégorie. */
export type ExpenseCapFacts = {
  category: ExpenseCategory
  /**
   * Le plafond en centimes. `null` = la politique ne plafonne pas cette
   * catégorie — ce qui n'est PAS « plafond zéro ».
   */
  capCents: number | null
  /**
   * La TVA de cette catégorie ouvre-t-elle droit à déduction sous cette
   * politique ? C'est un PARAMÈTRE et non une table en dur, pour la même
   * raison que la durée de conservation : « l'hôtel n'ouvre pas droit, le
   * restaurant si » est une règle française, datée, et qui bouge.
   */
  vatRecoverable: boolean
  /**
   * Depuis quand ce plafond s'applique — `undefined` / `null` = depuis toujours.
   *
   * Le barème est ÉDITABLE depuis le 31/08/2026, et c'est ce qui rend cette
   * date nécessaire : relever le plafond repas en septembre rendrait
   * rétroactivement conformes des notes de mars, l'abaisser transformerait en
   * dépassement des lignes remboursées il y a six mois. Ce qui s'oppose à un
   * contrôle est la règle en vigueur AU MOMENT de la dépense.
   */
  effectiveFrom?: string | null
}

/**
 * Le plafond de cette catégorie EN VIGUEUR à la date donnée, ou `null`.
 *
 * `on` est optionnel pour que les appelants qui n'ont pas de date — un écran de
 * réglage qui montre le barème courant — ne soient pas forcés d'en inventer
 * une. Sans date, toutes les entrées sont candidates et la plus récente gagne ;
 * avec, celles qui n'ont pas encore pris effet sont ÉCARTÉES.
 *
 * ⚠️ Entre deux entrées applicables, c'est la plus RÉCENTE qui l'emporte, et
 * une entrée sans date d'effet est la plus ancienne de toutes — elle est le
 * repli, jamais la gagnante contre une révision datée.
 */
export function capForCategory(
  caps: readonly ExpenseCapFacts[],
  category: ExpenseCategory,
  on?: string,
): ExpenseCapFacts | null {
  let best: ExpenseCapFacts | null = null
  for (const entry of caps) {
    if (entry.category !== category) continue
    const from = entry.effectiveFrom ?? null
    if (on !== undefined && from !== null && from > on) continue
    if (best === null || (from ?? '') >= (best.effectiveFrom ?? '')) best = entry
  }
  return best
}

/**
 * Une ligne du BARÈME KILOMÉTRIQUE, tel que l'ESN l'a SAISI.
 *
 * Jamais pré-rempli, et c'est le fond de la décision : un barème par puissance
 * fiscale recopié de mémoire, non daté, jamais revérifié, serait une donnée
 * fictive présentée comme une règle officielle — et l'ESN rembourserait dessus
 * en croyant appliquer le texte. Tant que rien n'est saisi, une ligne `mileage`
 * reste NON VÉRIFIÉE.
 */
export type MileageRateFacts = {
  fiscalHorsepower: number
  /** Centimes par kilomètre. */
  centsPerKm: number
  /** `AAAA-MM-JJ` — obligatoire : un barème kilométrique se révise. */
  effectiveFrom: string
}

/** Le tarif applicable à cette puissance à cette date, ou `null`. */
function mileageRateOn(
  rates: readonly MileageRateFacts[],
  fiscalHorsepower: number,
  on: string,
): MileageRateFacts | null {
  let best: MileageRateFacts | null = null
  for (const rate of rates) {
    if (rate.fiscalHorsepower !== fiscalHorsepower) continue
    if (rate.effectiveFrom > on) continue
    if (best === null || rate.effectiveFrom >= best.effectiveFrom) best = rate
  }
  return best
}

/**
 * L'INDEMNITÉ due pour une ligne kilométrique, en centimes — ou `null`.
 *
 * `null` dans trois cas, et aucun ne se rend « 0 € » :
 *  - la ligne n'est pas kilométrique (la question ne se pose pas) ;
 *  - la distance ou la puissance n'ont pas été saisies ;
 *  - l'ESN n'a pas (encore) saisi de tarif pour cette puissance à cette date.
 *
 * Le troisième est celui qui compte : c'est lui qui laisse la ligne NON
 * VÉRIFIÉE au lieu de la déclarer conforme sur un barème qui n'existe pas.
 */
export function mileageAllowanceCents(line: ExpenseLineFacts, rates: readonly MileageRateFacts[]): number | null {
  if (line.category !== 'mileage') return null
  const distance = line.distanceKm ?? null
  const horsepower = line.fiscalHorsepower ?? null
  if (distance === null || horsepower === null) return null
  if (!Number.isFinite(distance) || distance <= 0) return null
  const rate = mileageRateOn(rates, horsepower, line.spentOn)
  if (rate === null) return null
  return Math.round(distance * rate.centsPerKm)
}

/** La somme des lignes. Zéro ligne fait zéro euro — ici, le zéro est VRAI. */
export function expenseLinesTotalCents(lines: readonly ExpenseLineFacts[]): number {
  return lines.reduce((total, current) => total + current.amountCents, 0)
}

/**
 * La TVA RÉCUPÉRABLE d'une ligne, en centimes.
 *
 * `null` dans deux cas, et les deux appellent un geste différent à l'écran :
 *  - **aucun barème ne se prononce sur la catégorie** — il faut compléter la
 *    politique du client ;
 *  - **le taux n'a pas été lu** — il faut rouvrir le justificatif.
 *
 * ZÉRO dans deux autres cas, et les deux sont des faits mesurés :
 *  - la politique dit que la catégorie n'ouvre pas droit à déduction ;
 *  - le taux lu vaut 0 %.
 *
 * Le calcul part d'un montant TTC : `TVA = TTC × taux / (1 + taux)`.
 */
export function lineRecoverableVatCents(line: ExpenseLineFacts, cap: ExpenseCapFacts | null): number | null {
  if (cap === null) return null
  if (!cap.vatRecoverable) return 0
  return vatOfTtc(line)
}

/** La part de TVA contenue dans un montant TTC, ou `null` si le taux est inconnu. */
function vatOfTtc(line: ExpenseLineFacts): number | null {
  const rate = line.vatRateBps
  if (rate === null || !Number.isFinite(rate) || rate < 0) return null
  if (rate === 0) return 0
  return Math.round((line.amountCents * rate) / (10_000 + rate))
}

/**
 * La VENTILATION de la TVA d'une note — la seconde pièce nommée par le refus
 * levé.
 *
 * Trois nombres, et le troisième est celui qui empêche les deux premiers de
 * mentir : `unmeasuredLineCount` dit combien de lignes n'ont pas pu être
 * ventilées. Sans lui, une note dont une seule ligne sur cinq porte un taux
 * afficherait un total de TVA qui a l'air complet.
 *
 * `recoverableCents` et `borneCents` valent `null` — jamais 0 — quand AUCUNE
 * ligne n'est ventilable : « rien à récupérer » et « je n'ai rien pu calculer »
 * ne se réparent pas de la même façon.
 */
export function expenseVatBreakdown(
  lines: readonly ExpenseLineFacts[],
  caps: readonly ExpenseCapFacts[],
): { recoverableCents: number | null; borneCents: number | null; unmeasuredLineCount: number } {
  let recoverable = 0
  let borne = 0
  let measured = 0
  let unmeasured = 0

  for (const line of lines) {
    // ⚠️ La date de la LIGNE, jamais « aujourd'hui » : la TVA d'une dépense de
    // mars se ventile sous le barème de mars. Une révision de septembre ne
    // rejuge pas ce qui a déjà été remboursé.
    const cap = capForCategory(caps, line.category, line.spentOn)
    const vat = vatOfTtc(line)
    if (cap === null || vat === null) {
      unmeasured += 1
      continue
    }
    measured += 1
    if (cap.vatRecoverable) recoverable += vat
    else borne += vat
  }

  if (measured === 0) return { recoverableCents: null, borneCents: null, unmeasuredLineCount: unmeasured }
  return { recoverableCents: recoverable, borneCents: borne, unmeasuredLineCount: unmeasured }
}

/**
 * Le plafond RÉELLEMENT opposable à une ligne, en centimes — ou `null`.
 *
 * Deux sources, et une seule fonction pour les deux, sinon la conformité et la
 * ligne du tiroir finiraient par ne plus dire la même chose :
 *  - une ligne kilométrique se compare à `distance × tarif(puissance)`, pas à
 *    un plafond forfaitaire ;
 *  - toute autre ligne se compare au plafond de sa catégorie, à SA date.
 *
 * ⚠️ Le barème kilométrique l'emporte sur un éventuel plafond `mileage` de la
 * politique QUAND il se calcule : il est plus précis (il connaît le trajet).
 * Quand il ne se calcule pas — pas de distance, pas de tarif saisi — on
 * retombe sur le plafond de catégorie, et s'il n'y en a pas, sur `null`.
 */
export function effectiveCapCents(
  line: ExpenseLineFacts,
  caps: readonly ExpenseCapFacts[],
  rates: readonly MileageRateFacts[] = [],
): number | null {
  const allowance = mileageAllowanceCents(line, rates)
  if (allowance !== null) return allowance
  return capForCategory(caps, line.category, line.spentOn)?.capCents ?? null
}

/**
 * Le DÉPASSEMENT d'une ligne sur le plafond qui lui est opposable, en centimes.
 *
 * `null` quand aucun plafond ne l'est — et c'est le point qui compte : un
 * plafond absent ne rend pas la ligne conforme, il la rend NON VÉRIFIÉE. Rendre
 * 0 ici ferait remonter « Conforme » sur un barème vide, c'est-à-dire une
 * garantie tirée d'un silence.
 *
 * `0` quand la ligne tient dans le plafond, bornes comprises — un zéro mesuré.
 *
 * ⚠️ Le second argument est le plafond EN CENTIMES, et non les faits du barème.
 * Il l'était jusqu'au 31/08/2026, et ne pouvait plus l'être une fois le barème
 * kilométrique livré : un plafond kilométrique se CALCULE par ligne, et le
 * fabriquer sous la forme d'un `ExpenseCapFacts` aurait obligé à lui inventer
 * un `vatRecoverable` — c'est-à-dire à affirmer un droit à déduction que
 * personne n'a saisi. Le montant seul ne ment pas.
 */
export function lineCapOverageCents(line: ExpenseLineFacts, capCents: number | null): number | null {
  if (capCents === null) return null
  return line.amountCents > capCents ? line.amountCents - capCents : 0
}

/** Le verdict de conformité d'une note au barème de son client. */
export type ExpensePolicyVerdict = 'compliant' | 'breach' | 'unknown'

/**
 * La CONFORMITÉ d'une note à la politique de frais du client — l'encart
 * « Conformité politique frais » de la maquette.
 *
 * Trois verdicts, et l'ordre de priorité compte :
 *  1. **`breach`** — au moins un dépassement CONSTATÉ. Ce qui est constaté se
 *     dit, même si le reste n'a pas pu être vérifié.
 *  2. **`unknown`** — aucune ligne ne dépasse, mais au moins une n'a pas été
 *     comparée à quoi que ce soit (ou la note n'a aucune ligne).
 *  3. **`compliant`** — toutes les lignes ont été comparées, aucune ne dépasse.
 *
 * Le cas 2 est LE défaut que cette fonction existe pour empêcher : un barème
 * incomplet rendait « Conforme » sur une note dont la moitié n'avait été
 * comparée à rien, et « Conforme » est précisément ce qu'un valideur lit pour
 * ne PAS ouvrir les justificatifs.
 */
export function expensePolicyCompliance(
  lines: readonly ExpenseLineFacts[],
  caps: readonly ExpenseCapFacts[],
  rates: readonly MileageRateFacts[] = [],
): {
  verdict: ExpensePolicyVerdict
  overages: { category: ExpenseCategory; overageCents: number }[]
  unmeasuredLineCount: number
} {
  const overages: { category: ExpenseCategory; overageCents: number }[] = []
  let unmeasured = 0

  for (const line of lines) {
    const overage = lineCapOverageCents(line, effectiveCapCents(line, caps, rates))
    if (overage === null) {
      unmeasured += 1
      continue
    }
    if (overage > 0) overages.push({ category: line.category, overageCents: overage })
  }

  if (overages.length > 0) return { verdict: 'breach', overages, unmeasuredLineCount: unmeasured }
  if (unmeasured > 0 || lines.length === 0) return { verdict: 'unknown', overages, unmeasuredLineCount: unmeasured }
  return { verdict: 'compliant', overages, unmeasuredLineCount: 0 }
}

/**
 * L'ÉCHÉANCE de conservation d'un justificatif — la troisième pièce du refus
 * levé.
 *
 * `null` sur une date illisible : afficher une échéance calculée sur une date
 * qu'on n'a pas su lire serait une donnée fictive, et c'est celle-là qu'on
 * opposerait à un contrôle.
 *
 * Le 29 février est le cas qui casse l'implémentation naïve : `setFullYear`
 * fait déborder le 29/02/2024 + 1 an sur le 01/03/2025. On le RAMÈNE au dernier
 * jour du mois d'arrivée — une échéance ne se repousse pas d'un jour par accident.
 */
export function receiptRetentionUntil(spentOn: string, years: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(spentOn)
  if (!match) return null
  const [, rawYear, rawMonth, rawDay] = match
  const year = Number(rawYear)
  const month = Number(rawMonth)
  const day = Number(rawDay)
  if (month < 1 || month > 12 || day < 1) return null
  // Le mois d'ORIGINE doit exister tel quel : le 31/02 n'est pas une date.
  if (day > daysInMonth(year, month)) return null
  if (!Number.isInteger(years) || years < 0) return null

  const targetYear = year + years
  const clampedDay = Math.min(day, daysInMonth(targetYear, month))
  return `${String(targetYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/**
 * LA VÉRIFICATION AUTOMATIQUE — l'encart de la maquette, et la quatrième pièce.
 *
 * Pure, comme `detectAnomalies` du relevé d'activité : l'appelant résout tout
 * ce qui vient d'ailleurs avant d'appeler. La liste VIDE veut dire « rien
 * détecté », pas « rien à signaler » — c'est pourquoi le champ n'est jamais
 * absent de la réponse.
 *
 * Elle est SÉPARÉE de la conformité au barème, exactement comme la maquette les
 * sépare en deux encarts : un dépassement de plafond est une décision de
 * gestion (on rembourse quand même, ou pas), une anomalie est un doute sur la
 * PIÈCE elle-même. Les fondre ferait passer « le ticket est peut-être compté
 * deux fois » pour « le repas est 7 € trop cher ».
 *
 * Ce qui n'est PAS ici, et pourquoi : un plafond kilométrique, qui suppose un
 * barème URSSAF par puissance fiscale — aucun n'existe dans ce dépôt, et un
 * barème inventé serait une donnée fictive. Voir le rapport de livraison.
 */
export function detectExpenseReportAnomalies(input: {
  /** `YYYY-MM` — la période DÉCLARÉE par la note. */
  periodMonth: string
  lines: readonly ExpenseLineFacts[]
  attachmentCount: number
  /** `YYYY-MM-DD` — aujourd'hui, passé par l'appelant pour que la fonction reste pure. */
  today: string
}): string[] {
  const anomalies: string[] = []
  const period = /^\d{4}-\d{2}$/.test(input.periodMonth) ? input.periodMonth : null

  // Une période illisible ne se compare à rien : on ne compare pas plutôt que
  // de comparer à une valeur devinée.
  if (period !== null) {
    const outside = input.lines.filter(line => line.spentOn.slice(0, 7) !== period)
    if (outside.length > 0) {
      anomalies.push(
        `${outside.length} ligne(s) datée(s) hors de la période déclarée (${period}) — vérifier qu'elles ne relèvent pas d'une autre note.`,
      )
    }

    const currentMonth = /^\d{4}-\d{2}-\d{2}$/.test(input.today) ? input.today.slice(0, 7) : null
    if (currentMonth !== null && period > currentMonth) {
      anomalies.push(
        `La période déclarée (${period}) n'a pas commencé — des frais ne peuvent pas avoir été engagés d'avance.`,
      )
    }
  }

  // Le doublon de justificatif : la même catégorie, le même jour, le même
  // montant au centime. Deux repas le même jour à des montants différents sont
  // le cas ordinaire et ne déclenchent rien — alerter dessus noierait les vrais.
  const seen = new Map<string, number>()
  for (const line of input.lines) {
    const key = `${line.category}|${line.spentOn}|${line.amountCents}`
    seen.set(key, (seen.get(key) ?? 0) + 1)
  }
  const duplicated = [...seen.values()].filter(count => count > 1).length
  if (duplicated > 0) {
    anomalies.push(
      `${duplicated} dépense(s) apparaissent plusieurs fois à l'identique (même catégorie, même date, même montant) — vérifier qu'il ne s'agit pas d'un doublon de justificatif.`,
    )
  }

  // Une note SANS ligne n'a rien à justifier : lui réclamer une pièce enverrait
  // chercher un problème qui n'existe pas.
  if (input.lines.length > 0 && input.attachmentCount === 0) {
    anomalies.push(
      `Aucun justificatif joint alors que ${input.lines.length} ligne(s) sont déclarées — la conservation légale porte sur les pièces, pas sur la saisie.`,
    )
  }

  return anomalies
}

/**
 * Ce qu'on montre à quelqu'un qui n'a PAS `finance:read`.
 *
 * Le champ est mis à `null`, jamais retiré et jamais à zéro — la doctrine D45,
 * la même que `redactFinance` (`staffing.ts`). Une clé PRÉSENTE et vide se lit
 * « case connue que je n'ai pas le droit de voir » ; un zéro se lirait
 * « la note fait 0 € », c'est-à-dire une information FAUSSE là où l'absence de
 * droit ne dit rien.
 *
 * ⚠️ Pourquoi cette fonction existe au lieu de `redactFinance` : une note de
 * frais est un objet IMBRIQUÉ. `redactFinance` opère à plat et laisserait
 * intact `lines[].amountCents` — l'entête rédigé, le détail en clair. C'est le
 * trou le plus facile à laisser, et il rendrait la rédaction décorative.
 *
 * ⚠️ Corollaire pour l'appelant : le DROIT voyage avec la réponse
 * (`canReadFinance`), sinon « pas le droit » et « pas mesuré » deviennent le
 * même `null` et l'écran ne peut plus les dire différemment.
 */
const REDACTED_EXPENSE_MONEY_FIELDS = [
  'totalAmountCents',
  'recoverableVatCents',
  'borneVatCents',
  'amountCents',
  'capCents',
  'overageCents',
] as const

type RedactableMoney = Partial<Record<(typeof REDACTED_EXPENSE_MONEY_FIELDS)[number], unknown>>

export function redactExpenseReportFinance<T extends RedactableMoney & { lines: readonly RedactableMoney[] }>(
  report: T,
  canReadFinance: boolean,
): T {
  if (canReadFinance) return report
  return {
    ...blankMoney(report),
    lines: report.lines.map(blankMoney),
  } as T
}

function blankMoney<T extends RedactableMoney>(row: T): T {
  const next = { ...row }
  for (const field of REDACTED_EXPENSE_MONEY_FIELDS) {
    // Une clé ABSENTE reste absente : « présent mais vide » vaut pour ce que la
    // réponse porte, pas pour ce qu'elle n'a jamais eu.
    if (field in next) (next as Record<string, unknown>)[field] = null
  }
  return next
}

/**
 * Le motif de refus — OBLIGATOIRE, borné, et rien d'autre dans le corps.
 *
 * Exactement la forme de `rejectTimesheetSchema` : le geste est le même (« ça
 * ne va pas, corrige et redépose »), et deux bornes différentes pour le même
 * geste feraient diverger deux écrans qui doivent se ressembler.
 */
export const rejectExpenseReportSchema = z.object({ reason: z.string().trim().min(1).max(500) }).strict()

/**
 * Les tailles de page offertes par le sélecteur « 10 / page » de la maquette.
 *
 * Elles vivent ICI et pas dans l'écran : le serveur BORNE ce qu'il accepte, et
 * deux listes — celle qu'on propose, celle qu'on accepte — divergeraient au
 * premier ajout. La première est le défaut.
 */
export const EXPENSE_PAGE_SIZES = [10, 25, 50] as const
export const DEFAULT_EXPENSE_PAGE_SIZE = EXPENSE_PAGE_SIZES[0]

/**
 * Les filtres de l'écran : le mois, l'état, la recherche libre — et la PAGE.
 *
 * ⚠️ `z.coerce` sur les deux nombres : ils arrivent d'une chaîne de requête,
 * donc en `string`. Sans coercition, `page=2` échouerait la validation et
 * l'écran retomberait silencieusement sur la première page — ce qui ressemble
 * exactement à « la pagination ne marche pas ».
 */
export const expenseReportListQuerySchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM')
      .optional(),
    status: expenseReportStatusSchema.optional(),
    search: z.string().trim().max(200).optional(),
    /** Théo C missions-notes-de-frais.N7 — le filtre « Compte » (le client de la note). */
    accountId: z.string().guid().optional(),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict()
export type ExpenseReportListQuery = z.infer<typeof expenseReportListQuerySchema>

/** Une ligne de frais telle que l'écran la reçoit. */
export type ExpenseReportLineView = {
  id: string
  category: ExpenseCategory
  label: string
  spentOn: string
  /**
   * La ville. Elle figure sur le justificatif et la maquette l'affiche ; elle
   * n'ordonne personne. C'est l'exception NOMMÉE de la doctrine sur les
   * critères protégés — plus grossière que le code postal, et jamais un poids.
   */
  city: string | null
  detail: string | null
  amountCents: number | null
  vatRateBps: number | null
  recoverableVatCents: number | null
  capCents: number | null
  overageCents: number | null
  /** `null` hors d'une ligne kilométrique, ou quand la distance n'a pas été saisie. */
  distanceKm: number | null
  /** `null` idem — et c'est ce qui laisse l'indemnité non vérifiable. */
  fiscalHorsepower: number | null
}

/** Un justificatif : son nom, son poids, et jusqu'à quand il doit être gardé. */
export type ExpenseReportAttachmentView = {
  id: string
  fileName: string
  /** `null` = poids inconnu. L'écran écrit « non mesuré », jamais « 0 KB ». */
  byteSize: number | null
  /** `null` = le fichier est RÉFÉRENCÉ mais pas stocké ici : pas de téléchargement. */
  downloadUrl: string | null
  retentionUntil: string
}

/**
 * Théo C missions-notes-de-frais.N3 — ce que la vérification au barème dit d'UNE
 * note, dans la liste (colonne « Barème »).
 *
 * `worstOverage` est le plus gros dépassement constaté, `null` s'il n'y en a pas
 * — jamais un dépassement « de 0 ». Son montant suit `finance:read` (`null`
 * PRÉSENT sans le droit, D45) ; la catégorie, elle, n'est pas financière.
 * `unmeasuredLineCount` compte les lignes comparées à RIEN : un barème absent ne
 * dit pas « conforme ».
 */
export type ExpenseReportPolicyCheck = {
  verdict: ExpensePolicyVerdict
  overageCount: number
  unmeasuredLineCount: number
  worstOverage: { category: ExpenseCategory; overageCents: number | null } | null
}

/** Une note de frais dans la liste. */
export type ExpenseReportSummaryView = {
  id: string
  reference: string
  bearerName: string
  accountName: string | null
  missionId: string | null
  /** Le libellé de la mission (Théo C missions-notes-de-frais.N4) — `null` sans mission. */
  missionLabel: string | null
  periodMonth: string
  status: ExpenseReportStatus
  lineCount: number
  totalAmountCents: number | null
  /**
   * `null` sur un BROUILLON, et sur lui seul : « déposée le 3 » sur une note que
   * personne n'a déposée serait un fait faux.
   */
  submittedAt: string | null
  decidedAt: string | null
  /** Qui a décidé — `null` si la note n'est pas décidée OU si le profil ne se lit pas : jamais un nom deviné. */
  decidedByName: string | null
  policyCheck: ExpenseReportPolicyCheck
}

/** Le dossier complet — ce que le tiroir latéral affiche. */
export type ExpenseReportDetailView = ExpenseReportSummaryView & {
  /** Le CLIENT dont la politique s'applique — l'écran d'édition le repropose. */
  accountId: string | null
  rejectionReason: string | null
  policyLabel: string | null
  reimbursementBasis: ExpenseReimbursementBasis | null
  anomalies: string[]
  compliance: { verdict: ExpensePolicyVerdict; unmeasuredLineCount: number }
  recoverableVatCents: number | null
  borneVatCents: number | null
  vatUnmeasuredLineCount: number
  lines: ExpenseReportLineView[]
  attachments: ExpenseReportAttachmentView[]
  /** La preuve que la marge de la mission a bien reçu ces frais — UNE fois. */
  missionExpenseId: string | null
}

/**
 * Les trois tuiles de l'écran.
 *
 * Les COMPTES sortent toujours : combien de notes attendent une décision n'est
 * pas une information financière, et les cacher retirerait le seul chiffre qui
 * dit quoi faire. Les MONTANTS, eux, passent par `finance:read`.
 */
export type ExpenseReportTiles = {
  pending: { count: number; totalAmountCents: number | null }
  validated: { count: number; totalAmountCents: number | null }
  rejected: { count: number; totalAmountCents: number | null }
  /**
   * Les BROUILLONS (31/08/2026) — la quatrième tuile, ajoutée avec l'état.
   *
   * La maquette n'en montrait que trois, parce que le brouillon n'existait pas.
   * Le laisser hors des tuiles maintenant coûterait deux fois : le déposant ne
   * verrait pas ce qu'il a commencé et jamais fini — c'est le premier motif de
   * note perdue — et le TOTAL de la période, qui sert à distinguer « le mois est
   * vide » de « c'est ton filtre qui a tout retiré », compterait faux.
   */
  draft: { count: number; totalAmountCents: number | null }
}

/**
 * Théo C missions-notes-de-frais.N5 — « Ce que la vérification relève ».
 *
 * Porte sur les notes qu'il reste à regarder (en attente + brouillons) de la
 * période filtrée, PAS sur la page rendue : « 2 dépassements » ne change pas
 * quand on tourne la page. Les montants suivent `finance:read`.
 *
 * Les justificatifs sont comptés PAR NOTE (le domaine n'attache pas une pièce à
 * une ligne) : `reportsWithoutReceipt` dit combien de notes portant des lignes
 * n'ont aucune pièce — il ne prétend pas savoir quelle ligne en manque.
 */
export type ExpenseReportVerification = {
  overages: {
    reportId: string
    reference: string
    bearerName: string
    category: ExpenseCategory
    overageCents: number | null
  }[]
  unmeasuredLineCount: number
  lineCount: number
  attachmentCount: number
  reportsWithoutReceipt: number
}

/**
 * Ce que la liste rend, pagination comprise.
 *
 * `total` est le nombre de notes qui passent le filtre, PAS le nombre rendu :
 * c'est lui qui écrit « 1–10 sur 60 ». Sans lui, l'écran ne saurait pas s'il
 * existe une page suivante, et une pagination qui ne sait pas où elle s'arrête
 * propose des pages vides.
 */
export type ExpenseReportListResult = {
  items: ExpenseReportSummaryView[]
  tiles: ExpenseReportTiles
  verification: ExpenseReportVerification
  canReadFinance: boolean
  total: number
  page: number
  pageSize: number
}

/* -------------------------------------------------------------------------- */
/*  LE DÉPÔT — ce qu'une note reçoit quand on la saisit                        */
/* -------------------------------------------------------------------------- */

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu : AAAA-MM-JJ')

/**
 * Une ligne saisie.
 *
 * ⚠️ `vatRateBps` est `.nullable()` et NON optionnel avec un défaut : « je n'ai
 * pas lu le ticket » doit pouvoir se DIRE. Un défaut à 0 rendrait la note
 * indistinguable d'une note à taux zéro, et la ventilation afficherait un total
 * qui a l'air complet — c'est exactement ce que la colonne nullable existe pour
 * empêcher, et un formulaire peut le défaire en une ligne.
 *
 * `amountCents` est un ENTIER de centimes, strictement positif, comme la
 * contrainte SQL. Une ligne à 0 ne veut rien dire ; une ligne négative serait un
 * remboursement, qui n'est pas une dépense.
 */
const expenseLineInputSchema = z
  .object({
    category: expenseCategorySchema,
    label: z.string().trim().min(1).max(200),
    spentOn: isoDateSchema,
    city: z.string().trim().max(120).nullable().default(null),
    detail: z.string().trim().max(300).nullable().default(null),
    amountCents: z.number().int().positive().max(100_000_000),
    vatRateBps: z.number().int().min(0).max(10_000).nullable().default(null),
    distanceKm: z.number().int().positive().max(100_000).nullable().default(null),
    fiscalHorsepower: z.number().int().positive().max(50).nullable().default(null),
  })
  .strict()

/**
 * Un justificatif joint.
 *
 * ⚠️ `downloadUrl` N'EST PAS dans ce corps, et c'est délibéré : une URL de
 * téléchargement fournie par le client serait une URL que le serveur n'a pas
 * vérifiée — on la rendrait ensuite à tous les membres de l'espace. Le lien
 * vers un fichier réellement stocké est posé par le service de stockage, pas
 * par le formulaire. Tant qu'il n'y en a pas, la pièce est NOMMÉE et sa
 * conservation datée, sans bouton qui ne télécharge rien.
 */
const expenseAttachmentInputSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    contentType: z.string().trim().max(255).nullable().default(null),
    /** `null` = poids inconnu. L'écran écrit « non mesuré », jamais « 0 KB ». */
    byteSize: z.number().int().nonnegative().max(1_000_000_000).nullable().default(null),
  })
  .strict()

/**
 * Le DÉPÔT d'une note — création comme édition.
 *
 * Un seul corps pour les deux, parce que c'est un seul geste : l'écran de dépôt
 * et l'écran d'édition sont le même formulaire, et deux schémas qui divergent
 * feraient accepter à la création ce que l'édition refuse.
 *
 * Les lignes et les pièces sont envoyées EN ENTIER, jamais par delta. Une note
 * de frais tient sur un écran ; un protocole d'ajout/retrait par identifiant
 * aurait exigé une réconciliation dont le seul bénéfice serait la taille du
 * corps — et dont le premier défaut serait une ligne fantôme.
 */
export const saveExpenseReportSchema = z
  .object({
    reference: z.string().trim().min(1).max(80),
    bearerName: z.string().trim().min(1).max(160),
    periodMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Format attendu : AAAA-MM'),
    missionId: z.string().guid().nullable().default(null),
    accountId: z.string().guid().nullable().default(null),
    lines: z.array(expenseLineInputSchema).max(200).default([]),
    attachments: z.array(expenseAttachmentInputSchema).max(50).default([]),
  })
  .strict()
export type SaveExpenseReportInput = z.infer<typeof saveExpenseReportSchema>

/* -------------------------------------------------------------------------- */
/*  LE BARÈME — ce que l'écran de réglage écrit                                */
/* -------------------------------------------------------------------------- */

/**
 * UNE RÉVISION du barème d'une politique — envoyée en entier, à UNE date.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI LA DATE EST EN TÊTE, ET NON SUR CHAQUE PLAFOND
 * ─────────────────────────────────────────────────────────────────────────────
 * Parce que c'est ainsi qu'un barème se décide : « à partir du 1er septembre,
 * voici nos plafonds ». Une date par ligne laisserait écrire un barème dont la
 * moitié aurait changé et l'autre pas, sans que personne sache ce qui était en
 * vigueur un jour donné.
 *
 * Et surtout, cette forme est ce qui rend l'enregistrement NON DESTRUCTIF : le
 * service ne remplace que les entrées portant CETTE date, et laisse intactes
 * les révisions antérieures. Sans elle, chaque enregistrement écraserait tout
 * l'historique — donc rejugerait des notes déjà décidées, ce que la date
 * d'effet existe précisément pour empêcher.
 *
 * ⚠️ `capCents: null` est une valeur SIGNIFIANTE et non un champ omis : elle
 * veut dire « cette catégorie n'est pas plafonnée », donc NON VÉRIFIÉE. Le
 * formulaire doit pouvoir l'écrire, sans quoi la seule façon de retirer un
 * plafond serait de le mettre à zéro — c'est-à-dire d'interdire la catégorie.
 *
 * ⚠️ `mileageRates` est une LISTE SAISIE, jamais un défaut. Vide, elle laisse
 * les indemnités kilométriques non vérifiées, ce qui est la réponse honnête
 * tant que l'ESN n'a pas dit quel barème elle applique.
 */
export const saveExpensePolicySchema = z
  .object({
    /** `null` = la politique par DÉFAUT de l'espace ; sinon celle d'un client. */
    accountId: z.string().guid().nullable().default(null),
    label: z.string().trim().min(1).max(160),
    reimbursementBasis: expenseReimbursementBasisSchema,
    /** La date d'effet de CETTE révision. Ré-enregistrer la même date la corrige. */
    effectiveFrom: isoDateSchema,
    caps: z
      .array(
        z
          .object({
            category: expenseCategorySchema,
            capCents: z.number().int().positive().max(100_000_000).nullable(),
            vatRecoverable: z.boolean(),
          })
          .strict(),
      )
      .max(60)
      .default([]),
    mileageRates: z
      .array(
        z
          .object({
            fiscalHorsepower: z.number().int().min(1).max(50),
            centsPerKm: z.number().int().positive().max(10_000),
          })
          .strict(),
      )
      .max(60)
      .default([]),
  })
  .strict()
export type SaveExpensePolicyInput = z.infer<typeof saveExpensePolicySchema>

/**
 * Le barème tel que l'écran de réglage le relit — TOUTES ses révisions.
 *
 * Elles sortent toutes, et pas seulement celle en vigueur : c'est ce qui permet
 * à l'écran de MONTRER l'historique, donc de le renvoyer intact. Un écran qui
 * ne connaîtrait que la dernière révision effacerait les autres au premier
 * enregistrement, sans que personne le voie.
 */
export type ExpensePolicyView = {
  id: string | null
  accountId: string | null
  accountName: string | null
  label: string
  reimbursementBasis: ExpenseReimbursementBasis
  caps: { category: ExpenseCategory; capCents: number | null; vatRecoverable: boolean; effectiveFrom: string | null }[]
  mileageRates: MileageRateFacts[]
}

/** Ce que l'écran de réglage reçoit : les barèmes, et les clients à qui en poser un. */
export type ExpensePolicyBoard = {
  policies: ExpensePolicyView[]
  /**
   * Les clients de l'espace, BORNÉS à 200 et triés par nom.
   *
   * La borne est dite parce qu'une liste tronquée en silence ferait croire
   * qu'un client n'existe pas. Au-delà, l'écran le NOMME plutôt que de laisser
   * chercher.
   */
  accounts: { id: string; name: string }[]
  accountsTruncated: boolean
}
