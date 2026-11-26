import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import type { DiscoverDegradedSource } from '@/features/discover/lib/discover-types'
import { dataSourceLabel, dataSourceLabels } from '@/lib/data-source-label'

/** Raisons dont la cause est connue EXACTEMENT, et qui ont donc chacune leur
 *  phrase. Tout le reste est rendu tel quel : le chemin `except` du routeur
 *  renvoie un message d'exception brut, et le traduire en une cause plus
 *  présentable affirmerait ce qu'on ignore.
 *
 *  #2469 — les quatre dernières arrivaient jusqu'ici en PHRASE FRANÇAISE, écrite
 *  en dur dans le service IA : un client a lu « 1 entreprise(s) non vérifiée(s)
 *  … écartée(s) » sur `/discover`. Intraduisible, et accordée à coups de
 *  « (s) ». Elles passent désormais par ce chemin comme les autres — le service
 *  IA n'émet plus qu'une clé et son compte. Garde côté IA :
 *  `apps/ia/tests/test_degraded_reason_is_machine_readable.py`. */
const KNOWN_REASONS = new Set([
  'missing_api_key',
  'unauthorized',
  'quota_exceeded',
  'rate_limited',
  'upstream_error',
  // #4518 — un 4xx : NOTRE requête est refusée, la source n'est pas en cause (inutile de relancer).
  'request_rejected',
  'network_error',
  // #2521 — on a CESSÉ D'ATTENDRE à la limite de temps : ni « injoignable », ni
  // une panne affirmée. La phrase dit que la liste reste classée par le score.
  'time_budget',
  'invalid_response',
  'empty_query',
  'siren_ambiguous',
  'siren_unreachable',
  'siren_not_examined',
  'unknown_sector',
])

/** #2521 (suite) — une raison INCONNUE en forme de clé machine (`snake_case`,
 *  comme toutes celles du catalogue ci-dessus) n'est pas un message d'exception
 *  : c'est un identifiant interne qui a échappé au catalogue, et il ne doit
 *  jamais fuiter tel quel à l'écran (« une clé brute »). Le chemin `except` du
 *  routeur, lui, rend une PHRASE (espaces, ponctuation) — elle continue de
 *  s'afficher telle quelle juste en dessous, `jamais réécrite` : traduire un
 *  texte libre en une cause plus jolie affirmerait ce qu'on ignore, mais une
 *  clé n'est justement PAS un texte destiné à être lu. */
const looksLikeAMachineKey = (value: string) => /^[a-z][a-z0-9_]*$/.test(value)

/**
 * La liste « source — raison », partagée par les DEUX états qui la montrent.
 *
 * #1766 — elle vivait dans le seul `DegradedBanner`. L'état « résultat non
 * vérifiable » doit nommer exactement les mêmes choses de la même façon : une
 * seconde copie du vocabulaire aurait divergé au premier ajout de raison, et
 * l'utilisateur aurait lu deux phrases pour un seul fait.
 */
export function DegradedLines({
  entries,
  jobsSearching = false,
}: {
  entries: readonly DiscoverDegradedSource[]
  /** #4045 — la collecte des offres continue en arrière-plan et l'écran se relit seul :
   *  la ligne dit « en cours » au lieu de demander de recharger. */
  jobsSearching?: boolean
}) {
  const { t } = useTranslation('discover')
  const lines = [
    ...new Set(
      entries.map(entry =>
        t('degraded.line', {
          // #1912 — la capacité (« la recherche web »), jamais l'identifiant de
          // NOTRE fournisseur (`pappers`, `brave`) ni du modèle (`claude`).
          source: dataSourceLabel(t, entry.source),
          // #2469 — le COMPTE et les VALEURS voyagent à part de la raison,
          // pour que la phrase s'accorde ici (`_one` / `_other`).
          reason: KNOWN_REASONS.has(entry.reason)
            ? t(`degraded.reason.${entry.reason}`, {
                ...(typeof entry.count === 'number' ? { count: entry.count } : {}),
                ...(entry.fields?.length ? { fields: entry.fields.join(', ') } : {}),
              })
            : entry.reason
              ? looksLikeAMachineKey(entry.reason)
                ? t('degraded.reason.unknown')
                : entry.reason
              : t('degraded.noReason'),
        }),
      ),
    ),
  ]
  return (
    <ul className="mt-1.5 space-y-0.5">
      {jobsSearching && (
        <li className="text-xs first-letter:uppercase" style={{ color: 'var(--text-muted)' }}>
          {t('degraded.jobsSearching')}
        </li>
      )}
      {/* #4279 — une phrase identique n'apparaît qu'UNE fois : deux entrées de même source et même raison
          ne font pas deux lignes. */}
      {lines.map(line => (
        <li key={line} className="text-xs first-letter:uppercase" style={{ color: 'var(--text-muted)' }}>
          {line}
        </li>
      ))}
    </ul>
  )
}

/**
 * « Une source est tombée » — dit, jamais masqué.
 *
 * C'est le point non négociable du contrat. Dans la v1, une panne de Brave
 * était avalée : l'écran rendait alors une liste 100 % hallucinée avec la même
 * assurance qu'une liste vérifiée. Ici on nomme la source ET on dit ce que ça
 * change pour le commercial : les résultats affichés restent exacts, mais la
 * liste est incomplète.
 *
 * Ce bandeau ne reçoit QUE des pannes (`splitDegraded().faults`). Les limites de
 * capacité en sont sorties : `unsupported_filters` décrit une source qui a
 * répondu PLUS LARGE que demandé, et l'annoncer ici disait trois faux d'un coup
 * (« n'a pas répondu », « liste incomplète », « d'autres candidats existent »).
 * Un avertissement qui crie au loup n'est plus lu le jour où le loup arrive —
 * et c'est ici qu'il arrive.
 *
 * Chaque raison porte sa propre phrase. La description unique d'origine — « une
 * ou plusieurs sources n'ont pas répondu » — était écrite pour la panne réseau ;
 * un quota épuisé ou une clé refusée y étaient tout aussi mal décrits.
 *
 * ⚠️ #1766 — CE BANDEAU SUPPOSE UNE LISTE EN DESSOUS. « Les entreprises
 * ci-dessous restent exactes, mais la liste est incomplète » n'est vrai que si
 * quelque chose est affiché. Au-dessus de zéro résultat, il disait deux faux —
 * et il RASSURAIT. L'appelant (`Discover.tsx`) ne le rend donc plus quand
 * `candidates.length === 0` : c'est `DiscoverUnverifiable` qui prend la place.
 */
