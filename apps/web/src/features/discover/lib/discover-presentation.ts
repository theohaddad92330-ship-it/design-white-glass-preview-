import { resolveBuyerRoleFamily, type BuyerRoleFamilyKey } from '@bellum/contracts'
import type { DiscoverCandidate, DiscoverPortfolioState, DiscoverSignal } from './discover-types'

/* ------------------------------------------------------------------ */
/*  Présentation — logique pure partagée par les composants de carte.   */
/*  Rien ici ne rend de texte : on renvoie des CLÉS i18n, la traduction */
/*  reste au composant (règle projet FR+EN stricte).                   */
/* ------------------------------------------------------------------ */

type BadgeTone = 'analyzed' | 'watched' | 'customer' | 'parked'

export interface PortfolioBadge {
  state: Exclude<DiscoverPortfolioState, 'new'>
  /** Le motif et la date de l'écartement, quand il y en a un. */
  parkedReason?: string | null
  parkedAt?: string | null
  /** Clé du namespace `discover`. */
  labelKey: string
  tone: BadgeTone
  /** Compte existant à ouvrir, quand l'API en a résolu un. */
  accountId: string | null
}

const BADGES: Record<Exclude<DiscoverPortfolioState, 'new'>, { labelKey: string; tone: BadgeTone }> = {
  analyzed: { labelKey: 'portfolio.analyzed', tone: 'analyzed' },
  watched: { labelKey: 'portfolio.watched', tone: 'watched' },
  customer: { labelKey: 'portfolio.customer', tone: 'customer' },
  // Écarté à la porte G1 (PDF 2 §4.4 B2). Le candidat n'est pas retiré de la
  // liste : il est MARQUÉ, avec sa date et son motif. Un compte écarté il y a
  // huit mois sur « pas de budget » mérite d'être revu ; un compte écarté hier
  // sur « concurrent installé », non — et seule la date le dit.
  parked: { labelKey: 'portfolio.parked', tone: 'parked' },
}

/**
 * Badge d'état portefeuille, ou `null` pour un compte réellement nouveau.
 *
 * `locallyWatched` couvre le « Suivre » posé pendant la session : le suivi est
 * local tant qu'aucun compte n'existe côté serveur, et il ne doit jamais
 * DÉGRADER un état serveur plus fort (un client reste un client).
 */
export function portfolioBadgeFor(
  candidate: DiscoverCandidate,
  opts: { locallyWatched?: boolean } = {},
): PortfolioBadge | null {
  const state = candidate.portfolioState === 'new' && opts.locallyWatched ? 'watched' : candidate.portfolioState
  if (state === 'new') return null
  return {
    state,
    ...BADGES[state],
    accountId: candidate.accountId,
    parkedReason: candidate.parkedReason ?? null,
    parkedAt: candidate.parkedAt ?? null,
  }
}

/** « Déjà à moi » = tout ce qui n'est pas vierge. Base du filtre « masquer ». */
export function isOwnedByRep(candidate: DiscoverCandidate): boolean {
  return candidate.portfolioState !== 'new'
}

/**
 * #2614.1 — le conseil de qualification (déterministe, `account_qualification.py`)
 * a déjà tranché : une ligne au verdict EXCLU (personne physique, entité
 * cessée, doublon, hors zone/secteur) n'est vendable à personne. Jusqu'ici le
 * verdict voyageait avec le candidat (le rapport l'exige, une exclusion
 * silencieuse est invérifiable) mais l'écran ne faisait rien de plus qu'un
 * badge — Découvrir continuait de PROPOSER la ligne.
 *
 * Même prédicat que `discover-call-list.ts` (`excludedCompanies`, GA-26) : un
 * seul endroit décide qui est une ligne exploitable, la liste principale et le
 * tableau d'appels s'accordent.
 */
export function isExcludedByQualification(candidate: DiscoverCandidate): boolean {
  return candidate.qualification?.verdict === 'excluded'
}

/**
 * #2165.26 — « Déjà travaillé », séparé de « déjà à moi ».
 *
 * `isOwnedByRep` couvre TOUT état non vierge (analyzed/watched/customer) — le
 * retour demande un filtre plus étroit : un compte simplement SUIVI
 * (`watched`) n'est pas « travaillé », seul un compte déjà CLIENT ou déjà
 * ANALYSÉ l'est. Confondre les deux masquerait un suivi léger avec le même
 * geste qu'un dossier client, ce que le retour distingue explicitement.
 */
