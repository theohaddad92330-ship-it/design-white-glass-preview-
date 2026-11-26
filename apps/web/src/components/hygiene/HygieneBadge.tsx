import type { DataHygiene, HygieneCheck } from '@bellum/contracts'
import { HYGIENE_THRESHOLDS, hygieneBreached, hygieneEmptyPopulation } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, Minus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { pilotageApi } from '@/features/pilotage/api'

/**
 * Un contrôle de qualité, descendu SUR L'ÉCRAN OÙ IL SE RÉPARE (PDF 13, §171).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA PHRASE QUI PORTE CE COMPOSANT
 * ─────────────────────────────────────────────────────────────────────────────
 * « Sur cet écran, "23 missions sans coût chargé" SE CORRIGE. Sur Pilotage, il
 * se contemple. » Les huit contrôles étaient calculés depuis des semaines et ne
 * s'affichaient que sur le cockpit — c'est-à-dire à l'endroit exact où la
 * personne qui pourrait les réparer n'est pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE CALCUL NE SE REFAIT PAS ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le compte vient de `GET /pilotage/hygiene` et de nulle part ailleurs. Le
 * recomposer côté écran — « les lignes de la page dont `skills` est vide » —
 * donnerait un SECOND nombre pour la même question : il ne compterait que la
 * page affichée, il suivrait le filtre courant, et il finirait par dire autre
 * chose que le cockpit. Deux chiffres qui divergent font douter des deux.
 *
 * Corollaire assumé : la pastille compte sur TOUT l'espace, pas sur le filtre de
 * l'écran. C'est ce que le `hint` doit dire.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE ÉTATS, ET AUCUN NE SE CONFOND
 * ─────────────────────────────────────────────────────────────────────────────
 *  - **rien du tout** — la lecture n'a pas abouti (chargement, ou l'espace n'a
 *    pas le cockpit dans son offre). Ne rien montrer n'affirme rien ; montrer
 *    « 0 » affirmerait « tout est propre », ce qui est le mensonge le plus cher
 *    de ce chantier ;
 *  - **non mesuré** — le serveur a répondu `count: null` : la requête de CETTE
 *    ligne a échoué. Le dire, jamais l'écrire zéro ;
 *  - **satisfaite** — sous le seuil, zéro compris. Zéro est une VRAIE réponse
 *    ici : « aucun besoin sans compétence typée » veut dire que tout est propre ;
 *  - **en alerte** — au-dessus du seuil du contrôle, celui du cockpit et pas un
 *    autre (`hygieneBreached`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE POPULATION VIDE N'EST PAS UNE PART
 * ─────────────────────────────────────────────────────────────────────────────
 * Recette du 27/08, en production, sur le vivier : « **0 sur 0** à disponibilité
 * inconnue », au-dessus d'une liste qui contenait un profil badgé « Candidat ».
 * Les deux chiffres étaient justes — le contrôle ne compte que les CONSULTANTS,
 * l'espace n'avait que des CANDIDATS — mais « 0 sur 0 » se lit « mon vivier est
 * vide », l'inverse de ce que la liste montrait trois centimètres plus bas.
 *
 * `emptyLabel` est la phrase que l'écran écrit dans ce cas : elle NOMME la
 * population sur laquelle on compte. Elle vient de l'écran et pas d'ici, comme
 * `label` et pour la même raison — c'est l'écran qui sait de quoi il parle, et
 * une phrase générique (« aucun objet ») ne nommerait justement rien. Un écran
 * qui ne l'a pas encore écrite garde le rendu précédent : mieux vaut un ratio
 * pauvre qu'une phrase qui n'apprend rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI FILTRE EST UN BOUTON, CE QUI NE FILTRE PAS EST UN TEXTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `onFilter` n'est fourni que par un écran qui porte RÉELLEMENT le filtre
 * équivalent, côté serveur. Sans lui la pastille reste un texte : un bouton qui
 * ne fait rien est pire qu'un chiffre, et il apprend à ne plus cliquer.
 * À zéro elle ne se clique pas non plus — filtrer vers une liste vide est un
 * cul-de-sac.
 */

/** La MÊME clé que le panneau du cockpit : une seule lecture, un seul cache. */
const HYGIENE_QUERY_KEY = ['pilotage-hygiene'] as const

function useHygieneCheck(check: HygieneCheck) {
  const { data, isLoading, isError } = useQuery<DataHygiene>({
    queryKey: HYGIENE_QUERY_KEY,
    queryFn: pilotageApi.hygiene,
    staleTime: 60_000,
    // Un refus d'offre (`manager_cockpit`) ne devient pas vrai en réessayant, et
    // trois tentatives par écran de travail est un coût qu'on ne paie pas.
    retry: false,
  })
  return { line: data?.lines.find(entry => entry.key === check) ?? null, isLoading, isError }
}

