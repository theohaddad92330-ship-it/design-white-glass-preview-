import type { SeriesPoint, WaterfallStep } from '@/app/_components/charts.logic'
import type { BusinessCurrent, BusinessMonth } from '@/lib/business-metrics'

/**
 * Ce que l'écran Revenus CALCULE, séparé de ce qu'il rend (#1651).
 *
 * Tout est pur : aucune horloge lue, aucune requête. C'est ici que vivent les
 * seuls endroits où un mensonge pourrait s'écrire — une rétention absente rendue
 * « 0 % », une LTV calculée sur deux mois, un repère de marché sans provenance.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI `formaterEuros` ET `libelleMois` VIVENT ICI ET PLUS DANS LA TRÉSORERIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ils servaient déjà aux deux écrans de la section. Un réglage — et un format
 * EST un réglage — vit à un seul endroit (loi 1 du tome 7, GA-26) : deux
 * `formaterEuros` qui divergent donneraient « 12 480 € » d'un côté et
 * « 12 480,00 € » de l'autre, sans que personne sache lequel fait foi. Ils sont
 * donc remontés d'un cran, à la racine de `/revenus`, et `tresorerie.logic.ts`
 * les IMPORTE au lieu de les redéfinir.
 */

const EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

/** Centimes → « 12 480 € ». `null` rend « — », JAMAIS « 0 € ». */
export function formaterEuros(cents: number | null | undefined): string {
  return cents == null ? '—' : EUROS.format(cents / 100)
}

/** `YYYY-MM` → « Septembre 2026 ». Un mois illisible se rend brut, jamais deviné. */
export function libelleMois(month: string): string {
  const [annee = '', mois = ''] = month.split('-')
  const date = new Date(Date.UTC(Number(annee), Number(mois) - 1, 1))
  if (Number.isNaN(date.getTime())) return month
  const rendu = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
  return rendu.charAt(0).toUpperCase() + rendu.slice(1)
}

/**
 * `YYYY-MM` d'une date, en UTC.
 *
 * ⚠️ EN UTC, et ce n'est pas une inattention : c'est le fuseau dans lequel l'API
 * étiquette ses instantanés (`monthOf` de `mrr-movements.ts`). Lire le mois à
 * Paris ferait, pendant les deux premières heures du 1er, proposer de figer un
 * mois que l'API a déjà rangé sous l'étiquette suivante — et un instantané ne se
 * recalcule jamais.
 *
 * ⚠️ L'horloge est un PARAMÈTRE. Un test qui l'appelle nue passe en septembre et
 * échoue en octobre.
 *
 * Les deux écrans de la section en ont besoin (proposer un mois à figer, ancrer
 * le sélecteur de saisie) : la dérivation vit donc UNE fois. Deux copies
 * divergent — c'est la loi 1 du tome 7, GA-26.
 */
