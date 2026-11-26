import { esnNafClass } from '@bellum/contracts'
import type { DiscoverCandidate, DiscoverPortfolioState, DiscoverSignal } from './discover-types'
import { candidateSiteCities } from './discover-site-cities'
import { rank2StatusFor, type PartnerRank2Status, type PartnerRelationSummary } from './discover-filters'
import {
  computePartnerComplementarity,
  isComplementarityUnknown,
  type PartnerComplementarityScore,
} from './discover-partner-complementarity'

/* ------------------------------------------------------------------ */
/*  Les deux PROJECTIONS de Découvrir (#2165.8, #2165.9).               */
/*                                                                     */
/*  « Besoins et signaux » et « Partenaires / ESN » ne sont pas des      */
/*  recherches nouvelles : ce sont deux LECTURES de ce que la recherche */
/*  a déjà rendu. Un signal daté était un attribut de carte, il devient */
/*  une ligne ; un NAF résolu servait à filtrer des comptes, il classe  */
/*  désormais un partenaire.                                           */
/*                                                                     */
/*  ⚠️ La règle qui tient tout le fichier : une projection ne fabrique   */
/*  JAMAIS une ligne, et ce qu'elle laisse de côté est COMPTÉ. Une      */
/*  liste qui tait ses exclusions ment par omission — même faute qu'un  */
/*  « 0 » posé à la place d'un « non mesuré », un cran plus haut.       */
/* ------------------------------------------------------------------ */

/**
 * #2166.33 — ce qu'une ligne de besoin ne SAIT PAS, nommé.
 *
 * Aucune de ces quatre informations n'est extractible des sources : une annonce
 * publie un intitulé en texte libre, pas une expertise normalisée, pas une
 * urgence, pas un type de contrat structuré. Les DEVINER en lisant le libellé
 * serait un fait inventé ; les taire ferait croire qu'ils n'existent pas.
 */
type DiscoverNeedUnknown = 'expertise' | 'evidenceUrl' | 'urgency' | 'contractType'

export interface DiscoverNeedRow {
  /** Stable et unique dans la liste : le SIREN porteur + la position du signal. */
  key: string
  siren: string
  /** #2166.26 — l'entreprise chez qui le besoin est observé. */
  company: string
  /** #2165.48 — le département du candidat PORTEUR (registre), jamais deviné
   *  du texte du signal. `null` = non connu — voir `passesNeedZone`. */
  department: string | null
  accountId: string | null
  portfolioState: DiscoverPortfolioState
  /** #2166.27 — la NATURE du signal, telle que la source l'a produite. */
  nature: DiscoverSignal['type']
  label: string
  /** #2166.29 — obligatoire au contrat : un besoin non daté n'est pas un besoin. */
  date: string
  /** #2166.30 — le lien de source, `null` quand la source n'en publie pas. */
  evidenceUrl: string | null
  detail: string | null
  /** #3238 — la ville du SITE qui a publié ce signal, distincte du siège ; absente = non affichée par la source. */
  siteCity?: string
  /** #4182 — « qui demande ce profil ? », tel que le serveur l'a composé du texte de l'offre ; absent = non composé. */
  requester?: DiscoverSignal['requester']
  /** #3237 — le delivery fit du signal, tel que le serveur l'a composé ; absent = non évalué. */
  deliveryFit?: DiscoverSignal['deliveryFit']
  /** #3237 — les treize axes derrière ce niveau ; absents = non évalués. */
  deliveryFitAxes?: DiscoverSignal['deliveryFitAxes']
  /**
   * #2166.31 — le NIVEAU DE PREUVE, et c'est une DISTINCTION, pas une échelle.
   *
   * `direct` = l'employeur nommé a publié lui-même · `intermediated` = un
   * cabinet a publié POUR un client (tome 2 §13), donc la ligne ne dit rien du
   * besoin de l'employeur nommé. Inventer un « niveau 3/5 » au-dessus de ce
   * booléen donnerait un chiffre que rien ne mesure.
   *
   * #2165.46 — RÉFUTÉ EN PROD 20/09 (719b9cf44) : `null` pour tout signal qui
   * n'est PAS une embauche (`legal`, `tender`, `award`, `tech`). Une
   * immatriculation au Greffe n'est publiée par personne au sens de cet axe —
   * lui donner `direct` par défaut faisait que le filtre « Publié par
   * l'employeur » ne partitionnait rien (17 cartes sur 17 au même niveau).
   */
  evidenceLevel: 'direct' | 'intermediated' | null
  /** #4999 — le contrat tel que la SOURCE l'a dit (offres) ; absent = la source ne le dit pas, jamais déduit. */
  contractType?: NonNullable<DiscoverSignal['contractType']>
  unknown: DiscoverNeedUnknown[]
}

