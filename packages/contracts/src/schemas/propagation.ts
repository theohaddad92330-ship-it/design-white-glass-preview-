import { z } from 'zod'
import { financeScopeInfoSchema } from './finance-scope.js'
import { measurabilitySchema } from './measurability.js'

/**
 * LA CARTE DE PROPAGATION DU CONTEXTE — les six agrégats du back-office
 * (PDF 2 du dossier du 26/08, §4).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE LE COMMERCIAL PERD SANS EUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Il entre en rendez-vous chez un client sans savoir ce que ce client lui a
 * rapporté. La donnée existe — les missions, les mois facturés, les
 * affectations — mais elle ne vit que sur l'écran où elle est saisie. §4.1 :
 * « une donnée du back-office n'existe pas seulement là où elle est saisie ;
 * elle apparaît partout où elle change une décision. »
 *
 * Les six, et où ils s'affichent :
 *  1. CA cumulé PAR COMPTE ............ bandeau « ce client vous a rapporté X € »
 *  2. Missions signées PAR CONTACT .... badge « a signé 2 missions »
 *  3. Tarif vendu moyen PAR COMPTE .... « à quel prix ce client achète »
 *  4. Placements PAR CONSULTANT ....... colonne « placé 4 fois » du vivier
 *  5. Marge moyenne PAR CONSULTANT .... onglet de la fiche, sous droit financier
 *  6. Dernière mission PAR CONSULTANT . DÉJÀ LIVRÉ (`talent.service.ts`)
 *
 * Aucun n'est un objet nouveau. Ce sont des agrégats calculés sur des tables
 * existantes, à la LECTURE, et jamais stockés — un CA cumulé écrit en base
 * serait faux au premier mois facturé.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ §4.4 — LA RÈGLE QUI EMPÊCHE LA SECONDE VÉRITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * **Chaque bloc propagé porte un lien vers sa source et ne s'édite jamais sur
 * place.**
 *
 *     « Le CA cumulé d'un compte se LIT sur la fiche compte. Il se CALCULE dans
 *      les missions. On ne le corrige pas depuis le compte. »
 *
 * Sans cette règle, le même chiffre devient corrigible à deux endroits, et les
 * deux divergent le jour où quelqu'un s'en sert. Elle est tenue ici par le
 * TYPE, pas par une convention :
 *
 *  · {@link propagatedBlockSchema} exige une `source` — un bloc sans lien vers
 *    l'écran où il se calcule ne parse pas ;
 *  · `editable` est un `z.literal(false)` — écrire `true` ne compile pas et ne
 *    parse pas ;
 *  · {@link propagated} est le seul constructeur, et il pose les deux ;
 *  · côté API, `propagation-source-link.spec.ts` vérifie qu'AUCUN chemin
 *    d'écriture n'existe sur ces valeurs — ce n'est pas une convention, c'est
 *    l'absence de code.
 */

/**
 * D'où sort le chiffre. `missions` pour tout ce qui se compte sur les missions
 * et les affectations, `invoices` pour ce qui se somme sur les mois facturés.
 */
export const PROPAGATION_SOURCE_KINDS = ['missions', 'invoices'] as const

/**
 * Les filtres que le lien de source a le droit d'utiliser.
 *
 * ⚠️ Ils doivent exister dans `readFilters` (`delivery.controller.ts`) : un
 * paramètre que l'API ignore renvoie sur la liste ENTIÈRE des missions, et un
 * lien qui ne montre pas la source ment sur la source. La garde
 * `propagation-source-link.spec.ts` relit le contrôleur pour le vérifier.
 */
export const PROPAGATION_FILTER_KEYS = ['accountId', 'consultantId'] as const

export const propagatedSourceSchema = z.object({
  kind: z.enum(PROPAGATION_SOURCE_KINDS),
  /** Le lien vers l'écran où le chiffre se CALCULE — donc où il se corrige. */
  href: z.string().min(1),
  /** Ce que le lien montre, dit en toutes lettres. Un lien nu ne se clique pas. */
  label: z.string().min(1),
})
export type PropagatedSource = z.infer<typeof propagatedSourceSchema>

export const propagatedBlockSchema = z.object({
  source: propagatedSourceSchema,
  /**
   * TOUJOURS `false`. Un bloc propagé se lit là où il change une décision et se
   * corrige là où il se calcule — jamais l'inverse.
   */
  editable: z.literal(false),
})
export type PropagatedBlock = z.infer<typeof propagatedBlockSchema>

/** Les missions d'un compte — la source du CA cumulé et du tarif vendu moyen. */
export function missionsOfAccount(accountId: string): PropagatedSource {
  return { kind: 'missions', href: `/missions?accountId=${accountId}`, label: 'Les missions de ce compte' }
}

