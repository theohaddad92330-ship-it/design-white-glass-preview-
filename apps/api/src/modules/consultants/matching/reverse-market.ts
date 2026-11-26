import {
  REVERSE_MARKET_RECRUITERS_MAX,
  type DiscoverResponse,
  type MarketDemand,
  type MarketRecruiter,
  type ReverseMarketUnavailableReason,
} from '@bellum/contracts'
import { normalise } from './text'

/**
 * La PROSPECTION INVERSÉE vers le marché — le calcul, pur et sans base
 * (PDF 5 §6.2, PDF 1 §Section 4, BEL-ATS-010).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UN FILTRE, PAS UNE SOURCE NOUVELLE
 * ─────────────────────────────────────────────────────────────────────────
 * Le §6.2 réclame trois sources de besoins pour un profil, et une seule
 * existait (`InverseMatchingService`, les besoins ouverts de l'espace). Les
 * deux autres — les offres publiées et les ESN qui recrutent — **ne demandent
 * aucune collecte nouvelle** : c'est le PDF 1 qui le dit, « le même signal se
 * lit dans les deux sens ».
 *
 * La veille territoriale relève déjà, chaque lundi et depuis quatre sources
 * publiques, le nombre d'offres IT par département, les technologies les plus
 * demandées, et les ESN qui recrutent avec leur volume. Lu depuis un COMPTE,
 * ce relevé dit « ce client a un besoin » ou « cette ESN manque de bras ». Lu
 * depuis un CONSULTANT, il dit « voilà où le placer ». Même table, même
 * fraîcheur, même licence — l'autre bout de la lunette.
 *
 * Conséquence directe et voulue : **aucun scraping**, rien qui suppose de se
 * faire passer pour un navigateur humain ou un utilisateur connecté, et pas une
 * ligne de code réseau ajoutée.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER REFUSE D'AFFIRMER
 * ─────────────────────────────────────────────────────────────────────────
 * La veille compte les offres **par ESN** et les technologies **par
 * département**, et ne croise jamais les deux. On peut donc dire « ces ESN
 * recrutent sur sa zone » et « ces technologies de sa fiche sont demandées sur
 * sa zone » ; on ne peut PAS dire « ces ESN recrutent son profil ». Le second
 * énoncé est plus vendeur et il n'est pas dans la donnée : `MarketRecruiter` ne
 * porte donc aucun champ qui le suggère.
 *
 * De même, une offre trouvée n'est pas une opportunité qualifiée : elle porte
 * sa source, sa date, et le fait qu'elle est PUBLIQUE — le concurrent d'en face
 * lit exactement la même chose.
 */

/** Ce qu'un relevé territorial apporte au calcul — jamais l'entité complète. */
export type MarketSnapshot = {
  department: string
  takenOn: string
  offers: number | null
  topTechnologies: { term: string; count: number }[]
  esnHiring: { name: string; offers: number }[]
}

/**
 * Quelles zones de la fiche désignent un département que la veille relève.
 *
 * ⚠️ La liste de référence est celle des départements RÉELLEMENT relevés, pas
 * un référentiel écrit ici. Recopier les 101 départements français en
 * fabriquerait un deuxième, qui divergerait le jour où la veille en couvrira
 * d'autres — et « Loire-Atlantique » resterait de toute façon irrésolu.
 *
 * Rien n'est deviné : une zone qui ne DÉSIGNE pas un département suivi sort
 * dans `unresolved`, nommée. Deviner « IDF » → « 75, 77, 78, 91, 92, 93, 94,
 * 95 » serait inventer huit territoires que personne n'a saisis.
 */
export function departmentsFromZones(
  zones: readonly string[],
  known: readonly string[],
): { departments: string[]; unresolved: string[] } {
  const index = new Map(known.map(department => [normalise(department), department]))
  const departments: string[] = []
  const unresolved: string[] = []
  for (const zone of zones) {
    const label = zone.trim()
    if (!label) continue
    const hit = index.get(normalise(label))
    if (hit) {
      if (!departments.includes(hit)) departments.push(hit)
    } else if (!unresolved.includes(label)) {
      unresolved.push(label)
    }
  }
  return { departments: departments.sort(), unresolved }
}

/**
 * Pourquoi la lecture n'a pas pu se faire — ou `null` si elle s'est faite.
 *
 * L'ordre compte : la ZONE est demandée d'abord parce que c'est elle qui choisit
 * le territoire à lire. Sans elle, savoir si la fiche porte des compétences ne
 * change rien.
 *
 * ⚠️ `null` ne veut pas dire « on a trouvé quelque chose » : la lecture a eu
 * lieu, et elle peut rendre des listes vides. Un marché calme est une réponse.
 */