export function moisDe(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const POURCENT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/**
 * Le message d'un refus de l'API, tel qu'un humain doit le lire.
 *
 * ⚠️ LE DÉFAUT QU'IL CORRIGE. Les écrans de cette section lisaient `data.error`.
 * Or une `BadRequestException` de NestJS rend
 * `{ statusCode: 400, message: "<la phrase>", error: "Bad Request" }` : le champ
 * `error` porte le NOM HTTP du code, pas la raison. L'opérateur voyait donc
 * « Bad Request » à la place de « un mois manqué reste un trou nommé dans la
 * série » — une phrase écrite exprès pour être lue, jetée par le lecteur.
 *
 * L'ordre est donc : `message` (ce que NestJS écrit pour l'humain, chaîne ou
 * liste quand un pipe de validation parle), puis `error` (nos propres relais
 * Next l'emploient), puis le code — jamais rien d'inventé.
 */
export function messageDErreurApi(data: unknown, status: number): string {
  const corps = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
  const message = corps?.['message']
  if (typeof message === 'string' && message.trim() !== '') return message
  if (Array.isArray(message)) {
    const lignes = message.filter((ligne): ligne is string => typeof ligne === 'string' && ligne.trim() !== '')
    if (lignes.length > 0) return lignes.join(' · ')
  }
  const erreur = corps?.['error']
  // « Bad Request » / « Internal Server Error » sont le NOM du code, pas une
  // raison : les rendre tels quels ferait passer un libellé HTTP pour une
  // explication. Le code seul est plus honnête.
  if (typeof erreur === 'string' && erreur.trim() !== '' && !NOMS_HTTP.has(erreur)) return erreur
  return `Échec (${status}).`
}

const NOMS_HTTP = new Set([
  'Bad Request',
  'Unauthorized',
  'Forbidden',
  'Not Found',
  'Conflict',
  'Unprocessable Entity',
  'Internal Server Error',
  'Bad Gateway',
  'Service Unavailable',
])

/* ───────────────────────── Bloc 1 — la décomposition du mois ───────────────────────── */

/**
 * Les six étapes du waterfall d'un mois FIGÉ.
 *
 * ⚠️ L'API stocke la contraction et le churn en MAGNITUDE POSITIVE
 * (`apps/api/src/modules/business-metrics/mrr-movements.ts`) : l'invariant qui
 * boucle est `fin = début + nouveau + expansion − contraction − churn`. Les
 * passer tels quels au graphique les ferait MONTER, et le total arriverait
 * au-dessus du vrai MRR. Le signe se pose donc ICI, une fois, plutôt que dans
 * le JSX de l'écran — où il s'oublierait au premier graphique suivant.
 *
 * Un mouvement absent reste `null` jusqu'au dessin : `computeWaterfall` ne
 * dessine alors aucune barre et NE FAIT PAS avancer le total. Le deviner à 0
 * décalerait silencieusement toutes les barres suivantes.
 */
export function etapesDuMois(mois: BusinessMonth): WaterfallStep[] {
  // `0 - v` plutôt que `-v` : `-0` existe en JavaScript, et « −0 € » à l'écran
  // est un chiffre que personne ne devrait avoir à interpréter.
  const retranche = (valeur: number | null): number | null => (valeur == null ? null : 0 - valeur)
  return [
    { label: 'MRR début', kind: 'start', value: mois.mrrStartCents },
    { label: '+ Nouveau', kind: 'delta', value: mois.mrrNewCents },
    { label: '+ Expansion', kind: 'delta', value: mois.mrrExpansionCents },
    { label: '− Contraction', kind: 'delta', value: retranche(mois.mrrContractionCents) },
    { label: '− Churn', kind: 'delta', value: retranche(mois.mrrChurnedCents) },
    { label: '= MRR fin', kind: 'end', value: mois.mrrEndCents },
  ]
}

/**
 * Le CONTRÔLE du solde — T2 de #1651 : « la somme des composantes = mrrEnd
 * exactement ».
 *
 * L'invariant tient par construction côté API, et c'est justement pour ça qu'il
 * mérite d'être affiché : le jour où il ne tiendra plus (une reprise de données,
 * un instantané écrit à la main), l'écran le DIRA au lieu de dessiner un
 * waterfall qui n'arrive pas sur sa dernière barre. Un écart n'est pas une
 * erreur d'affichage, c'est un fait.
 *
 * ⚠️ Ce type n'est PAS exporté : l'écran le lit par `ReturnType<typeof
 * controleDuSolde>`. L'exporter ferait un deuxième nom pour la même chose, que
 * personne n'écrirait — et `pnpm lint:exports:types` le refuse, à raison.
 */
type ControleDuSolde =
  | { etat: 'sans_comparaison' }
  | { etat: 'exact'; cents: number }
  | { etat: 'ecart'; calculeCents: number; figeCents: number; ecartCents: number }

export function controleDuSolde(mois: BusinessMonth): ControleDuSolde {
  const { mrrStartCents, mrrNewCents, mrrExpansionCents, mrrContractionCents, mrrChurnedCents } = mois
  if (
    mrrStartCents == null ||
    mrrNewCents == null ||
    mrrExpansionCents == null ||
    mrrContractionCents == null ||
    mrrChurnedCents == null
  ) {
    // Le premier mois de la série n'a pas de mois précédent. Ce n'est pas un
    // mois sans mouvement, c'est un mois sans terme de comparaison.
    return { etat: 'sans_comparaison' }
  }
  const calcule = mrrStartCents + mrrNewCents + mrrExpansionCents - mrrContractionCents - mrrChurnedCents
  if (calcule === mois.mrrEndCents) return { etat: 'exact', cents: calcule }
  return {
    etat: 'ecart',
    calculeCents: calcule,
    figeCents: mois.mrrEndCents,
    ecartCents: mois.mrrEndCents - calcule,
  }
}

/* ───────────────────────── Bloc 2 — la série 12 mois ───────────────────────── */

/** Douze mois : un an de recul, et cinq lignes qui restent lisibles (MAX_SERIES = 5). */
const MOIS_AFFICHES = 12

/**
 * Les cinq lignes du graphique, bornées aux douze derniers mois figés.
 *
 * ⚠️ Contraction et churn voyagent en MAGNITUDE, comme l'API les stocke : une
 * ligne qui plongerait sous zéro sortirait de la boîte (l'échelle est partagée
 * et part de zéro) et se lirait comme un MRR négatif. La légende de l'écran dit
 * que ces deux lignes sont des montants RETIRÉS.
 *
 * Un mois sans mouvement mesuré porte `null` : `computeLineRuns` en fait un TROU
 * visible, jamais une ligne droite entre deux points connus.
 */
export function seriesDuGraphique(series: readonly BusinessMonth[]): Array<{ name: string; points: SeriesPoint[] }> {
  const fenetre = series.slice(-MOIS_AFFICHES)
  const ligne = (name: string, lire: (mois: BusinessMonth) => number | null) => ({
    name,
    points: fenetre.map(mois => ({ label: libelleMois(mois.month), value: lire(mois) })),
  })
  return [
    ligne('MRR fin', mois => mois.mrrEndCents),
    ligne('Nouveau', mois => mois.mrrNewCents),
    ligne('Expansion', mois => mois.mrrExpansionCents),
    ligne('Contraction', mois => mois.mrrContractionCents),
    ligne('Churn', mois => mois.mrrChurnedCents),
  ]
}

/** « Janvier 2026 → Mars 2026 ». Une série vide ne fabrique aucune période. */
export function periodeDeLaSerie(series: readonly BusinessMonth[]): string {
  const fenetre = series.slice(-MOIS_AFFICHES)
  const premier = fenetre[0]
  const dernier = fenetre[fenetre.length - 1]
  if (!premier || !dernier) return 'aucun mois figé'
  if (premier.month === dernier.month) return libelleMois(premier.month)
  return `${libelleMois(premier.month)} → ${libelleMois(dernier.month)}`
}

/* ───────────────────────── Bloc 3 — les métriques dérivées ───────────────────────── */

type CleRepere = 'nrr' | 'grr' | 'churn_logo' | 'marge_brute'

/**
 * Les repères de marché, avec leur PROVENANCE.
 *
 * ⚠️ T3 de #1651 : « aucun repère sans source citée », et « aucun repère
 * inventé — si je n'ai pas de source, pas de repère ». Ce registre est fermé :
 * ces quatre lignes sont exactement celles que l'issue fournit, et rien d'autre
 * n'entre ici sans une source qu'on puisse aller relire. C'est pourquoi ARPA et
 * LTV n'ont AUCUN repère : personne ne nous en a donné un.
 *
 * ⚠️ `date: null` sur le churn, et c'est délibéré. L'issue date trois de ses
 * quatre repères et pas celui-là. Lui prêter l'année du repère voisin (même
 * éditeur, ligne au-dessus) serait plausible et ce serait quand même une valeur
 * inventée — un repère de 2019 lu comme un repère de 2026 est exactement le
 * piège qu'un pied de page daté doit éviter. L'écran dit donc « année non
 * précisée », qui est vrai, plutôt qu'une année qui ne l'est peut-être pas.
 */
export const REPERES: Record<CleRepere, { valeur: string; source: string; date: string | null }> = {
  nrr: { valeur: 'médiane B2B SaaS 101 %', source: 'ChartMogul, 2 500+ entreprises', date: '2026' },
  grr: { valeur: 'médiane 88 %', source: 'Benchmarkit', date: '2025' },
  churn_logo: { valeur: 'médiane à 1-3 M ARR 3,7 %', source: 'ChartMogul', date: null },
  marge_brute: { valeur: 'médiane SaaS 71-72 %', source: 'Blossom Street', date: 'T1 2025' },
}

type ValeurDerivee = { mesure: true; texte: string } | { mesure: false; raison: string }

type MetriqueDerivee = {
  cle: 'nrr' | 'grr' | 'arpa' | 'ltv' | 'churn_logo' | 'marge_brute'
  label: string
  /** Ce que la métrique VEUT dire. Un ratio nu ne se relit pas trois mois plus tard. */
  definition: string
  valeur: ValeurDerivee
  repere: CleRepere | null
}

/**
 * Le nombre de mois de churn OBSERVÉ sous lequel la LTV n'existe pas.
 *
 * « LTV n'est calculé qu'avec au moins 6 mois de churn observé. Sous 6 mois :
 * non mesurable » (#1651). La raison tient en une phrase : une LTV est une
 * DIVISION par un taux de churn, et un taux estimé sur deux mois se trompe d'un
 * facteur trois sans le dire. Le résultat aurait l'air d'un chiffre.
 */
const MOIS_DE_CHURN_REQUIS = 6

/**
 * Les mois où le churn a été OBSERVÉ — pas ceux où il vaut zéro par défaut.
 *
 * Un mois sans mois précédent n'a pas de churn mesuré (`null`) ; un mois où
 * personne n'est parti a un churn mesuré à zéro. Les deux sont différents, et
 * c'est toute la différence entre « on ne sait pas » et « on sait que non ».
 */
function moisAvecChurnObserve(series: readonly BusinessMonth[]): BusinessMonth[] {
  return series.filter(mois => mois.mrrChurnedCents != null && mois.mrrStartCents != null)
}

/** Le taux de churn de revenu moyen sur les mois observés, ou `null` s'il n'est pas calculable. */
function tauxChurnMoyen(series: readonly BusinessMonth[]): number | null {
  const observes = moisAvecChurnObserve(series)
  if (observes.length === 0) return null
  const churn = observes.reduce((somme, mois) => somme + (mois.mrrChurnedCents ?? 0), 0)
  const base = observes.reduce((somme, mois) => somme + (mois.mrrStartCents ?? 0), 0)
  if (base <= 0) return null
  return churn / base
}

/** Un ratio dont le dénominateur peut manquer ou valoir zéro. Jamais l'infini, jamais « 0 % ». */
function ratio(numerateur: number | null, denominateur: number | null, sansDenominateur: string): ValeurDerivee {
  if (numerateur == null || denominateur == null) return { mesure: false, raison: sansDenominateur }
  if (denominateur <= 0) {
    return { mesure: false, raison: 'Non mesurable : le dénominateur du mois est nul — un ratio n’en a pas.' }
  }
  return { mesure: true, texte: POURCENT.format(numerateur / denominateur) }
}

/**
 * Les six métriques dérivées du dernier mois FIGÉ, chacune avec sa raison quand
 * elle n'est pas mesurable.
 *
 * ⚠️ Elles se calculent sur le dernier mois FIGÉ, jamais sur la position du
 * moment : un mois en cours est incomplet par construction, et une rétention
 * calculée le 3 du mois dirait toujours que tout va bien.
 *
 * ⚠️ Chaque refus porte SA phrase. « Non mesuré » sans sa raison apprend à
 * ignorer la tuile ; avec sa raison, il dit quoi faire — figer un deuxième mois,
 * attendre six mois d'historique.
 */
export function metriquesDerivees(series: readonly BusinessMonth[]): MetriqueDerivee[] {
  const dernier = series[series.length - 1] ?? null
  const observes = moisAvecChurnObserve(series).length

  const sansMois = 'Non mesurable : aucun mois figé. La série commence au premier instantané.'
  const sansPrecedent = dernier
    ? `Non mesurable : ${libelleMois(dernier.month)} est le premier mois figé — il n’a pas de mois précédent, et « 0 % » mentirait.`
    : sansMois

  const nrr: ValeurDerivee = !dernier
    ? { mesure: false, raison: sansMois }
    : ratio(
        dernier.mrrStartCents == null ||
          dernier.mrrExpansionCents == null ||
          dernier.mrrContractionCents == null ||
          dernier.mrrChurnedCents == null
          ? null
          : dernier.mrrStartCents + dernier.mrrExpansionCents - dernier.mrrContractionCents - dernier.mrrChurnedCents,
        dernier.mrrStartCents,
        sansPrecedent,
      )

  const grr: ValeurDerivee = !dernier
    ? { mesure: false, raison: sansMois }
    : ratio(
        dernier.mrrStartCents == null || dernier.mrrContractionCents == null || dernier.mrrChurnedCents == null
          ? null
          : dernier.mrrStartCents - dernier.mrrContractionCents - dernier.mrrChurnedCents,
        dernier.mrrStartCents,
        sansPrecedent,
      )

  const arpaCents = !dernier || dernier.customersEnd <= 0 ? null : dernier.mrrEndCents / dernier.customersEnd
  const arpa: ValeurDerivee =
    arpaCents == null
      ? {
          mesure: false,
          raison: dernier
            ? 'Non mesurable : aucun client récurrent sur le dernier mois figé — la moyenne n’a pas de diviseur.'
            : sansMois,
        }
      : { mesure: true, texte: formaterEuros(Math.round(arpaCents)) }

  const churnLogo: ValeurDerivee = !dernier
    ? { mesure: false, raison: sansMois }
    : ratio(dernier.customersChurned, dernier.customersStart, sansPrecedent)

  return [
    {
      cle: 'nrr',
      label: 'NRR',
      definition: 'Rétention nette : ce que la base du début du mois vaut à la fin, expansion comprise, hors nouveaux.',
      valeur: nrr,
      repere: 'nrr',
    },
    {
      cle: 'grr',
      label: 'GRR',
      definition: 'Rétention brute : la même, sans compter l’expansion. Elle ne dépasse jamais 100 %.',
      valeur: grr,
      repere: 'grr',
    },
    {
      cle: 'arpa',
      label: 'ARPA',
      definition: 'Revenu moyen par client récurrent, sur le dernier mois figé.',
      valeur: arpa,
      // Aucune source fournie : donc aucun repère. On n'en invente pas (T3).
      repere: null,
    },
    {
      cle: 'ltv',
      label: 'LTV',
      definition: 'ARPA ÷ taux de churn mensuel moyen. Une division : le taux doit être OBSERVÉ, pas estimé.',
      valeur: valeurLtv(series, arpa, observes),
      repere: null,
    },
    {
      cle: 'churn_logo',
      label: 'Churn logo',
      definition: 'Part des clients du début de mois qui sont partis. Compte des CLIENTS, pas des euros.',
      valeur: churnLogo,
      repere: 'churn_logo',
    },
    {
      cle: 'marge_brute',
      label: 'Marge brute',
      definition: 'Revenu moins le coût de servir. Elle ne se calcule pas sur cet écran.',
      // Doctrine : un axe qu'on ne peut pas évaluer est NOMMÉ, il ne disparaît
      // pas. Son repère est sourcé et daté ; c'est sa valeur qui manque, et la
      // phrase dit où elle se trouvera.
      valeur: {
        mesure: false,
        raison:
          'Non mesurée ici : elle demande le coût d’infrastructure et les coûts fournisseurs, qui vivent sur /facturation. Le repère est là pour le jour où elle le sera.',
      },
      repere: 'marge_brute',
    },
  ]
}

/** La LTV et ses TROIS refus, chacun avec sa phrase. */
function valeurLtv(series: readonly BusinessMonth[], arpa: ValeurDerivee, observes: number): ValeurDerivee {
  if (series.length === 0) {
    return { mesure: false, raison: 'Non mesurable : aucun mois figé. La série commence au premier instantané.' }
  }
  if (observes < MOIS_DE_CHURN_REQUIS) {
    return {
      mesure: false,
      raison: `Non mesurable : il faut ${MOIS_DE_CHURN_REQUIS} mois de churn observé, la série en compte ${observes}. Un taux estimé sur moins se trompe d’un facteur trois sans le dire, et le résultat aurait l’air d’un chiffre.`,
    }
  }
  if (!arpa.mesure) {
    return { mesure: false, raison: 'Non mesurable : l’ARPA du dernier mois figé ne l’est pas non plus.' }
  }
  const taux = tauxChurnMoyen(series)
  if (taux == null || taux <= 0) {
    return {
      mesure: false,
      raison: `Non mesurable : le churn moyen observé sur ${observes} mois est nul. La LTV serait infinie, pas immense.`,
    }
  }
  const dernier = series[series.length - 1]
  if (!dernier || dernier.customersEnd <= 0) {
    return { mesure: false, raison: 'Non mesurable : l’ARPA du dernier mois figé ne l’est pas non plus.' }
  }
  return { mesure: true, texte: formaterEuros(Math.round(dernier.mrrEndCents / dernier.customersEnd / taux)) }
}

/* ───────────────────────── Bloc 4 — les revenus contractés ───────────────────────── */

/**
 * Le total, et ce qu'il ne contient PAS.
 *
 * ⚠️ Doctrine : « Le MRR et le revenu contracté ne sont JAMAIS additionnés sans
 * une ligne "total, dont X € non récurrent". » Les deux premières sources sont
 * mensuelles et s'additionnent ; le ponctuel, lui, reste DEHORS — un montant
 * facturé une fois n'a pas d'équivalent mensuel, et lui en fabriquer un ferait
 * apparaître un revenu récurrent qui n'existe pas.
 */
export function totalToutesSources(current: BusinessCurrent): {
  mensuelCents: number
  nonRecurrentCents: number
  phraseTotal: string
  phraseNonRecurrent: string
} {
  const mensuelCents = current.mrrCents + current.contractedRevenueCents
  const nonRecurrentCents = current.oneOffCents
  return {
    mensuelCents,
    nonRecurrentCents,
    phraseTotal: `Total mensuel ${formaterEuros(mensuelCents)} — ${formaterEuros(current.mrrCents)} d’abonnements récurrents et ${formaterEuros(current.contractedRevenueCents)} de contrats sur facture ramenés au mois.`,
    phraseNonRecurrent:
      nonRecurrentCents > 0
        ? `${formaterEuros(nonRecurrentCents)} sur ${current.oneOffCustomers} contrat(s) facturés une fois, hors total : un montant ponctuel n’est jamais divisé par douze.`
        : 'Aucun montant ponctuel facturé — rien à tenir hors total.',
  }
}
