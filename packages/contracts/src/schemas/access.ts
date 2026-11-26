import { z } from 'zod'
import { evidenceFieldSourceSchema, fieldSourceRank, type FieldSource } from './provenance.js'

/* ------------------------------------------------------------------ */
/*  Le graphe d'accès — comment on entre chez un compte (tome 1 §7)    */
/* ------------------------------------------------------------------ */

/**
 * Les sept modes d'entrée. La note stratégique en cite trois ; le terrain en a
 * sept, dont **cinq indirects** — et c'est tout le pivot : le produit ne
 * connaissait qu'une porte, le client final.
 *
 * L'ordre est celui du §7, du plus direct au plus médiat. Il n'est pas un
 * classement de qualité : passer par un porteur n'est pas un échec, c'est
 * souvent la seule porte ouverte à une ESN de deux personnes.
 */
export const ACCESS_MODES = [
  'direct_reference',
  'direct_hors_panel',
  'filiale_bu',
  'rang2_soustraitance',
  'portage_marketplace',
  'cotraitance',
  'introduction_relation',
] as const
export const accessModeSchema = z.enum(ACCESS_MODES)
export type AccessMode = (typeof ACCESS_MODES)[number]

/**
 * L'état de verrouillage d'un compte, en quatre valeurs.
 *
 * `inconnu` n'est PAS un remplissage : « on ne sait pas si ce compte est
 * référencé » et « ce compte est ouvert » mènent à deux gestes opposés. Une
 * entreprise privée n'apparaît dans aucun registre de marchés — l'absence de
 * trace n'y prouve rien, et « probablement ouvert » est exactement la phrase
 * que le tome interdit.
 */
export const ACCESS_LOCK_STATES = ['ouvert', 'semi_ouvert', 'verrouille', 'inconnu'] as const
export const accessLockStateSchema = z.enum(ACCESS_LOCK_STATES)
export type AccessLockState = (typeof ACCESS_LOCK_STATES)[number]

/**
 * #4802 — l'ÉTAT D'ACCÈS qu'un humain pose sur un compte (`access_facts.kind = 'access_status'`).
 *
 * `inconnu` est un état POSÉ (« je ne sais pas ») : l'ordre des interlocuteurs reste alors celui
 * d'avant. `referenced` et `to_build` sont les valeurs que lit le classement des contacts
 * (#4271) : le rôle change l'ORDRE, jamais le CONTENU (c76).
 */
export const ACCESS_STATUS_VALUES = ['inconnu', 'referenced', 'to_build'] as const
export const accessStatusValueSchema = z.enum(ACCESS_STATUS_VALUES)
export type AccessStatusValue = (typeof ACCESS_STATUS_VALUES)[number]

/**
 * Ce dont un fait d'accès parle.
 *
 * Une TABLE de faits plutôt que des colonnes sur le compte : le critère
 * d'acceptation du ticket est « chaque information d'accès porte sa source ET
 * sa date », et une colonne ne porte ni l'une ni l'autre sans qu'on lui en
 * ajoute deux. Un fait, lui, les porte par construction — avec sa provenance,
 * donc avec la règle qui protège une correction humaine.
 */
export const ACCESS_FACT_KINDS = ['lock', 'mode', 'cost', 'path', 'access_status'] as const
export const accessFactKindSchema = z.enum(ACCESS_FACT_KINDS)
export type AccessFactKind = (typeof ACCESS_FACT_KINDS)[number]

export const accessFactSchema = z.object({
  id: z.string().guid(),
  account_id: z.string().guid(),
  entity_id: z.string().guid().nullable(),
  kind: accessFactKindSchema,
  /** L'état, le mode ou le coût. Interprété selon `kind`. */
  value: z.string(),
  /** Ce qui justifie le fait, en clair et en français. */
  detail: z.string().nullable(),
  /** D'où il vient : « DECP », « déclaré par Marie », « analyse du 22/08 ». */
  source: z.string(),
  /** Qui l'a écrit. `human` gagne sur `pipeline` — la règle est celle de
   *  `decideFieldWrite`, réutilisée plutôt que réinventée. */
  provenance: evidenceFieldSourceSchema,
  /** La date à laquelle le fait était VRAI, pas celle où on l'a écrit. C'est
   *  elle qui décide de la péremption. */
  observed_at: z.string().nullable(),
  created_at: z.string(),
})
export type AccessFact = z.infer<typeof accessFactSchema>