export function reverseMarketUnavailability(
  zones: readonly string[],
  departments: readonly string[],
  skillTerms: readonly string[],
  snapshotCount: number,
): ReverseMarketUnavailableReason | null {
  if (zones.length === 0) return 'zones_missing'
  if (skillTerms.length === 0) return 'skills_missing'
  // Des zones existent, mais aucune ne désigne un territoire relevé. Rendre une
  // liste vide ferait croire à un marché calme ; c'est la fiche qu'il faut lire.
  if (departments.length === 0) return 'zones_unresolved'
  // Aucun relevé n'est une IGNORANCE, pas un marché vide. Rendre « 0 offre »
  // ici ferait renoncer à une zone que personne n'a encore regardée.
  if (snapshotCount === 0) return 'no_snapshot'
  return null
}

/**
 * Ce que le marché public demande sur une zone, croisé avec la fiche.
 *
 * Le croisement est un `sameTerm` normalisé, pas un `includes` : « SAP » ne doit
 * pas se rapprocher de « SAP BW » par hasard, ni « Java » de « JavaScript ».
 * Le rapprochement approximatif fabriquerait une demande qui n'existe pas.
 */
export function demandFromSnapshot(snapshot: MarketSnapshot, skillTerms: readonly string[]): MarketDemand {
  const wanted = new Set(skillTerms.map(normalise).filter(Boolean))
  return {
    department: snapshot.department,
    observedOn: snapshot.takenOn,
    // ⚠️ Jamais `?? 0` : la source publique muette n'est pas un département sans offre.
    offers: snapshot.offers,
    matchedTechnologies: snapshot.topTechnologies
      .filter(technology => wanted.has(normalise(technology.term)))
      // Le libellé ÉCRIT par la veille, jamais le terme normalisé : « Réseau »
      // se lit, « reseau » se débogue.
      .map(technology => ({ term: technology.term, count: technology.count })),
    technologiesRanked: snapshot.topTechnologies.length,
  }
}

/**
 * La clé d'une habitude de recrutement : une ESN **et** un département.
 *
 * L'habitude est per-département dans le référentiel (`hiring_baseline`), et
 * c'est juste : une ESN qui publie trente offres par mois en Île-de-France et
 * deux en Corrèze n'a pas « une » habitude. Une clé au seul nom comparerait le
 * volume corrézien à la moyenne francilienne, et annoncerait un effondrement.
 */
export function recruiterKey(name: string, department: string): string {
  return `${normalise(name)}::${normalise(department)}`
}

/**
 * Les ESN qui recrutent sur les zones du consultant — le SECOND MARCHÉ.
 *
 * Une ESN qui recrute sur DEUX départements produit deux lignes, jamais une
 * somme : ce sont deux faits distincts, et les additionner effacerait la zone
 * la plus petite — qui est peut-être justement celle du consultant.
 *
 * `baseline` (la médiane trimestrielle) et `openToSubcontracting` (la
 * déclaration communautaire) viennent du référentiel ESN et restent `null`
 * quand il ne les porte pas. `null` n'est ni « zéro » ni « non ».
 */
/**
 * #2035.10 — `maxRecruiters` est désormais un RÉGLAGE D'ESPACE
 * (`WorkspaceReverseMarketSettingsService.maxRecruitersShownFor`), jamais lu ici : la
 * fonction reste pure, l'appelant résout la valeur AVANT d'appeler. Absent =
 * `REVERSE_MARKET_RECRUITERS_MAX`, le comportement d'avant ce lot.
 */
export function rankRecruiters(
  snapshots: readonly MarketSnapshot[],
  baselines: ReadonlyMap<string, number>,
  declaredOpen: ReadonlyMap<string, boolean>,
  maxRecruiters: number = REVERSE_MARKET_RECRUITERS_MAX,
): MarketRecruiter[] {
  const rows: MarketRecruiter[] = []
  for (const snapshot of snapshots) {
    for (const esn of snapshot.esnHiring) {
      const name = esn.name.trim()
      // Une ESN sans nom n'est pas une ESN : l'afficher donnerait une ligne sur
      // laquelle personne ne peut agir.
      if (!name) continue
      const key = recruiterKey(name, snapshot.department)
      // ⚠️ L'ouverture au rang 2 est déclarée par ESN, pas par territoire : sa
      // clé est le seul nom.
      const declaredKey = normalise(name)
      rows.push({
        name,
        department: snapshot.department,
        observedOn: snapshot.takenOn,
        offers: esn.offers,
        baseline: baselines.get(key) ?? null,
        openToSubcontracting: declaredOpen.has(declaredKey) ? (declaredOpen.get(declaredKey) as boolean) : null,
      })
    }
  }
  return rows
    .sort(
      (a, b) => b.offers - a.offers || a.name.localeCompare(b.name, 'fr') || a.department.localeCompare(b.department),
    )
    .slice(0, maxRecruiters)
}

