import { chainFlowSteps, type Chain, type ChainDerivation } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * LE FIL HORIZONTAL D'UN PARCOURS (#1507 §1).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX LECTURES, UN SEUL COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * La page des parcours montre une PISTE — combien de dossiers à chaque étape ;
 * une fiche Besoin, Projet ou Mission montre UN dossier — où il en est. Deux
 * composants afficheraient deux fils qui divergeraient au premier changement de
 * style, et un utilisateur ne reconnaîtrait pas le même objet d'un écran à
 * l'autre. C'est le même fil, nourri différemment.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES ÉTATS, ET CE QU'ILS DISENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Terminée · en cours · à venir · bloquée. Le ROUGE est réservé à un vrai
 * problème (#1507 §1) et n'apparaît donc jamais ici : un dossier qui attend
 * n'est pas une erreur, c'est un dossier qui attend.
 *
 * ⚠️ Aucune couleur en dur. La spécification donnait `#5B3EF5`, `#16A36A`,
 * `#D97706` — six valeurs hexadécimales qui ne suivraient pas le thème, sur un
 * écran qui existe en clair ET en sombre. C'est le défaut qui a touché
 * 149 endroits en août et qui ne se voit qu'en basculant le thème.
 *
 * ⚠️ La piste DÉFILE dans son conteneur (un dossier, lui, passe à la ligne). Onze étapes nommées ne tiennent pas sur
 * une ligne, et le corps de la page ne doit jamais défiler horizontalement.
 */

type ChainFlowState = 'done' | 'skipped' | 'current' | 'upcoming' | 'blocked'

/** Le style de chaque état — par les jetons, jamais par une valeur en dur. */
const STATE_CLASS: Record<ChainFlowState, string> = {
  done: 'border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-success)_10%,transparent)]',
  // Ni franchie, ni à venir : le dossier l'a dépassée sans qu'aucun fait ne la
  // porte. Le pointillé sans fond dit exactement ça — on ne l'a pas constatée.
  skipped: 'border-dashed border-[var(--bellum-border)] bg-transparent',
  current: 'border-[var(--bellum-primary-500)] bg-[color-mix(in_srgb,var(--bellum-primary-500)_12%,transparent)]',
  upcoming: 'border-dashed border-[var(--bellum-border)] bg-transparent',
  blocked: 'border-[var(--bellum-warning)] bg-[color-mix(in_srgb,var(--bellum-warning)_15%,transparent)]',
}

/**
 * L'état de chaque étape pour UN dossier, dérivé de sa position.
 *
 * PURE et exportée : le test la lit sans monter le composant, et surtout elle
 * vit à un seul endroit — deux calculs d'état finiraient par colorer deux
 * étapes différentes sur le même dossier.
 */
export function stateOfStep(derivation: ChainDerivation, position: number): ChainFlowState {
  if (derivation.kind === 'undetermined') return 'upcoming'
  if (position > derivation.position) return 'upcoming'
  if (position === derivation.position) return derivation.blockedGate === null ? 'current' : 'blocked'
  /*
   * ⚠️ UNE ÉTAPE ANTÉRIEURE N'EST PAS « FRANCHIE » PAR DÉFAUT.
   *
   * La position se dérive du fait le PLUS AVANCÉ : les étapes situées avant lui
   * n'ont pas forcément le leur. Les peindre « franchie » affirmait qu'un
   * matching avait été lancé et une shortlist figée alors que le « Pourquoi ? »
   * juste en dessous, sur le MÊME écran, ne les listait pas. C'est l'étape
   * inventée du §6 de #1507 — mesurée en production le 05/09 sur deux fiches.
   *
   * « Non constatée » n'est pas un reproche : un besoin peut légitimement
   * sauter le matching. Ce qui serait faux est d'affirmer le contraire.
   */
  return derivation.evidence.some(entry => entry.position === position) ? 'done' : 'skipped'
}

type LaneCell = { position: number; count: number; medianDays: number | null; awaiting: number }

export function ChainFlow({
  chain,
  locale,
  cells,
  derivation,
  onSelect,
  activeGateQuestion,
}: {
  chain: Chain
  locale: 'fr' | 'en'
  /** Mode PISTE : combien de dossiers à chaque étape. */
  cells?: LaneCell[]
  /** Mode DOSSIER : où en est celui-ci. */
  derivation?: ChainDerivation
  onSelect?: (position: number) => void
  activeGateQuestion?: boolean
}) {
  const { t } = useTranslation('chains')
  const steps = chainFlowSteps(chain)

  return (
    <Box className={derivation ? undefined : 'overflow-x-auto'}>
      {/* #3525 / #3526 — UN dossier : les étapes PASSENT À LA LIGNE (1403 px de
          contenu pour 622 visibles, recette prod 02/10 — le reste était coupé
          sans que rien le dise). Seule la PISTE de la page des parcours, large
          par nature, défile dans son conteneur. */}
      <Box
        data-testid="chain-flow"
        display="flex"
        className={derivation ? 'flex-wrap items-stretch gap-1' : 'w-max items-stretch gap-1'}
      >
        {steps.map((step, index) => {
          /*
           * La cellule est RÉSOLUE une fois, avec sa valeur d'absence.
           *
           * Un `cell?.count ?? 0` répété quatre fois répond quatre fois à la
           * question « si cette valeur manque, zéro est-il vrai ? » — et il
           * suffit qu'une des quatre réponses change pour que l'écran se
           * contredise. Ici l'absence d'une cellule veut dire « aucun dossier à
           * cette étape », ce qui EST zéro ; la durée, elle, reste `null`,
           * parce que « zéro jour d'attente » serait faux.
           */
          const cell: LaneCell | null = cells
            ? (cells.find(entry => entry.position === step.position) ?? {
                position: step.position,
                count: 0,
                medianDays: null,
                awaiting: 0,
              })
            : null
          const state: ChainFlowState = derivation
            ? stateOfStep(derivation, step.position)
            : cell !== null && cell.awaiting > 0
              ? 'blocked'
              : cell !== null && cell.count > 0
                ? 'current'
                : 'upcoming'
          const gate = chain.gates.find(entry => entry.afterPosition === step.position)

          const body = (
            <>
              <Text element="span" size="xs" weight={state === 'upcoming' ? 'normal' : 'medium'} className="truncate">
                {step.label[locale]}
              </Text>
              <Text element="span" size="xs" color="text-muted-foreground">
                {cell
                  ? // ⚠️ « Aucun dossier » et « 0 jour d'attente » sont deux faits
                    // distincts. Une étape vide dit qu'elle est vide ; elle
                    // n'affiche pas une durée qui n'existe pas.
                    cell.count === 0
                    ? t('lane.stepEmpty')
                    : cell.medianDays === null
                      ? t('lane.stepCount', { count: cell.count })
                      : t('lane.stepCountAndDays', { count: cell.count, days: Math.round(cell.medianDays) })
                  : t(`flow.state.${state}`)}
              </Text>
            </>
          )

          return (
            <Box key={step.position} display="flex" className="items-center gap-1">
              {/* Le trait fin entre deux étapes (#1507 §1) : il porte la
                  continuité du parcours, et il ne se dessine pas avant la
                  première — un fil qui commence dans le vide se lit comme une
                  étape manquante. */}
              {index > 0 ? <span aria-hidden className="h-px w-3 bg-[var(--bellum-border)]" /> : null}
              {onSelect ? (
                <button
                  type="button"
                  onClick={() => onSelect(step.position)}
                  className={`flex min-h-11 max-w-[14rem] min-w-0 flex-col items-start gap-0.5 rounded-xl border px-2 py-1.5 text-left ${STATE_CLASS[state]}`}
                >
                  {body}
                </button>
              ) : (
                <Box
                  className={`flex min-h-11 max-w-[14rem] min-w-0 flex-col items-start gap-0.5 rounded-xl border px-2 py-1.5 ${STATE_CLASS[state]}`}
                >
                  {body}
                </Box>
              )}
              {gate && activeGateQuestion !== false ? (
                <Badge
                  variant={state === 'blocked' ? 'warning' : 'outline'}
                  className="shrink-0 px-1 py-0"
                  // La QUESTION de la porte, pas un numéro : c'est la décision
                  // métier, et elle se lit sur l'objet lui-même.
                  title={gate.question[locale]}
                >
                  {t('lane.gate')}
                </Badge>
              ) : null}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