/** Les missions d'un consultant — la source des placements et de la marge. */
export function missionsOfConsultant(consultantId: string): PropagatedSource {
  return { kind: 'missions', href: `/missions?consultantId=${consultantId}`, label: 'Les missions de ce consultant' }
}

/**
 * Le SEUL constructeur d'un bloc propagé.
 *
 * Il pose la source ET le verrou d'un même geste. Un agrégat construit à la
 * main pourrait en oublier un des deux ; ici, la seule façon d'obtenir la forme
 * que les schémas acceptent est de passer par lui.
 */
export function propagated<T extends object>(value: T, source: PropagatedSource): T & PropagatedBlock {
  return { ...value, source, editable: false }
}

/* ── 3. Tarif vendu moyen par compte ──────────────────────────────────────── */

/**
 * Le prix auquel ce client achète, et le nombre de missions qui le composent.
 *
 * ⚠️ Le TJM facturé n'est PAS derrière `finance:read`, et c'est délibéré : le
 * prix de VENTE est visible par design (`mission.ts`, doctrine du 28/08/2026),
 * ce sont les entrées de la MARGE qui se gardent. Deux fausses alertes ont déjà
 * été levées dans ce dépôt sur ce point.
 */
export const accountPropagationSchema = propagatedBlockSchema.extend({
  accountId: z.string().guid(),
  /** Missions de ce compte, tous statuts — c'est le « sur N missions ». */
  missions: z.number().int().positive(),
  /**
   * `null` = aucune mission de ce compte ne porte de TJM (un forfait n'en a
   * pas). ⚠️ `positive()` et non `nonnegative()` : « 0 € de TJM moyen » n'est
   * pas une mesure, c'est une fiche vide, et l'écrire ferait croire à un prix.
   */
  averageSoldDailyRateCents: z.number().int().positive().nullable(),
  /** Combien de missions sortent du calcul faute de TJM. Le moyen est alors
   *  partiel, et il le dit. */
  missionsWithoutRate: z.number().int().nonnegative(),
})
export type AccountPropagation = z.infer<typeof accountPropagationSchema>

/* ── 1. CA cumulé par compte ──────────────────────────────────────────────── */

/**
 * « Ce client vous a rapporté X € sur N missions. »
 *
 * Le montant est celui des mois FACTURÉS (`invoice_readiness`) — la même source
 * que la ligne « facturé » de `RevenueService`, jamais une estimation
 * « TJM × durée » qui varierait selon qu'on compte 20 ou 21 jours par mois.
 *
 * ⚠️ Sous droit financier, comme la ligne de chiffre d'affaires dont il est
 * l'agrégat par compte : `finance:read` voit l'espace, `finance:read:own`
 * restreint au portefeuille de l'appelant. Deux routes qui rendraient le MÊME
 * chiffre sous deux droits différents seraient le vrai défaut.
 */
export const accountRevenuePropagationSchema = propagatedBlockSchema.extend({
  accountId: z.string().guid(),
  /**
   * `null` = aucun mois facturé ne porte de montant. **Jamais 0** : « ce client
   * ne vous a rien rapporté » et « personne n'a encore saisi de montant » font
   * chercher la panne à deux endroits opposés.
   */
  invoicedCents: z.number().int().nullable(),
  /** Les mois facturés qui composent le total. */
  invoicedMonths: z.number().int().nonnegative(),
  /** Les missions distinctes derrière ces mois — le « sur N missions ». */
  missions: z.number().int().nonnegative(),
  /** Les mois facturés SANS montant : le total annoncé est un plancher. */
  monthsWithoutAmount: z.number().int().nonnegative(),
})
export type AccountRevenuePropagation = z.infer<typeof accountRevenuePropagationSchema>

/* ── 2. Missions signées par contact ──────────────────────────────────────── */

/**
 * « Ce contact a signé 2 missions » — un contact qui a ACHETÉ n'est pas un
 * prospect, et c'est la seule chose que le badge sert à dire.
 *
 * ⚠️ Aucune ligne à zéro n'existe : un contact qui n'a rien signé n'apparaît
 * pas. « A signé 0 mission » se lirait comme une mesure alors que c'est
 * l'absence de mesure.
 */
export const contactPropagationSchema = propagatedBlockSchema.extend({
  contactId: z.string().guid(),
  /** Le compte qui porte ces missions — c'est lui que le lien de source filtre. */
  accountId: z.string().guid(),
  signedMissions: z.number().int().positive(),
})
export type ContactPropagation = z.infer<typeof contactPropagationSchema>

/* ── 4. Placements par consultant ─────────────────────────────────────────── */

