import type { RapportParcours } from '@/lib/product-analytics'

/**
 * #1684.1 / #1684.2 — CE QUI MANQUAIT DANS « SORTIES PAR ÉCRAN » ET « PARCOURS ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1684.1 — LA DESTINATION PRINCIPALE ET LA FERMETURE PURE NE SONT PAS LA MÊME CHOSE
 * ─────────────────────────────────────────────────────────────────────────────
 * `/produit` rendait le NOMBRE de sorties par écran, jamais OÙ elles vont ni
 * combien FERMENT le produit sans aller nulle part — deux signaux très
 * différents qu'un seul chiffre confondait. L'API sépare déjà les deux dans
 * `ScreenExit.detail` (`destinations` exclut structurellement les fermetures
 * et les inactivités — `product-analytics-read.service.ts` ne les ajoute
 * jamais à la map des destinations) : {@link destinationPrincipale} ne fait
 * que lire la première entrée d'un tableau déjà trié par l'API, elle ne
 * recalcule rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1684.2 — LE RÉSIDU EN DERNIER, PAS TRIÉ AVEC LES AUTRES
 * ─────────────────────────────────────────────────────────────────────────────
 * Défaut mesuré cinq fois dans ce dépôt (et déjà corrigé une fois dans ce même
 * dossier : `../feedback/feedback.logic.ts:208`, le groupe « écran inconnu »
 * qui « se range EN DERNIER quel que soit son volume ») : trier un résidu par
 * volume avec le reste d'une liste TRONQUÉE le met en tête s'il est gros, et
 * un fourre-tout en tête d'un top 10 mange une place utile.
 *
 * `rapport.sequences` est déjà le TOP 20 côté API (`TOP_N`,
 * `product-analytics-read.service.ts`) : le résidu que ce fichier calcule
 * n'est donc PAS « tout ce qui existe au-delà des dix premiers » — c'est
 * « ce qui reste des vingt envoyés par l'API, au-delà des dix affichés ». Le
 * libellé du résidu le dit (« non détaillés »), pour ne jamais laisser croire
 * à un total exhaustif que l'API elle-même ne fournit pas.
 */

type SequencesMesurees = Extract<RapportParcours['sequences'], { kind: 'measured' }>
export type Sequence = SequencesMesurees['value'][number]

type ExitsMesurees = Extract<RapportParcours['exits'], { kind: 'measured' }>
type ScreenExit = ExitsMesurees['value'][number]
export type ExitDetailMesure = Extract<ScreenExit['detail'], { kind: 'measured' }>
type Destination = ExitDetailMesure['destinations'][number]

/**
 * La destination la plus fréquente d'un écran, ou `null` quand toutes ses
 * sorties ferment le produit ou viennent d'une inactivité — deux cas qui
 * n'ont structurellement pas de destination (règle #1684.1 : la fermeture
 * pure se lit ailleurs, dans `detail.closeRate`, jamais dans ce tableau).
 */
export function destinationPrincipale(detail: ExitDetailMesure): Destination | null {
  return detail.destinations[0] ?? null
}

/** Combien de parcours nommés une barre segmentée affiche avant de replier le
 *  reste dans un résidu. Dix : assez pour montrer un vrai classement, assez
 *  court pour rester lisible dans une légende. */
export const TOP_PARCOURS_AFFICHES = 10

// Non exportés : ni l'un ni l'autre n'a de consommateur en dehors de ce
// fichier — `page.tsx` reçoit `slices` par inférence et le passe tel quel à
// `SegmentBar` (dont la forme `Segment` est structurellement compatible).
// Un type exporté sans second lecteur est le bruit que `pnpm lint:exports:types`
// (knip) refuse.
type SegmentParcours = { label: string; value: number }

type SegmentsParcoursResultat = {
  /** Les segments à donner tels quels à `SegmentBar` — le résidu, s'il existe,
   *  est le DERNIER élément, jamais mêlé au tri des autres. */
  slices: SegmentParcours[]
  /** Le nombre de parcours mesurés (parmi ceux que l'API a renvoyés) qui ne
   *  sont pas détaillés dans `slices` — 0 quand tout est affiché. */
  masques: number
}

/**
 * Les dix parcours principaux, en segments — plus un résidu NOMMÉ et TOUJOURS
 * en dernière position, quel que soit son volume (voir le docblock de tête).
 */
export function segmentsDesParcours(sequences: readonly Sequence[]): SegmentsParcoursResultat {
  const tries = [...sequences].sort(
    (a, b) => b.sessions - a.sessions || a.routes.join('→').localeCompare(b.routes.join('→')),
  )
  const tete = tries.slice(0, TOP_PARCOURS_AFFICHES)
  const reste = tries.slice(TOP_PARCOURS_AFFICHES)

  const slices: SegmentParcours[] = tete.map(sequence => ({
    label: sequence.labels.map(label => label.fr).join(' → '),
    value: sequence.sessions,
  }))

  if (reste.length > 0) {
    slices.push({
      label: `Autres parcours mesurés (${reste.length} non détaillés)`,
      value: reste.reduce((somme, sequence) => somme + sequence.sessions, 0),
    })
  }

  return { slices, masques: reste.length }
}