export const createAccessFactSchema = z
  .object({
    kind: accessFactKindSchema,
    value: z.string().trim().min(1).max(120),
    detail: z.string().trim().max(500).nullish(),
    entity_id: z.string().guid().nullish(),
    observed_at: z.string().trim().max(40).nullish(),
  })
  .refine(input => input.kind !== 'access_status' || accessStatusValueSchema.safeParse(input.value).success, {
    message: 'Un état d’accès est « inconnu », « référencé » ou « à bâtir ».',
    path: ['value'],
  })
export type CreateAccessFact = z.infer<typeof createAccessFactSchema>

/** #4802 — l'état d'accès tel que l'onglet Accès le rend : `null` tant que personne ne l'a posé. */
export type AccessStatusDeclaration = { state: AccessStatusValue; source: string; observed_at: string | null }

/**
 * #4802 — l'état d'accès POSÉ À LA MAIN : le plus récent par `observed_at` (à date égale, le dernier de la liste),
 * jamais filtré par la péremption — une correction humaine gagne toujours, quelle que soit sa date, et aucun
 * calcul ne la recouvre. Aucune déclaration (ou valeur inconnue) → `null` : l'écran dit « Accès inconnu ».
 */
export function declaredAccessStatus(
  facts: readonly Pick<AccessFact, 'kind' | 'value' | 'provenance' | 'source' | 'observed_at'>[],
): AccessStatusDeclaration | null {
  let best: AccessStatusDeclaration | null = null
  for (const fact of facts) {
    if (fact.kind !== 'access_status' || fact.provenance !== 'human') continue
    const parsed = accessStatusValueSchema.safeParse(fact.value)
    if (!parsed.success) continue
    if (best && (fact.observed_at ?? '') < (best.observed_at ?? '')) continue
    best = { state: parsed.data, source: fact.source, observed_at: fact.observed_at }
  }
  return best
}

/* ------------------------------------------------------------------ */
/*  La péremption (tome 1 §10.3)                                       */
/* ------------------------------------------------------------------ */

/**
 * Demi-vie d'un fait d'accès, en mois, par nature.
 *
 * Un référencement dure un à trois ans ; l'ouverture d'une ESN à la
 * sous-traitance change en un trimestre. Une fenêtre unique traiterait les deux
 * pareil, et la base mentirait six mois plus tard sans que personne sache
 * pourquoi.
 */
export const ACCESS_FACT_HALF_LIFE_MONTHS: Readonly<Record<AccessFactKind, number>> = {
  lock: 12,
  mode: 12,
  cost: 6,
  path: 12,
  // #4802 — jamais lue à travers cette fenêtre : un état posé à la main gagne quelle que soit sa date.
  access_status: 12,
}

export type AccessFreshness = 'fresh' | 'stale' | 'undated'

/**
 * Un fait périmé ne DISPARAÎT pas : il redevient à vérifier, et l'écran le dit.
 *
 * C'est la seule façon de ne pas mentir six mois plus tard. Le supprimer ferait
 * repartir de zéro un compte qu'on connaissait ; le garder sans le dater le
 * ferait passer pour frais.
 *
 * Un fait SANS date est `undated`, jamais `fresh` : l'absence de date n'est pas
 * une preuve de fraîcheur, et la traiter comme telle est précisément l'erreur
 * qui fait appeler un client sur une information de 2024.
 */