/**
 * « Placé 4 fois. »
 *
 * ⚠️ Un PLACEMENT n'est pas un POSITIONNEMENT. Le vivier comptait déjà des
 * `submissions` (`talent.service.ts`) : une proposition envoyée à un client.
 * Un placement est une mission qui a DÉMARRÉ. Les confondre gonfle le compteur
 * de tous ceux qu'on présente beaucoup et qu'on place peu — exactement la
 * personne qu'un recruteur doit repérer.
 */
export const consultantPropagationSchema = propagatedBlockSchema.extend({
  consultantId: z.string().guid(),
  placements: z.number().int().positive(),
})
export type ConsultantPropagation = z.infer<typeof consultantPropagationSchema>

/* ── 5. Marge moyenne par consultant ──────────────────────────────────────── */

/**
 * La marge moyenne des missions d'un consultant, PONDÉRÉE par les jours
 * déclarés — `aggregateMargin`, et pas une seconde formule.
 *
 * ⚠️ `marginPercent` porte ce nom parce que c'est celui que `redactFinance`
 * connaît (D45) : sans le droit, il vaut `null`, PRÉSENT et vide, jamais retiré
 * et jamais mis à zéro. Une rédaction écrite à la main ici divergerait des trois
 * autres, ce que la garde `finance-redaction-single-path.spec.ts` interdit.
 */
export const consultantMarginPropagationSchema = propagatedBlockSchema.extend({
  consultantId: z.string().guid(),
  marginPercent: z.number().nullable(),
  /** Missions entrées dans le calcul. */
  measured: z.number().int().nonnegative(),
  /** Missions SORTIES du calcul faute d'un terme — comptées, jamais fondues. */
  unmeasured: z.number().int().nonnegative(),
  /** « Non mesurable — 2 missions sur les 5 nécessaires. » */
  measurability: measurabilitySchema,
})
export type ConsultantMarginPropagation = z.infer<typeof consultantMarginPropagationSchema>

/* ── La réponse des deux routes ───────────────────────────────────────────── */

export const propagationDigestSchema = z.object({
  accounts: z.array(accountPropagationSchema),
  contacts: z.array(contactPropagationSchema),
  consultants: z.array(consultantPropagationSchema),
})
export type PropagationDigest = z.infer<typeof propagationDigestSchema>

export const financePropagationDigestSchema = z.object({
  accounts: z.array(accountRevenuePropagationSchema),
  consultants: z.array(consultantMarginPropagationSchema),
  /**
   * Le DROIT voyage avec la réponse. Depuis que `marginPercent` vaut `null` au
   * lieu de disparaître (D45), la forme du champ ne dit plus si c'est « pas ton
   * périmètre » ou « pas mesuré » — sans ce drapeau, l'écran ne peut plus les
   * dire différemment.
   */
  canReadFinance: z.boolean(),
})
export type FinancePropagationDigest = z.infer<typeof financePropagationDigestSchema>

/**
 * Ce que `GET /delivery/finance/propagation` rend : le digest, PLUS le périmètre
 * réellement servi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, JAMAIS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * Le bandeau de compte dit « ce client **vous** a rapporté X € ». Depuis que la
 * portée se DEMANDE (`?scope=own`), une liste vide ne dit plus laquelle des
 * trois choses est vraie :
 *
 *  1. `canReadFinance: false` — « tu n'as pas le droit de voir la marge
 *     d'équipe » ; le geste est de demander un accès ;
 *  2. `invoicedCents: null` — « personne n'a saisi de montant » ; le geste est
 *     de remplir une fiche ;
 *  3. `scope.outsideAnyPortfolio > 0` sur une liste VIDE — « rien ne t'est
 *     rattaché » ; le geste est de réclamer son portefeuille.
 *
 * Les deux premiers existaient déjà et ne se remplacent pas ; le rattachement
 * est un TROISIÈME état, et le taire ferait lire « ce client ne vous a rien
 * rapporté » à quelqu'un dont aucun compte n'est attribué.
 *
 * ⚠️ Le DIGEST lui-même ne bouge pas : `financeDigest()` calcule des agrégats et
 * ne connaît pas le nombre de missions hors périmètre — celui-ci vit dans
 * `RevenueService.scopeInfo`, seul endroit où `UNASSIGNED_MISSIONS_SQL` est lu.
 * Le composer ici plutôt que de l'y faire descendre garde UNE définition du
 * « hors périmètre » pour les quatre lectures qui la servent.
 */
export const financePropagationResponseSchema = financePropagationDigestSchema.extend({
  scope: financeScopeInfoSchema,
})
export type FinancePropagationResponse = z.infer<typeof financePropagationResponseSchema>