export function DegradedBanner({
  degraded,
  jobsSearching = false,
  jobsFaults = [],
  cardFaults = [],
  ambiguities = [],
}: {
  degraded: DiscoverDegradedSource[]
  jobsSearching?: boolean
  /** #3901 — sources d'offres vraiment tombées : une phrase à elles, hors de l'ambre. */
  jobsFaults?: readonly DiscoverDegradedSource[]
  /** DISCOVER-PARTIEL-2 — marchés publics & co illisibles : UNE ligne neutre, jamais l'ambre. */
  cardFaults?: readonly DiscoverDegradedSource[]
  /** DISCOVER-PARTIEL-2 — homonymes écartés : ils ne font PAS un second bloc, ils se replient dans « Détail ». */
  ambiguities?: readonly DiscoverDegradedSource[]
}) {
  const { t } = useTranslation('discover')
  const [open, setOpen] = useState(false)
  const detailId = useId()
  // #3901 — les offres illisibles ne retirent aucune entreprise : « la liste est incomplète »
  // serait faux. Une ligne neutre dédiée, avec le nombre de cartes quand l'IA le donne.
  const unreadCards = jobsFaults.reduce((sum, e) => sum + (typeof e.count === 'number' ? e.count : 0), 0)
  // Une seule phrase neutre : les offres (avec leur compte) priment sur les autres données de cartes.
  const jobsUnread =
    jobsFaults.length > 0 || cardFaults.length > 0 ? (
      <p role="status" className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
        {jobsFaults.length === 0
          ? t('degraded.cardsUnread')
          : unreadCards > 0
            ? t('degraded.jobsUnread', { count: unreadCards })
            : t('degraded.jobsUnreadSome')}
      </p>
    ) : null
  // SIMON-FIX (recette Simon 20/10) — `time_budget` : NOUS avons cessé d'attendre ; rien n'est tombé chez la
  // source. « En panne » ne se dit que d'une panne ; le délai a sa propre phrase (la liste reste partielle).
  const slow = degraded.filter(e => e.reason === 'time_budget')
  const outages = degraded.filter(e => e.reason !== 'time_budget')
  const ambiguousCount = ambiguities.reduce((sum, e) => sum + (typeof e.count === 'number' ? e.count : 1), 0)
  if (degraded.length === 0) {
    // #4045 — aucune panne de liste : au plus la collecte des offres qui se poursuit (une
    // phrase neutre, pas l'ambre d'une source tombée) et/ou des offres illisibles.
    return (
      <>
        {jobsUnread}
        {jobsSearching && (
          <p role="status" className="mb-4 text-xs" style={{ color: 'var(--text-muted)' }}>
            {t('degraded.jobsSearching')}
          </p>
        )}
      </>
    )
  }

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{ background: 'var(--warning-soft-bg)', border: '1px solid var(--warning-soft-border)' }}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--warning-soft-text)' }}>
        <AlertTriangle className="h-[13px] w-[13px]" />
        {t('degraded.title')}
      </p>
      {/* DISCOVER-PARTIEL-2 — UN bandeau, ≤ 2 lignes : la source réellement en panne (par sa famille, jamais
          par notre fournisseur), puis les homonymes en une phrase ; le reste est replié derrière « Détail ». */}
      <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
        {outages.length > 0
          ? t('degraded.summary', {
              sources: dataSourceLabels(
                t,
                outages.map(e => e.source),
              ).join(', '),
            })
          : null}
        {outages.length > 0 && slow.length > 0 ? ' ' : null}
        {/* SIMON-FIX — un délai de NOTRE budget de temps n'est pas une panne de la source. */}
        {slow.length > 0
          ? t('degraded.summarySlow', {
              sources: dataSourceLabels(
                t,
                slow.map(e => e.source),
              ).join(', '),
            })
          : null}
      </p>
      {ambiguities.length > 0 && (
        <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {t('degraded.summaryAmbiguous', { count: ambiguousCount })}
        </p>
      )}
      {/* #4279 — le détail n'est plus un `<details>` natif : replié, son contenu quittait le flux
          (rendu par-dessus la carte voisine, puces « 1. » comprises). Un état explicite : replié = absent
          du DOM, déplié = UNE liste, une phrase par ligne, chacune une seule fois. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen(value => !value)}
        className="mt-1 block cursor-pointer text-xs underline pointer-coarse:min-h-11"
        style={{ color: 'var(--text-secondary)' }}
      >
        {t('degraded.detail')}
      </button>
      {open && (
        <div id={detailId} className="mt-1 space-y-1">
          <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {t('degraded.description')}
          </p>
          <DegradedLines entries={degraded} jobsSearching={jobsSearching} />
          {ambiguities.length > 0 && (
            <>
              <p className="text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
                {t('ambiguous.description')}
              </p>
              <DegradedLines entries={ambiguities} />
            </>
          )}
          {jobsUnread}
        </div>
      )}
    </div>
  )
}