/**
 * LUD.4 — la zone de la fiche (ou de l'espace), traduite pour la lecture des SIGNAUX : un département
 * (« 69 »), une région (nom, sigle ou code INSEE : « AURA », « 84 » → région 84) ou une ville connue
 * (Lyon → 69). Une zone qu'on ne sait pas relier sort dans `unresolved`, NOMMÉE — jamais devinée.
 *
 * ⚠️ « 84 » seul est ambigu (Vaucluse / AURA) : ici un nombre est un DÉPARTEMENT, sauf quand la fiche écrit la
 * région avec son nom ou son sigle. Les codes région ne s'écrivent donc jamais en nombre nu.
 */
const SIGNAL_REGIONS: readonly { code: string; names: readonly string[] }[] = [
  { code: '84', names: ['aura', 'auvergne rhone alpes', 'auvergne rhone alpes aura'] },
  { code: '27', names: ['bfc', 'bourgogne franche comte'] },
  { code: '93', names: ['paca', 'provence alpes cote d azur', 'sud'] },
  { code: '11', names: ['idf', 'ile de france'] },
  { code: '75', names: ['nouvelle aquitaine'] },
  { code: '76', names: ['occitanie'] },
  { code: '44', names: ['grand est'] },
  { code: '32', names: ['hauts de france'] },
  { code: '52', names: ['pays de la loire'] },
  { code: '53', names: ['bretagne'] },
  { code: '28', names: ['normandie'] },
  { code: '24', names: ['centre val de loire'] },
  { code: '94', names: ['corse'] },
]
const SIGNAL_CITIES: Record<string, { label: string }> = { lyon: { label: 'Lyon' } }

type SignalZoneQuery = { department?: string; region?: string; city?: string }

export function signalZonesFromProfileZones(zones: readonly string[]): {
  queries: SignalZoneQuery[]
  unresolved: string[]
} {
  const queries: SignalZoneQuery[] = []
  const unresolved: string[] = []
  const seen = new Set<string>()
  const push = (key: string, query: SignalZoneQuery) => {
    if (seen.has(key)) return
    seen.add(key)
    queries.push(query)
  }
  for (const zone of zones) {
    const label = zone.trim()
    if (!label) continue
    const folded = normalise(label)
    if (/^\d{2,3}$/.test(folded) || /^2[ab]$/.test(folded)) {
      push(`d:${folded}`, { department: folded.toUpperCase() })
      continue
    }
    const region = SIGNAL_REGIONS.find(r => r.names.includes(folded))
    if (region) {
      push(`r:${region.code}`, { region: region.code })
      continue
    }
    const city = SIGNAL_CITIES[folded]
    if (city) {
      push(`c:${folded}`, { city: city.label })
      continue
    }
    if (!unresolved.includes(label)) unresolved.push(label)
  }
  return { queries, unresolved }
}

/**
 * LUD.4 — des candidats « Découvrir » aux ENTREPRISES CIBLES d'un placement : seules celles qui portent une
 * offre DATÉE (le « pourquoi maintenant »), avec les interlocuteurs que l'espace connaît déjà (par SIREN).
 * Une entreprise sans offre n'est jamais présentée comme « qui recrute ».
 */
export function placementTargetsFromCandidates(
  candidates: DiscoverResponse['candidates'],
  contactsBySiren: ReadonlyMap<string, readonly { name: string; title: string | null }[]>,
): PlacementTargetRow[] {
  const out: PlacementTargetRow[] = []
  for (const candidate of candidates) {
    const offers = candidate.signals
      .filter(signal => signal.type === 'hiring' && /^\d{4}-\d{2}-\d{2}/.test(signal.date ?? ''))
      .map(signal => ({ label: signal.label, date: signal.date.slice(0, 10), url: signal.url ?? null }))
    if (offers.length === 0) continue
    out.push({
      name: candidate.name,
      siren: candidate.siren || null,
      department: candidate.department ?? null,
      offers,
      knownContacts: (contactsBySiren.get(candidate.siren) ?? []).map(c => ({ name: c.name, title: c.title })),
    })
  }
  return out
}

type PlacementTargetRow = {
  name: string
  siren: string | null
  department: string | null
  offers: { label: string; date: string; url: string | null }[]
  knownContacts: { name: string; title: string | null }[]
}