export interface DiscoverNeedsProjection {
  rows: DiscoverNeedRow[]
  /** Candidats sans le moindre signal daté. Ils n'ont produit AUCUNE ligne —
   *  et ce n'est pas « aucun besoin », c'est « aucun signal observé ». */
  withoutSignal: number
}

/** Du plus RÉCENT au plus ancien : une liste de besoins répond d'abord à
 *  « pourquoi maintenant », et un tri par entreprise l'effacerait. */
function byDateDesc(a: DiscoverNeedRow, b: DiscoverNeedRow): number {
  return b.date.localeCompare(a.date)
}

function needUnknowns(signal: DiscoverSignal): DiscoverNeedUnknown[] {
  const unknown: DiscoverNeedUnknown[] = ['expertise']
  if (!signal.url) unknown.push('evidenceUrl')
  unknown.push('urgency', 'contractType')
  return unknown
}

/** #2165.8 — les signaux déjà rendus, lus comme des LIGNES de besoin. */
export function needRowsFromCandidates(candidates: DiscoverCandidate[]): DiscoverNeedsProjection {
  const rows: DiscoverNeedRow[] = []
  let withoutSignal = 0
  for (const candidate of candidates) {
    if (candidate.signals.length === 0) {
      withoutSignal += 1
      continue
    }
    candidate.signals.forEach((signal, index) => {
      const siteCity = candidateSiteCities({ city: candidate.city, signals: [signal] })[0]
      rows.push({
        key: `${candidate.siren}:${index}`,
        siren: candidate.siren,
        company: candidate.name,
        department: candidate.department,
        accountId: candidate.accountId,
        portfolioState: candidate.portfolioState,
        nature: signal.type,
        label: signal.label,
        date: signal.date,
        evidenceUrl: signal.url ?? null,
        detail: signal.detail ?? null,
        // #3238 — seulement une ville DIFFÉRENTE du siège, comme `candidateSiteCities` (jamais devinée).
        ...(siteCity ? { siteCity } : {}),
        ...(signal.requester ? { requester: signal.requester } : {}),
        ...(signal.deliveryFit ? { deliveryFit: signal.deliveryFit } : {}),
        ...(signal.deliveryFitAxes ? { deliveryFitAxes: signal.deliveryFitAxes } : {}),
        // #2165.46 — seule une embauche est « publiée » au sens de cet axe.
        evidenceLevel: signal.type !== 'hiring' ? null : signal.intermediated === true ? 'intermediated' : 'direct',
        ...(signal.contractType ? { contractType: signal.contractType } : {}),
        unknown: needUnknowns(signal),
      })
    })
  }
  return { rows: rows.sort(byDateDesc), withoutSignal }
}

/**
 * #2165.45 / #2165.46 sur le type « Besoins » — les deux filtres de la barre,
 * appliqués À LA LIGNE et non au compte.
 *
 * `visible` est déjà resserré au niveau CANDIDAT (« garde les entreprises qui
 * portent au moins un appel d'offres »). En liste de besoins, ça ne suffit
 * pas : sans ce second passage, cocher « Appel d'offres » afficherait aussi
 * les recrutements des mêmes entreprises, et le filtre paraîtrait cassé.
 */
/** #2165.47 — insensible à la casse, sous-chaîne : même règle que les filtres
 *  de contact (`includesLoose`, `discover-contact-rows.ts`). Vide = aucune
 *  contrainte, jamais « tout écarter ». */