export function HygieneBadge({
  check,
  label,
  hint,
  emptyLabel,
  hideWhenEmpty,
  onFilter,
  active,
  className,
  wholePopulation,
  outsideLabel,
}: {
  check: HygieneCheck
  /** Le libellé, écrit dans le namespace de l'ÉCRAN — pas ici : le cockpit a
   *  déjà les siens, et deux copies de la même phrase divergent. */
  label: string
  /** Ce que le compte veut dire, le geste qui le répare, et sa portée. */
  hint?: string
  /** Ce qu'on écrit quand la POPULATION du contrôle est vide — voir l'en-tête.
   *  Doit NOMMER la population (« aucun consultant… »), pas la compter. */
  emptyLabel?: string
  /** #3963 — « supprimer » (Louis 09/10/2026) : une population vide ne fait AUCUNE
   *  ligne (« on n'affiche pas ce qu'on n'a pas », 20/09/2026). Prime sur
   *  `emptyLabel`. Le contrôle ne ment pas pour autant : jamais « 0 sur 0 ». */
  hideWhenEmpty?: boolean
  /** Le filtre équivalent de l'écran. Absent = la pastille reste un texte. */
  onFilter?: () => void
  active?: boolean
  className?: string
  /** #2877 — la population ENTIÈRE que l'écran compte ailleurs (sa tuile). Quand le
   *  contrôle en compte une partie seulement, la part laissée dehors se NOMME
   *  (`outsideLabel`) plutôt que de laisser deux nombres se contredire. */
  wholePopulation?: number
  /** `counted` = la part du contrôle, `whole` = la population entière : l'écran peut écrire « 13 + 5 = 18 ». */
  outsideLabel?: (outside: number, counted: number, whole: number) => string
}) {
  const { t } = useTranslation('common')
  const { line, isLoading, isError } = useHygieneCheck(check)
  if (isLoading || isError || !line) return null

  const pill = [
    'inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 pointer-coarse:min-h-11',
    active ? 'border-[var(--bellum-text-accent)]' : 'border-[var(--bellum-border)]',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  if (line.count === null) {
    return (
      <div className={pill} data-hygiene-state="unread" title={hint ?? label}>
        <Minus className="size-3.5 shrink-0 text-[var(--text-ghost)]" aria-hidden />
        <UnknownValue reason={label} />
      </div>
    )
  }

  // #3963 — population vide + écran qui demande le silence : rien du tout.
  if (hideWhenEmpty && hygieneEmptyPopulation(line)) return null

  // La population est vide : il n'y a pas de part à écrire, il y a une absence à
  // NOMMER. Le contrôle reste affiché — le masquer serait faire taire la
  // question plutôt que d'y répondre.
  if (emptyLabel && hygieneEmptyPopulation(line)) {
    return (
      <div className={pill} data-hygiene-state="empty" title={hint ?? emptyLabel}>
        <Minus className="size-3.5 shrink-0 text-[var(--text-ghost)]" aria-hidden />
        <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
          {emptyLabel}
        </Text>
      </div>
    )
  }

  const breached = hygieneBreached(line)
  const threshold = HYGIENE_THRESHOLDS[check]
  // La même règle d'affichage que le cockpit : une PART s'écrit « n sur m », un
  // décompte s'écrit nu. Rien n'est recalculé — `count` et `total` sont ceux du
  // serveur.
  const value =
    threshold.kind === 'rate' && line.total !== null
      ? t('hygiene.ratio', { count: line.count, total: line.total })
      : String(line.count)

  const outside = wholePopulation !== undefined && line.total !== null ? wholePopulation - line.total : 0

  const body = (
    <>
      {breached === null ? (
        <Minus className="size-3.5 shrink-0 text-[var(--text-ghost)]" aria-hidden />
      ) : breached ? (
        <AlertTriangle className="size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
      ) : (
        <Check className="size-3.5 shrink-0 text-[var(--success-soft-text)]" aria-hidden />
      )}
      <Text element="span" size="xs" weight="semibold">
        {value}
      </Text>{' '}
      <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
        {label}
        {outside > 0 && outsideLabel && line.total !== null && wholePopulation !== undefined
          ? ` · ${outsideLabel(outside, line.total, wholePopulation)}`
          : ''}
      </Text>
    </>
  )

  const state = breached === null ? 'unrated' : breached ? 'breached' : 'satisfied'

  return onFilter && line.count > 0 ? (
    <button type="button" className={pill} data-hygiene-state={state} title={hint ?? label} onClick={onFilter}>
      {body}
    </button>
  ) : (
    <div className={pill} data-hygiene-state={state} title={hint ?? label}>
      {body}
    </div>
  )
}