export function isWorkedByRep(candidate: DiscoverCandidate): boolean {
  return candidate.portfolioState === 'customer' || candidate.portfolioState === 'analyzed'
}

interface CandidateFilterState {
  hideOwned: boolean
  /** #2165.26 — indépendant de `hideOwned` : masque SEULEMENT customer/analyzed,
   *  jamais watched/parked. Optionnel pour ne pas casser les appelants
   *  existants (Discover.tsx et ses tests) qui ne le connaissaient pas encore. */
  hideWorked?: boolean
  /** SIREN écartés — « Écarter » se souvient d'une session à l'autre. */
  dismissed: ReadonlySet<string>
}

/** Applique les filtres d'écran. Renvoie toujours un nouveau tableau. */
export function applyCandidateFilters(
  candidates: readonly DiscoverCandidate[],
  filters: CandidateFilterState,
): DiscoverCandidate[] {
  return candidates.filter(c => {
    // #2614.1 — EN PREMIER, et jamais derrière un réglage : un verdict EXCLU
    // n'est pas une préférence d'écran, c'est un fait déjà tranché par le
    // conseil de qualification.
    if (isExcludedByQualification(c)) return false
    if (filters.dismissed.has(c.siren)) return false
    if (filters.hideOwned && isOwnedByRep(c)) return false
    if (filters.hideWorked && isWorkedByRep(c)) return false
    return true
  })
}

/**
 * #2614.1 (correction) — mesuré en production le 21/09/2026 : le tri côté IA
 * place les verdicts EXCLU en dernier (`_VERDICT_RANK`,
 * `apps/ia/app/routers/discover.py`), et la coupe à `limit` les retire donc
 * TOUS dès qu'une recherche trouve plus de comptes que sa page n'en affiche
 * — `hiddenCandidatesBreakdown`, qui ne voit que les candidats REÇUS, comptait
 * alors zéro exclusion là où il y en avait. `query.qualificationExcludedTotal`
 * porte le total RÉEL, mesuré côté IA AVANT cette coupe (même canal que
 * `query.reading`, `discover-reading.ts`) : il ne peut être qu'ÉGAL OU
 * SUPÉRIEUR à ce que la liste reçue laisse compter, jamais l'inverse — le
 * plus grand des deux est donc toujours le bon. Une valeur absente ou mal
 * formée garde le compte local, jamais une exclusion inventée.
 */
export function reconcileExcludedCount(computed: number, query: Record<string, unknown> | undefined): number {
  const total = query?.['qualificationExcludedTotal']
  return typeof total === 'number' && Number.isFinite(total) && total > computed ? total : computed
}

/** Répartition de ce que `applyCandidateFilters` retire. */
export interface HiddenBreakdown {
  /** #2614.1 — masqué parce que le conseil de qualification a rendu un
   *  verdict EXCLU. Jamais un geste utilisateur, jamais un réglage — d'où sa
   *  priorité sur les trois motifs suivants (même ordre que
   *  `applyCandidateFilters`). */
  excluded: number
  /** Masqué par « Masquer ce que je travaille déjà » (`hideOwned`). */
  owned: number
  /** #2165.26 — masqué par « Déjà travaillé » (`hideWorked`), à part de `owned`. */
  worked: number
  /** Masqué par « Écarter » — un geste explicite de l'utilisateur. */
  dismissed: number
}

/**
 * « N masquées » n'est pas un motif : c'est un total qui en tait DEUX,
 * différents (§C du 30/08), rejoints par un troisième #2614.1. Tous sont déjà
 * CONNUS côté écran — `dismissed` est un geste explicite de l'utilisateur,
 * `hideOwned` un état portefeuille déjà résolu par l'API, `excluded` un
 * verdict déjà rendu par le conseil de qualification — aucun motif n'est
 * deviné ici, contrairement à un écart côté SERVEUR (`coverage.rejectedAmbiguous`…)
 * qui resterait « motif non enregistré » s'il n'était pas nommé par le backend.
 *
 * Les motifs sont MUTUELLEMENT EXCLUSIFS, dans le même ordre que
 * `applyCandidateFilters` : un candidat exclu compte sous `excluded`, jamais
 * une seconde fois sous `owned` s'il est aussi déjà possédé. La somme égale
 * donc EXACTEMENT `candidates.length - applyCandidateFilters(candidates, filters).length`
 * — vérifié par le test qui fait tourner les deux fonctions côte à côte.
 */