export function accessFreshness(fact: Pick<AccessFact, 'kind' | 'observed_at'>, now: Date): AccessFreshness {
  if (!fact.observed_at) return 'undated'
  const observed = new Date(fact.observed_at)
  if (Number.isNaN(observed.getTime())) return 'undated'
  const months = (now.getTime() - observed.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  return months > ACCESS_FACT_HALF_LIFE_MONTHS[fact.kind] ? 'stale' : 'fresh'
}

/**
 * #2130.102 — LA CONTRADICTION PARTENAIRES / ACCÈS, MATRICE MINIMALE
 * (décision Louis, 02/10/2026).
 *
 * Une SEULE combinaison se contredit : la MÊME entité du compte est
 * « concurrent » (`account_partners.relationship = 'competitor'`) côté
 * Partenaires ET « verrouillée » (fait `lock` = `verrouille`, encore FRAIS)
 * côté Accès. Toute autre combinaison est admise — la garde ne dit NON qu'à ce
 * cas.
 *
 * ⚠️ La clé est `entity_id`, des deux côtés, et rien d'autre : aucune
 * comparaison de texte entre `name` et `detail` (écartée cinq lots de suite —
 * un rapprochement deviné fabriquerait des faux positifs sur un fait déjà
 * sourcé et daté). Une entité absente d'un côté ne contredit jamais rien. Un
 * fait périmé ou sans date ne fait pas autorité (§10.3) : il ne contredit pas.
 */
export type PartnerAccessContradiction = {
  entity_id: string
  partner_id: string
  partner_name: string
  fact_id: string
}

export function partnerAccessContradictions(
  partners: readonly { id: string; name: string; entity_id: string | null; relationship: string }[],
  facts: readonly { id: string; kind: string; value: string; entity_id: string | null; freshness: string }[],
): PartnerAccessContradiction[] {
  const out: PartnerAccessContradiction[] = []
  for (const partner of partners) {
    if (partner.relationship !== 'competitor' || !partner.entity_id) continue
    const locked = facts.find(
      fact =>
        fact.kind === 'lock' &&
        fact.value === 'verrouille' &&
        fact.freshness === 'fresh' &&
        fact.entity_id === partner.entity_id,
    )
    if (locked) {
      out.push({
        entity_id: partner.entity_id,
        partner_id: partner.id,
        partner_name: partner.name,
        fact_id: locked.id,
      })
    }
  }
  return out
}

/**
 * Le fait qui fait autorité pour une nature donnée.
 *
 * Deux règles, dans cet ordre : la PROVENANCE d'abord — une correction humaine
 * gagne toujours sur une déduction du pipeline, quelle que soit sa date, parce
 * que c'est exactement la promesse du bouton « Ce n'est pas exact » — puis la
 * date d'observation, la plus récente gagnant.
 *
 * L'ordre compte : trier par date d'abord ferait qu'une réanalyse du lendemain
 * reprendrait la main sur une correction de la veille, et l'utilisateur la
 * referait toutes les semaines.
 */
export function bestAccessFact<T extends Pick<AccessFact, 'provenance' | 'observed_at'>>(
  facts: readonly T[],
): T | null {
  let best: T | null = null
  for (const fact of facts) {
    if (best === null) {
      best = fact
      continue
    }
    const rank = fieldSourceRank(fact.provenance as FieldSource)
    const bestRank = fieldSourceRank(best.provenance as FieldSource)
    if (rank > bestRank) {
      best = fact
      continue
    }
    if (rank < bestRank) continue
    const at = fact.observed_at ? Date.parse(fact.observed_at) : Number.NaN
    const bestAt = best.observed_at ? Date.parse(best.observed_at) : Number.NaN
    // Un fait daté bat un fait sans date : « je ne sais pas quand » ne peut pas
    // primer sur « le 12 mars ».
    if (Number.isNaN(bestAt) && !Number.isNaN(at)) best = fact
    else if (!Number.isNaN(at) && !Number.isNaN(bestAt) && at > bestAt) best = fact
  }
  return best
}

/**
 * Les modes d'entrée, classés par faisabilité pour CE compte (U11).
 *
 * La faisabilité n'est pas un score : c'est ce qu'on SAIT. Un mode est
 * `available` quand un fait le dit, `possible` quand rien ne l'empêche, et
 * `blocked` quand un fait l'exclut. On ne classe jamais un mode « impossible »
 * faute de donnée — l'ignorance n'est pas un obstacle.
 */
export type AccessModeFeasibility = 'available' | 'possible' | 'blocked'

export function rankAccessModes(input: {
  lock: AccessLockState
  /** Le compte a-t-il des entités connues ? Le mode filiale en dépend. */
  hasEntities: boolean
  /** Une ESN est-elle détectée en place ? Le rang 2 en dépend. */
  hasIncumbent: boolean
  /** Une relation existe-t-elle dans les outils connectés ? */
  hasRelation: boolean
}): { mode: AccessMode; feasibility: AccessModeFeasibility }[] {
  const { lock, hasEntities, hasIncumbent, hasRelation } = input
  const feasibility = (mode: AccessMode): AccessModeFeasibility => {
    switch (mode) {
      case 'direct_reference':
        return lock === 'verrouille' ? 'blocked' : lock === 'ouvert' ? 'available' : 'possible'
      case 'direct_hors_panel':
        // Un panel fermé n'interdit pas le hors-panel : c'est précisément ce
        // que font les prescripteurs qui contournent leur direction achats.
        return lock === 'ouvert' ? 'available' : 'possible'
      case 'filiale_bu':
        return hasEntities ? 'available' : 'possible'
      case 'rang2_soustraitance':
        return hasIncumbent ? 'available' : 'possible'
      case 'introduction_relation':
        return hasRelation ? 'available' : 'possible'
      default:
        // Portage et cotraitance sont DÉCLARATIFS : aucune source publique ne
        // dit qu'un compte les accepte. Les annoncer disponibles serait une
        // promesse, les annoncer bloqués une invention.
        return 'possible'
    }
  }
  const weight: Readonly<Record<AccessModeFeasibility, number>> = { available: 0, possible: 1, blocked: 2 }
  return ACCESS_MODES.map(mode => ({ mode, feasibility: feasibility(mode) })).sort(
    (left, right) => weight[left.feasibility] - weight[right.feasibility],
  )
}

/* ------------------------------------------------------------------ */
/*  Ce que le pipeline peut déduire — et ce qu'il ne peut pas          */
/* ------------------------------------------------------------------ */

/**
 * Un marché attribué, lu de façon TOLÉRANTE.
 *
 * Le même objet voyage sous deux formes : l'IA émet `notifiedDate`, et
 * `raw_analysis` le stocke en `notified_date` (tout le blob est passé au
 * serpent à la persistance). Lire une seule des deux marcherait au collecteur
 * et rendrait `null` en base — le genre de trou qui ne se voit sur aucun écran
 * avant des semaines.
 */
type AwardLike = {
  title?: string | null
  buyer?: string | null
  winner?: string | null
  notifiedDate?: string | null
  notified_date?: string | null
  /** Fin du marché, calculée à la COLLECTE (`datenotification + dureemois`).
   *  Deux orthographes pour la même raison que `notifiedDate` : la persistance
   *  passe tout le dossier au serpent. */
  endsOn?: string | null
  ends_on?: string | null
  url?: string | null
}

/** Incident 24/09 : DECP publie parfois la date comme le TEXTE « None ». Une
 *  date illisible est une ABSENCE — jamais le texte brut, qui part ensuite en
 *  `observed_at` (timestamptz) et annule la transaction de l'analyse. */
function awardDate(award: AwardLike): string | null {
  const raw = (award.notifiedDate ?? award.notified_date ?? null)?.trim() || null
  return raw !== null && !Number.isNaN(Date.parse(raw)) ? raw : null
}

function awardEnd(award: AwardLike): string | null {
  return (award.endsOn ?? award.ends_on ?? null)?.trim() || null
}

/** Combien de mois avant l'échéance la consultation de renouvellement se
 *  prépare. Six mois est la borne basse observée sur les accords-cadres
 *  publics : en deçà, le dossier est déjà écrit et l'appel déjà lancé. */
const RENEWAL_LEAD_MONTHS = 6

function parseDay(value: string | null): Date | null {
  if (!value) return null
  const at = Date.parse(value)
  if (Number.isNaN(at)) return null
  return new Date(at)
}

/** `2029-03-12` moins six mois → `2028-09-12`. Rendu `null` si la date tombe
 *  dans le passé : une fenêtre de renouvellement déjà passée n'est pas une
 *  date à appeler, c'est une date morte — et l'écran doit dire autre chose. */
function reopeningDay(end: Date, now: Date): string | null {
  const reopen = new Date(end.getTime())
  reopen.setUTCMonth(reopen.getUTCMonth() - RENEWAL_LEAD_MONTHS)
  if (reopen.getTime() <= now.getTime()) return null
  return reopen.toISOString().slice(0, 10)
}

function frenchDay(value: Date): string {
  return `${String(value.getUTCDate()).padStart(2, '0')}/${String(value.getUTCMonth() + 1).padStart(2, '0')}/${value.getUTCFullYear()}`
}

/**
 * Le fait de verrouillage déductible d'une attribution publique.
 *
 * Un marché attribué est un FAIT : un prestataire est en place chez cet
 * acheteur. Ce qu'on en conclut dépend d'UNE donnée — la durée du marché.
 *
 * ⚠️ Le tome 1 refusait d'aller plus loin sur un fait faux : « DECP ne publie
 * pas la durée ». Vérifié en direct le 22/08 sur les deux jeux réellement
 * appelés : `dureemois` est publié, et 100 marchés IT récents sur 100 le
 * portent. La collecte calcule donc `endsOn`, et trois cas s'ouvrent :
 *
 * - **marché en cours** ⇒ `verrouille`, avec sa date de fin ET la fenêtre de
 *   renouvellement. C'est ce que le tome 2 §14 appelle « la seule source qui
 *   transforme un non en rendez-vous daté » ;
 * - **marché échu** ⇒ `semi_ouvert` : le renouvellement a pu être attribué sans
 *   publication récente. Dire « verrouillé » affirmerait une porte fermée qu'on
 *   n'a pas vue, dire « ouvert » promettrait l'inverse ;
 * - **durée absente ou illisible** ⇒ `semi_ouvert`, et on le DIT : « il y a une
 *   porte, et elle passe par quelqu'un ».
 *
 * Sans aucune attribution, la fonction rend `null` — surtout pas `ouvert`. Une
 * entreprise privée n'apparaît dans AUCUN registre de marchés publics : y lire
 * une absence de référencement serait tirer une conclusion d'un silence.
 *
 * La règle est ici et nulle part ailleurs : le scoreur de Découvrir la
 * réapplique sur les signaux, l'analyse sur les marchés collectés, et deux
 * copies finiraient par diverger sur l'état le plus lourd de conséquence.
 */
export function lockFactFromAwards(
  awards: readonly AwardLike[] | null | undefined,
  now: Date = new Date(),
): {
  value: AccessLockState
  detail: string
  source: string
  observedAt: string | null
  /** Quand la consultation de renouvellement se prépare, ou `null` : jamais
   *  une date passée, jamais une date déduite d'une durée qu'on n'a pas. */
  reopensOn: string | null
} | null {
  if (!Array.isArray(awards) || awards.length === 0) return null

  // Le marché qui décide est celui qui tient la porte le PLUS LONGTEMPS, pas le
  // plus récent : un petit marché notifié hier ne rouvre pas un accord-cadre de
  // quatre ans signé l'an dernier. À défaut d'échéance, on retombe sur la date
  // de notification la plus récente — le seul ordre disponible.
  let running: { award: AwardLike; end: Date } | null = null
  let newest: AwardLike | null = null
  let newestAt = Number.NEGATIVE_INFINITY
  for (const award of awards) {
    if (!award || typeof award !== 'object') continue
    const end = parseDay(awardEnd(award))
    if (end !== null && end.getTime() > now.getTime()) {
      if (running === null || end.getTime() > running.end.getTime()) running = { award, end }
    }
    const raw = awardDate(award)
    const at = raw ? Date.parse(raw) : Number.NaN
    if (Number.isNaN(at)) {
      if (newest === null) newest = award
      continue
    }
    if (at > newestAt) {
      newestAt = at
      newest = award
    }
  }

  const chosen = running?.award ?? newest
  if (!chosen) return null

  const winner = (chosen.winner ?? '').trim()
  const title = (chosen.title ?? '').trim()
  const head = winner ? `marché attribué à ${winner}` : 'marché public attribué'

  if (running) {
    const reopensOn = reopeningDay(running.end, now)
    const reopenText = reopensOn
      ? `consultation de renouvellement à préparer vers le ${frenchDay(new Date(reopensOn))}`
      : 'renouvellement imminent — la consultation est déjà lancée ou sur le point de l’être'
    return {
      value: 'verrouille',
      detail: [head, title || null, `en cours jusqu’au ${frenchDay(running.end)}`, reopenText]
        .filter(Boolean)
        .join(' · '),
      source: 'DECP (commande publique)',
      observedAt: awardDate(chosen),
      reopensOn,
    }
  }

  const expired = parseDay(awardEnd(chosen))
  const detail = [
    head,
    title || null,
    expired
      ? // Un marché échu ne rouvre pas la porte de lui-même : le titulaire
        // suivant a pu être désigné sans qu'aucune donnée ne le dise encore.
        `échu depuis le ${frenchDay(expired)} — le renouvellement a pu être attribué depuis, à vérifier au premier contact`
      : 'échéance du marché non publiée — à vérifier au premier contact',
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    value: 'semi_ouvert',
    detail,
    source: 'DECP (commande publique)',
    observedAt: awardDate(chosen),
    reopensOn: null,
  }
}

/* ------------------------------------------------------------------ */
/*  Les quatre familles de résultat (tome 1 §8.4)                      */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'on dit d'un compte quand on le range.
 *
 * Le tome fixe quatre familles et une règle qui les tient toutes : la
 * quatrième est **AFFICHÉE, pas masquée** (D59). Un commercial doit savoir
 * qu'un compte existe, pourquoi il n'est pas pour lui aujourd'hui, et ce qui
 * changerait la réponse. Masquer les comptes hors de portée fait chercher
 * ailleurs ce qu'on a déjà écarté pour lui.
 */
export const DISCOVER_FAMILIES = ['reachable', 'via_intermediary', 'investigate', 'out_of_reach'] as const
export type DiscoverFamily = (typeof DISCOVER_FAMILIES)[number]

/** Part de l'adressabilité obtenue sur son maximum RÉELLEMENT mesurable. */
export function addressabilityRatio(input: { score: number | null; max: number } | null | undefined): number | null {
  if (!input || input.max <= 0 || input.score === null) return null
  return input.score / input.max
}

/** Au-delà de cette part du mesurable, on dit « tu peux y aller ». */
export const REACHABLE_RATIO = 0.7

/**
 * La famille d'un candidat.
 *
 * L'ORDRE d'évaluation est la règle, et il n'est pas cosmétique :
 *
 * 1. **hors de portée** d'abord — une disproportion de taille est le seul
 *    empêchement qu'aucun chemin ne lève. Un compte de 190 000 personnes reste
 *    hors de portée d'une ESN de deux, même avec une porte grande ouverte ;
 * 2. **via un intermédiaire** ensuite — un prestataire en place n'interdit pas
 *    d'entrer, il impose par où ;
 * 3. **tu peux y aller** — deux conditions, et la première a été ajoutée après
 *    la recette live du 22/08 : le VERROUILLAGE doit avoir été regardé et dire
 *    « ouvert ». La règle « un axe non mesuré sort du dénominateur » vaut pour
 *    un SCORE ; appliquée à un verdict, elle transformait une ignorance en
 *    promesse — un compte noté sur la seule proportion sortait « rien ne semble
 *    bloquer l'entrée » alors que personne n'avait regardé la porte, ce que le
 *    tome interdit en toutes lettres. Le prix est assumé : sur une entreprise
 *    privée, aucune source publique ne parle du verrouillage, donc la famille
 *    ne sortira qu'à partir d'un fait — une consultation ouverte, ou un fait
 *    d'accès saisi. Seconde condition inchangée : quelque chose BOUGE — sans
 *    signal, « tu peux entrer » est vrai et inutile ;
 * 4. **à investiguer** en dernier — c'est le cas par défaut, et il est honnête :
 *    « intéressant, mais je ne sais pas si tu peux entrer ».
 *
 * Inverser 1 et 3 ferait remonter en tête de liste exactement les comptes que
 * Loïc met huit mois à ne pas ouvrir.
 */
export function discoverFamily(input: {
  addressability?: { score: number | null; max: number; factors: readonly { axis: string; points: number }[] } | null
  signalCount: number
}): DiscoverFamily {
  const addressability = input.addressability
  if (!addressability || addressability.max <= 0) return 'investigate'

  const proportion = addressability.factors.find(factor => factor.axis === 'proportion')
  if (proportion && proportion.points <= 1) return 'out_of_reach'

  const lock = addressability.factors.find(factor => factor.axis === 'lock')
  // 4 points sur 6 = « un prestataire est déjà en place » (cf. `_lock_axis`).
  if (lock && lock.points > 0 && lock.points < 6) return 'via_intermediary'

  // Le verrou OUVERT (6 points sur 6 = « consultation ouverte », cf. `_lock_axis`)
  // est la seule donnée qui parle de la porte. Sans lui, on ne conclut pas.
  const ratio = addressabilityRatio(addressability)
  if (lock && lock.points >= 6 && ratio !== null && ratio >= REACHABLE_RATIO && input.signalCount > 0) {
    return 'reachable'
  }
  return 'investigate'
}

/* ------------------------------------------------------------------ */
/*  Un contact qui change d'entreprise (tome 1 §11.4, BEL-ACC-007)     */
/* ------------------------------------------------------------------ */

/**
 * Ce qu'on propose d'ouvrir quand un contact connu réapparaît ailleurs.
 *
 * Le dépôt traite déjà ce cas — mais dans un seul sens : le contact prend un
 * badge RISQUE, son axe de fraîcheur tombe à 1, son cycle de vie passe
 * `historique`. C'est une DÉGRADATION de donnée, et c'est vrai.
 *
 * C'est aussi, et surtout, une PORTE NEUVE dans un compte qu'on n'avait pas
 * ciblé : quelqu'un qui vous connaît vient d'arriver ailleurs. Le tome appelle
 * ce cas « le plus rentable des six », et le produit n'en faisait rien.
 *
 * Double traitement : le badge RISQUE est CONSERVÉ sur le compte d'origine — il
 * dit une vérité, ne plus écrire à cette personne là-bas — et une proposition
 * d'ouverture naît sur le nouveau compte.
 */
export type JobChangeOpening = {
  label: string
  detail: string
  accessMode: AccessMode
  /** `detected` toujours : une porte n'est pas une affaire. La règle de
   *  non-régression du §4 est explicite — aucune détection ne fait avancer un
   *  projet dans le pipe. */
  stage: 'detected'
}

export function jobChangeOpening(input: {
  contactName: string
  /** Le compte où on l'a connu. */
  previousAccountName: string
  /** L'employeur détecté aujourd'hui. */
  newEmployer: string
  /** Depuis quand la relation existe — la citer est ce qui la rend utilisable. */
  knownSince: string | null
}): JobChangeOpening | null {
  const contact = input.contactName.trim()
  const employer = input.newEmployer.trim()
  const previous = input.previousAccountName.trim()
  // Sans nom de personne ou sans employeur, il n'y a pas de porte à décrire :
  // « quelqu'un que vous connaissez est quelque part » ne se travaille pas.
  if (!contact || !employer) return null
  const since = input.knownSince?.trim()
  const detail = [
    `${contact} est détecté chez ${employer}.`,
    previous ? `Relation nouée ${since ? `depuis ${since} ` : ''}chez ${previous}.` : null,
    // Dit explicitement : le produit propose une PORTE, il n'affirme pas un besoin.
    'Aucun besoin n’est connu ici — c’est une porte, pas une affaire.',
  ]
    .filter(Boolean)
    .join(' ')
  return {
    label: `Porte via ${contact}`,
    detail,
    accessMode: 'introduction_relation',
    stage: 'detected',
  }
}

/* ------------------------------------------------------------------ */
/*  La fenêtre de référencement (tome 1, F08)                          */
/* ------------------------------------------------------------------ */

/**
 * Les trois jalons avant la réouverture d'un marché, en MOIS.
 *
 * Neuf, six et trois — pas un seul, et pas dix. Un unique rappel « c'est
 * dans trois mois » arrive quand le cahier des charges est déjà écrit avec le
 * titulaire sortant ; à neuf mois on peut encore rencontrer l'acheteur, à six
 * on peut peser sur le besoin, à trois on ne peut plus que répondre.
 */
export const REFERENCING_MILESTONES_MONTHS = [9, 6, 3] as const

export type ReferencingAlert = {
  /** Le jalon franchi, en mois. */
  milestone: number
  /** Le jour où la consultation se prépare. */
  reopensOn: string
  /** Combien de jours il reste — pour trier, pas pour décorer. */
  daysAhead: number
}

/**
 * Faut-il alerter aujourd'hui sur la réouverture d'un référencement ?
 *
 * Rend le jalon le plus PROCHE encore devant nous, ou `null`. Trois refus, et
 * chacun évite une alerte qui ferait ignorer les suivantes :
 *
 * - une échéance inconnue n'alerte JAMAIS (`null` n'est pas « imminent ») ;
 * - une date déjà passée n'alerte plus — la consultation est lancée, prévenir
 *   maintenant ne sert qu'à faire constater qu'on a raté la fenêtre ;
 * - un seul jalon à la fois, le plus proche : les trois d'un coup le jour où on
 *   dépasse neuf mois seraient trois notifications pour une seule information.
 *
 * La comparaison porte sur le JOUR et non sur l'instant : une alerte qui
 * dépendrait de l'heure du balayage se déclencherait ou non selon la minute.
 */
export function referencingWindowAlert(
  reopensOn: string | null | undefined,
  now: Date = new Date(),
): ReferencingAlert | null {
  if (!reopensOn) return null
  const target = parseDay(reopensOn)
  if (target === null) return null

  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const daysAhead = Math.round((target.getTime() - startOfDay.getTime()) / 86_400_000)
  if (daysAhead < 0) return null

  // Un mois vaut 30 jours ici, délibérément : la donnée d'origine est une durée
  // en mois arrondie, et calculer un calendrier exact sur une échéance
  // approximative donnerait une fausse précision.
  // Du plus PROCHE au plus lointain : à 80 jours de la réouverture, le jalon
  // franchi est celui des trois mois, pas celui des neuf — parcourir dans
  // l'autre sens rendrait toujours le plus large et l'alerte dirait « dans neuf
  // mois » trois semaines avant la consultation.
  for (const milestone of [...REFERENCING_MILESTONES_MONTHS].reverse()) {
    if (daysAhead <= milestone * 30) return { milestone, reopensOn, daysAhead }
  }
  return null
}