function matchesCompany(company: string, needle: string): boolean {
  if (!needle.trim()) return true
  return company.toLocaleLowerCase().includes(needle.trim().toLocaleLowerCase())
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * #2165.44 — RÉFUTÉ en prod le 19/09/2026 : la fenêtre de fraîcheur du rail
 * (`sinceDays`) ne s'appliquait qu'à la requête SIGNAUX côté serveur, jamais
 * aux lignes de besoin déjà rendues — un signal de 2023 restait affiché à
 * « 30 derniers jours ». `sinceDays` absent (`null`/`undefined`) = aucune
 * contrainte, jamais un défaut deviné ici (l'appelant décide).
 *
 * Une date illisible n'est JAMAIS comptée « hors fenêtre » : `#2166.29`
 * garantit une date au contrat, mais un signal plus ancien que ce lot peut en
 * porter une malformée — non mesuré ≠ hors fenêtre (GA-18/GA-19).
 */
function passesNeedWindow(row: DiscoverNeedRow, sinceDays: number | null | undefined, nowMs: number): boolean {
  if (sinceDays === null || sinceDays === undefined) return true
  const rowMs = Date.parse(row.date)
  if (Number.isNaN(rowMs)) return true
  return nowMs - rowMs <= sinceDays * DAY_MS
}

/**
 * #2165.48 — RÉFUTÉ en prod le 19/09/2026 : le département choisi au rail ne
 * s'appliquait qu'à la requête REGISTRE côté serveur, jamais aux lignes déjà
 * rendues — une ligne portée par une entreprise hors des départements choisis
 * restait affichée. `departments` vide = aucune contrainte.
 *
 * Un département NON CONNU (`row.department === null`) n'est JAMAIS écarté
 * par ce critère : ce n'est pas « hors zone », c'est « on ne sait pas » —
 * même doctrine que `passesObservedClients` (GA-18/GA-19), même fichier que
 * `passesExpertiseKnown` (#2165.51) qui, lui, écarte l'inconnu — ici la donnée
 * est PORTÉE PAR LE CANDIDAT (registre), pas absente d'une source distincte,
 * donc son silence ne pénalise pas la ligne.
 */
function passesNeedZone(row: DiscoverNeedRow, departments: readonly string[] | undefined): boolean {
  if (!departments || departments.length === 0) return true
  if (row.department === null) return true
  return departments.includes(row.department)
}

// ⚠️ Pas d'`export` : type consommé uniquement dans ce fichier
// (`pnpm lint:exports:types`, CLAUDE.md — jamais exporter un type qui ne
// sert qu'à lui-même).
interface FilterNeedRowsOptions {
  nature: DiscoverSignal['type'] | 'any'
  directOnly: boolean
  /** #4999.1 — ne garde que les besoins dont la source dit freelance ; un contrat muet ne passe pas (GA-18/19). */
  freelanceOnly?: boolean
  company: string
  /** #2165.44 — voir `passesNeedWindow`. */
  sinceDays?: number | null
  /** #2165.48 — voir `passesNeedZone`. */
  departments?: readonly string[]
  /** Horloge injectable — les tests ne dépendent jamais de `Date.now()`. */
  nowMs?: number
}

export function filterNeedRows(rows: DiscoverNeedRow[], options: FilterNeedRowsOptions): DiscoverNeedRow[] {
  const nowMs = options.nowMs ?? Date.now()
  return rows.filter(row => {
    if (options.nature !== 'any' && row.nature !== options.nature) return false
    if (options.directOnly && row.evidenceLevel !== 'direct') return false
    if (options.freelanceOnly && row.contractType !== 'FREELANCE') return false
    // #2165.47 — filtre besoins : Compte. `company`/`siren` existent déjà sur
    // chaque ligne (#2166.26) ; aucune source neuve, un simple croisement.
    if (!matchesCompany(row.company, options.company)) return false
    if (!passesNeedWindow(row, options.sinceDays, nowMs)) return false
    if (!passesNeedZone(row, options.departments)) return false
    return true
  })
}

/** #2165.44 / #2165.46 / #2165.48 — combien de lignes CHAQUE critère a
 *  retirées, à lui seul, sur le pool déjà resserré par nature/compte
 *  (ordinaires, sans ambiguïté). Mutuellement exclusifs, dans le MÊME ordre
 *  que `filterNeedRows` (direct → fenêtre → zone) : une ligne intermédiée ET
 *  hors fenêtre compte sous `direct`, jamais deux fois. La somme égale
 *  toujours `pool.length - filterNeedRows(pool, options).length` — vérifié
 *  par un test qui fait tourner les deux fonctions côte à côte. */
// ⚠️ Pas d'`export` — même règle que `FilterNeedRowsOptions` ci-dessus.
interface NeedRowsHiddenBreakdown {
  /** #2165.46 — retirée par « Publié par l'employeur ». */
  direct: number
  /** #2165.44 — retirée par la fenêtre de fraîcheur. */
  window: number
  /** #2165.48 — retirée par les départements choisis. */
  zone: number
  /** #4999.1 — retirée par « Uniquement freelance » ; le message dit aussi quand aucun signal freelance n'existe. */
  freelance: number
}

export function needRowsHiddenBreakdown(
  rows: readonly DiscoverNeedRow[],
  options: {
    directOnly: boolean
    freelanceOnly?: boolean
    sinceDays?: number | null
    departments?: readonly string[]
    nowMs?: number
  },
): NeedRowsHiddenBreakdown {
  const nowMs = options.nowMs ?? Date.now()
  let direct = 0
  let windowCount = 0
  let zone = 0
  let freelance = 0
  for (const row of rows) {
    if (options.directOnly && row.evidenceLevel !== 'direct') {
      direct += 1
    } else if (options.freelanceOnly && row.contractType !== 'FREELANCE') {
      freelance += 1
    } else if (!passesNeedWindow(row, options.sinceDays, nowMs)) {
      windowCount += 1
    } else if (!passesNeedZone(row, options.departments)) {
      zone += 1
    }
  }
  return { direct, window: windowCount, zone, freelance }
}

/* ------------------------------------------------------------------ */

/** #2166.40 / #2165.55 — ce qu'une ligne de partenaire ne sait pas, nommé. */
type DiscoverPartnerUnknown = 'expertise' | 'territory' | 'observedRelations' | 'workspaceRelation' | 'complementarity'

export interface DiscoverPartnerRow {
  siren: string
  /** #2166.34 — l'ESN elle-même. */
  name: string
  accountId: string | null
  portfolioState: DiscoverPortfolioState
  nafCode: string | null
  /**
   * `esn` ou `ambiguous`, JAMAIS `client` ni `null` : une ligne de cette liste
   * AFFIRME « c'est une ESN ». Un NAF qu'on n'a pas résolu ne permet pas de
   * l'affirmer — il est compté dans `unresolvedNaf`, pas rangé ici.
   */
  nafClass: 'esn' | 'ambiguous'
  /** #2166.35 — l'expertise OBSERVABLE : le libellé du secteur résolu au
   *  registre. `null` quand le registre ne l'a pas rendu — jamais deviné du nom. */
  sector: string | null
  /** #2166.36 — le territoire, tel que le registre le porte. */
  city: string | null
  department: string | null
  headcountRange: string | null
  /** #2166.37 — les RELATIONS OBSERVÉES : marchés attribués, recrutements,
   *  appels d'offres datés que la même recherche a déjà rendus. Jamais une
   *  relation supposée. */
  observed: DiscoverSignal[]
  unknown: DiscoverPartnerUnknown[]
  /**
   * #2489.3 — MÊME règle que `DiscoverCandidate.logoUrl` (#2166.1) : porté
   * SEULEMENT quand ce partenaire correspond déjà à un compte possédé de
   * l'espace, jamais deviné depuis le nom. La projection Candidats l'avait ;
   * celle-ci le perdait en route alors que c'est la même source déjà vérifiée.
   */
  logoUrl?: string | null
  website?: string | null
  /**
   * #2165.55 — RÉFUTÉ en prod le 19/09 : cette projection ne portait AUCUN
   * champ de complémentarité (le calcul existait, `discover-partner-
   * complementarity.ts`, mais n'était câblé que sur la grille de cartes par
   * défaut, jamais sur cet écran). `null` quand aucun axe n'a pu être évalué
   * (`isComplementarityUnknown`) — la ligne le dit alors dans `unknown`,
   * jamais un bloc vide ni un score à 0.
   */
  complementarity: PartnerComplementarityScore | null
  /**
   * #2165.56 / #2151.34 — RÉFUTÉ en prod le 19/09 : 0 ligne sur 24 affichait
   * un statut de rang 2. Toujours l'un des trois états de `PartnerRank2Status`
   * — jamais absent, jamais fondu dans `unknown` (l'absence de signal EST
   * l'un des trois états, pas une absence d'affichage).
   */
  rank2: PartnerRank2Status
}

export interface DiscoverPartnersProjection {
  rows: DiscoverPartnerRow[]
  /**
   * Candidats dont le NAF n'a PAS été résolu. Ni partenaires, ni « pas des
   * ESN » : aucun verdict n'a été rendu sur eux. Comptés à part et dits à
   * l'écran, comme `coverage.notExamined` le fait un étage plus haut.
   */
  unresolvedNaf: number
}

function partnerUnknowns(
  candidate: DiscoverCandidate,
  observed: DiscoverSignal[],
  complementarity: PartnerComplementarityScore | null,
): DiscoverPartnerUnknown[] {
  const unknown: DiscoverPartnerUnknown[] = []
  if (!candidate.sector) unknown.push('expertise')
  if (!candidate.department && !candidate.city) unknown.push('territory')
  if (observed.length === 0) unknown.push('observedRelations')
  // La relation de l'espace à cette ESN (sous-traitant, co-traitant, jamais
  // travaillé) vit sur le dossier compte (`AccountPartner`), pas dans une
  // réponse Découvrir : depuis ici, elle est toujours inconnue.
  if (candidate.accountId === null) unknown.push('workspaceRelation')
  // #2165.55 — totalement inconnue seulement quand AUCUN axe n'a pu être
  // évalué (jamais dès que le score composite manque, structurellement
  // sous MINIMUM_COMPLEMENTARITY_AXES — voir `isComplementarityUnknown`).
  if (isComplementarityUnknown(complementarity)) unknown.push('complementarity')
  return unknown
}

/**
 * #2165.9 — les candidats dont le NAF RÉSOLU désigne une ESN, lus comme des
 * partenaires possibles plutôt que comme des comptes à conquérir.
 *
 * #2165.55 / #2165.56 — `context` est OPTIONNEL, comme `passesMinAccountsSeen`
 * et consorts : un appelant antérieur à ce lot (ou un test qui n'a rien à en
 * dire) continue de fonctionner à l'identique — complémentarité totalement
 * inconnue, rang 2 `unknown`, jamais une valeur devinée par défaut.
 */
export function partnerRowsFromCandidates(
  candidates: DiscoverCandidate[],
  context: {
    /** Profil propre de l'ESN qui cherche — même forme que
     *  `computePartnerComplementarity`'s second argument. */
    ownProfile?: { sectors: readonly string[]; headcountRange: string | null }
    /** Agrégat de l'espace (`GET /partners/on-my-accounts`) — le rang 2
     *  OBSERVÉ sur au moins un dossier, jamais une déclaration de l'ESN. */
    relationIndex?: ReadonlyMap<string, PartnerRelationSummary>
    /** `esn_directory.open_to_subcontracting === 'oui'`, nom normalisé →
     *  `true` (`GET /partners/profile-matches`) — la DÉCLARATION de l'ESN
     *  elle-même, jamais un fait de l'espace. */
    declaredIndex?: ReadonlyMap<string, boolean>
  } = {},
): DiscoverPartnersProjection {
  const ownProfile = context.ownProfile ?? { sectors: [], headcountRange: null }
  const relationIndex = context.relationIndex ?? new Map<string, PartnerRelationSummary>()
  const declaredIndex = context.declaredIndex ?? new Map<string, boolean>()
  const rows: DiscoverPartnerRow[] = []
  let unresolvedNaf = 0
  for (const candidate of candidates) {
    const nafClass = esnNafClass(candidate.nafCode)
    if (nafClass === null) {
      unresolvedNaf += 1
      continue
    }
    if (nafClass === 'client') continue
    const observed = candidate.signals
    const complementarity = computePartnerComplementarity(
      { sector: candidate.sector, nafCode: candidate.nafCode, headcountRange: candidate.headcountRange },
      ownProfile,
    )
    rows.push({
      siren: candidate.siren,
      name: candidate.name,
      accountId: candidate.accountId,
      portfolioState: candidate.portfolioState,
      nafCode: candidate.nafCode,
      nafClass,
      sector: candidate.sector,
      city: candidate.city,
      department: candidate.department,
      headcountRange: candidate.headcountRange,
      observed,
      unknown: partnerUnknowns(candidate, observed, complementarity),
      // #2489.3 — logo pour tout candidat, MAIS jamais deviné : reprend
      // strictement ce que `DiscoverPortfolioService` a déjà vérifié pour ce
      // SIREN (compte possédé de l'espace), rien de plus.
      logoUrl: candidate.logoUrl,
      website: candidate.website,
      complementarity,
      rank2: rank2StatusFor(candidate.name, relationIndex, declaredIndex),
    })
  }
  return { rows, unresolvedNaf }
}