export function hiddenCandidatesBreakdown(
  candidates: readonly DiscoverCandidate[],
  filters: CandidateFilterState,
): HiddenBreakdown {
  let excluded = 0
  let owned = 0
  let worked = 0
  let dismissed = 0
  for (const candidate of candidates) {
    if (isExcludedByQualification(candidate)) {
      excluded += 1
    } else if (filters.dismissed.has(candidate.siren)) {
      dismissed += 1
    } else if (filters.hideOwned && isOwnedByRep(candidate)) {
      owned += 1
    } else if (filters.hideWorked && isWorkedByRep(candidate)) {
      // #2165.26 — même ordre d'exclusivité que `applyCandidateFilters`.
      worked += 1
    }
  }
  return { excluded, owned, worked, dismissed }
}

/* ------------------------------------------------------------------ */
/*  Âge d'un signal                                                    */
/* ------------------------------------------------------------------ */

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Nombre de jours pleins écoulés depuis `date`, ou `null` si la date est
 * illisible (l'UI masque alors l'ancienneté plutôt que d'afficher « NaN j »).
 * Une date future est ramenée à 0 — pas de « il y a -3 j ».
 */
export function signalAgeDays(date: string, nowMs: number = Date.now()): number | null {
  const parsed = Date.parse(date)
  if (Number.isNaN(parsed)) return null
  return Math.max(0, Math.floor((nowMs - parsed) / DAY_MS))
}

/**
 * La famille d'un signal s'ÉCRIT, elle ne se colore pas.
 *
 * Cinq familles portaient cinq teintes (violet, ambre, émeraude, ardoise,
 * ciel) sur une pastille de 6 px. « Une couleur porte un état, jamais une
 * catégorie » (tome 7 §26.1, garde GA-64) : une famille de signal ne dit ni
 * ce qui va bien ni ce qui bloque, et il fallait mémoriser une légende — qui
 * n'existait nulle part sur cet écran — pour la lire.
 *
 * Ce que la couleur portait, le MOT le porte maintenant : la clé rendue ici
 * pointe sur `signalTypes.*`, déjà traduite FR et EN pour le formulaire de
 * recherche. La pastille reste, en neutre, comme puce de liste.
 */
export function signalTypeLabelKey(type: DiscoverSignal['type']): string {
  return `signalTypes.${type}`
}

/** #3922.5 — le genre de source que chaque type de signal Découvrir nomme (BOAMP/DECP → appel
 *  d'offres, France Travail/APEC → offre, BODACC → annonce) : le libellé du lien en découle,
 *  jamais deviné d'un texte libre. `tech` n'a pas de page-preuve propre → « la source ». */
export const DISCOVER_SIGNAL_SOURCE_KIND: Record<DiscoverSignal['type'], string> = {
  tender: 'tender',
  award: 'tender',
  hiring: 'job',
  legal: 'bodacc',
  tech: 'other',
  business: 'other',
  // #3941 — une levée annoncée par la presse : le lien mène à l'article.
  funding: 'press',
  // #4734 — un label d'écosystème : le lien mène à l'annuaire, sans page-preuve propre.
  ecosystem: 'other',
}

function foldForCompare(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

/** #3901 — « Recrutement Recrutement IT » : vrai quand le libellé du signal commence déjà
 *  par le nom du genre, qui ne s'écrit alors pas une seconde fois devant lui. */
export function signalLabelRepeatsType(typeLabel: string, label: string): boolean {
  const type = foldForCompare(typeLabel)
  return type.length > 0 && foldForCompare(label).startsWith(type)
}

/* ------------------------------------------------------------------ */
/*  #2165.45 — Filtre besoins : Nature                                 */
/* ------------------------------------------------------------------ */

/**
 * Le candidat porte-t-il un signal de la NATURE demandée ?
 *
 * `legal` et `tech` (`discoverSignalTypeSchema`) sont RENDUS mais ne peuvent
 * pas être demandés à la source (`discoverSignalSourceSchema` n'en porte que
 * trois — tender/award/hiring) : ce filtre croise donc TOUJOURS ici, sur les
 * signaux déjà reçus, jamais dans la requête. `'any'` — le défaut — ne
 * contraint rien.
 */
export function hasSignalOfNature(candidate: DiscoverCandidate, nature: DiscoverSignal['type'] | 'any'): boolean {
  if (nature === 'any') return true
  return candidate.signals.some(signal => signal.type === nature)
}

/* ------------------------------------------------------------------ */
/*  #2165.46 — Filtre besoins : Niveau de preuve                       */
/* ------------------------------------------------------------------ */

/**
 * Le candidat porte-t-il au moins une preuve DIRECTE (non intermédiée) ?
 *
 * `intermediated` distingue une offre publiée par un cabinet POUR UN CLIENT
 * (elle ne prouve rien du besoin de l'employeur NOMMÉ, tome 2 §13) d'une
 * preuve directe. `directOnly` ne contraint rien quand il est faux — le
 * défaut. Un candidat SANS AUCUN signal n'a rien à contredire : il reste,
 * comme partout ailleurs dans ce fichier une absence de fait ne vaut pas
 * contradiction. Seul un candidat dont TOUS les signaux sont explicitement
 * intermédiés est écarté.
 */
export function hasDirectSignal(candidate: DiscoverCandidate, directOnly: boolean): boolean {
  if (!directOnly) return true
  if (candidate.signals.length === 0) return true
  return candidate.signals.some(signal => signal.intermediated !== true)
}

/* ------------------------------------------------------------------ */
/*  #2165.29 — Filtre comptes : Familles de rôles                      */
/* ------------------------------------------------------------------ */

/**
 * Le candidat suggère-t-il au moins un rôle de la famille demandée ?
 *
 * `suggestedRoles` est une SORTIE (LLM, « SUGGÉRÉ » au contrat) — ni le
 * registre ni les sources de signal ne savent l'interroger. Le croisement se
 * fait donc ici, sur les rôles déjà rendus, en résolvant chaque département
 * SUGGÉRÉ vers le registre RÉEL des onze familles acheteurs
 * (`resolveBuyerRoleFamily`, `packages/contracts/buyer-role-families.ts`) —
 * jamais une taxonomie inventée pour ce seul filtre. `'any'` ne contraint
 * rien.
 */
export function hasRoleFamily(candidate: DiscoverCandidate, family: BuyerRoleFamilyKey | 'any'): boolean {
  if (family === 'any') return true
  return candidate.suggestedRoles.some(role => resolveBuyerRoleFamily(role.department) === family)
}

/** Les deux axes de collecte qu'une carte cible peut dire ne pas avoir cherchés. */
type DiscoverNotSearchedAxis = 'offers' | 'needs'

/**
 * #3819.1 — « Ce qui n'a pas été cherché tient en UNE mention compacte »,
 * jamais une ligne vide par champ : les axes NOMMÉS ici, groupés par
 * l'appelant en une seule phrase, plutôt qu'une ligne muette par champ.
 *
 * - **`offers`** (offres/missions, signaux datés) : muet quand `signals` est
 *   vide ET que la recherche de signaux n'a jamais ciblé ce candidat
 *   (`signalsSearched` absent/faux) — un `signals` vide APRÈS recherche est
 *   un fait mesuré (« rien trouvé »), pas une absence de recherche.
 * - **`needs`** (besoins connus) : SEULEMENT pertinent pour un compte déjà
 *   possédé (`accountId` non nul) — un candidat neuf n'a aucun besoin à
 *   chercher, ce n'est pas « non cherché ». `knownNeedsCount` absent sur un
 *   compte possédé veut dire que le décompte a ÉCHOUÉ (`DiscoverPortfolioService`),
 *   jamais qu'il vaut zéro — zéro est un fait mesuré, distinct d'une panne.
 */
export function notSearchedAxes(candidate: DiscoverCandidate): DiscoverNotSearchedAxis[] {
  const axes: DiscoverNotSearchedAxis[] = []
  if (candidate.signals.length === 0 && !candidate.signalsSearched) axes.push('offers')
  if (candidate.accountId !== null && candidate.knownNeedsCount === undefined) axes.push('needs')
  return axes
}
