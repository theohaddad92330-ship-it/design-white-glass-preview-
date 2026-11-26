import { isSegmentCollectionStale, SEGMENT_CAPABILITY_EPOCH, segmentCapabilityAt } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIsDemo } from '@/features/demo/useIsDemo'

/**
 * #2543.7 (18/09/2026) — L'AVEU DE FRAÎCHEUR, étendu aux trois segments qui
 * rejoignent contacts (#AF.3, `ContactsStaleCollectionNotice`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MÊME CRITÈRE QUE LE CIBLAGE — GA-26, UN SEUL ENDROIT DÉCIDE
 * ─────────────────────────────────────────────────────────────────────────
 * `isSegmentCollectionStale` / `SEGMENT_CAPABILITY_EPOCH` sont EXACTEMENT ce
 * que `SegmentCatchupService.listConcernedAccountsForSegment` (apps/api)
 * évalue côté serveur pour décider qui rejouer. Un seul endroit décide
 * « concerné » — cet écran ne réimplémente rien, il relit la même fonction
 * pure, pour n'importe lequel des trois segments.
 *
 * `collectedAt` absent (jamais daté) est traité comme PÉRIMÉ, jamais présumé
 * à jour : « non mesuré n'est jamais 0 », ici « non mesuré n'est jamais à
 * jour ».
 *
 * ⚠️ Tant qu'aucune capacité n'est datée pour un segment
 * (`SEGMENT_CAPABILITY_EPOCH[dimension]` absent — le cas de signals/strategy
 * à ce jour, voir le docblock du contrat), ce composant ne rend RIEN pour
 * AUCUN compte : deviner une capacité inventerait un rattrapage sur du neuf,
 * ce que la doctrine interdit. Le mécanisme est prêt ; sa visibilité attend
 * qu'un futur correctif date une vraie capacité sur l'un de ces segments —
 * exactement comme #2543 l'a fait pour contacts.
 *
 * #2755 (24/09/2026) — `entities` REJOINT ce composant, SA capacité EST
 * désormais datée (`SEGMENT_CAPABILITY_EPOCH.entities`) : Louis (beta,
 * 23/09) — « il doit toujours y avoir un organigramme » — sur un compte
 * analysé avant le repli snake_case IA (`51f284697`), l'assembleur ne
 * pouvait construire aucune entité. Ce bandeau, monté depuis #2543.7 dans
 * `TabOrganigramme` mais resté muet, dit enfin honnêtement que la collecte
 * est antérieure plutôt que de laisser l'onglet vide sans raison affichée.
 *
 * #2118.51 (18/09/2026) — `dossier_read` REJOINT ce composant, et SA capacité
 * EST datée (`SEGMENT_CAPABILITY_EPOCH.dossier_read`) : c'est le premier
 * usage de ce composant générique qui s'allume réellement hors du segment
 * `contacts` (`ContactsStaleCollectionNotice`, un composant séparé). Rendu
 * dans `TabOverview`, à côté de `BellumReadCard` — la carte qui affiche
 * précisément la décomposition en sept axes que ce bandeau annonce comme
 * antérieure.
 *
 * #2298.4 (réfuté en production le 19/09/2026) — `access_relation` REJOINT ce
 * composant, capacité RÉELLEMENT datée elle aussi. L'axe RELATION de
 * l'adressabilité (onglet Accès) était STOCKÉ au moment de l'analyse
 * (`raw_analysis.addressability`, jamais recalculé à l'affichage) : deux
 * comptes du même espace, analysés à des dates différentes, se contredisaient
 * sur l'état d'un connecteur (ACTIA « CRM non connecté » / LVMH « CRM
 * connecté », mesuré en production le 19/09) — ce bandeau dit honnêtement
 * lequel des deux calculs est antérieur à la capacité (missions/agenda/
 * e-mails/correction, en plus du CRM).
 */
// #4078 — `dossier_blocks` : les cinq blocs du dossier complet, produits par une vraie
// analyse depuis le 13/10 (`SEGMENT_CAPABILITY_EPOCH.dossier_blocks`), rendu dans la Synthèse.
type SegmentStaleCollectionDimension =
  | 'entities'
  | 'signals'
  | 'strategy'
  | 'dossier_read'
  | 'access_relation'
  | 'dossier_blocks'

/** Le préfixe i18n de chaque segment, dans le namespace `accountOrg` — les
 *  TROIS clés (`titleDated`/`titleUnknown`/`reason`) existent sous chacun,
 *  déclinées : le format des titres est partagé, `reason` nomme le CTA propre
 *  à chaque segment (« Enrichir la carte », « Actualiser », « Changer de
 *  stratégie », « Rafraîchir l'analyse »), donc ne se réutilise pas telle
 *  quelle. */
const I18N_KEY_PREFIX: Readonly<Record<SegmentStaleCollectionDimension, string>> = {
  entities: 'organigramme.staleCollection',
  signals: 'signalsTab.staleCollection',
  strategy: 'planTab.staleCollection',
  dossier_read: 'overviewTab.staleCollection',
  access_relation: 'accessTab.staleCollection',
  dossier_blocks: 'overviewTab.dossierBlocksStaleCollection',
}

export function SegmentStaleCollectionNotice({
  dimension,
  collectedAt,
  action,
  hideWhenUndated = false,
  i18nPrefix,
  capabilityIssue,
}: {
  /** Intégration 09/10 — un bandeau qui annonce UNE capacité précise (ex. `#3504`, l'effectif sous la
   *  barrière) se date sur ELLE, jamais sur l'epoch du segment, qu'une capacité suivante fait avancer. */
  capabilityIssue?: string
  /** #3504 — un second bandeau du MÊME segment, avec sa propre raison (ex. la barrière d'achat sous `signals`). */
  i18nPrefix?: string
  /** #3499 — `true` : une date de collecte inconnue ne fait AUCUNE ligne (« Date de collecte non mesurée »). */
  hideWhenUndated?: boolean
  dimension: SegmentStaleCollectionDimension
  collectedAt: string | null | undefined
  /**
   * #2298.4 (19/09/2026, lot I3) — OPTIONNEL, et le SEUL des six segments à
   * s'en servir aujourd'hui : `access_relation` est le seul rejeu GRATUIT
   * (`AnalysisOnDemandService.recalculateRelationAxis`, zéro appel sortant).
   * Les cinq autres segments n'ont que leur `reason` statique — pas de
   * bouton, leur rejeu reste PAYANT (`refreshResearch`/`replan`/…) et ne doit
   * jamais partir d'un clic sur ce bandeau seul. `undefined` = comportement
   * byte-identique à avant ce prop.
   */
  action?: { label: string; onClick: () => void; pending?: boolean }
}) {
  const { t, i18n } = useTranslation('accountOrg')
  // Louis 13/10 — le bandeau de fraîcheur vit HORS démo (même règle que
  // `ContactsStaleCollectionNotice`) ; le hook précède tout retour anticipé.
  const isDemo = useIsDemo()
  const capabilityAt = capabilityIssue
    ? segmentCapabilityAt(dimension, capabilityIssue)
    : SEGMENT_CAPABILITY_EPOCH[dimension]
  if (isDemo) return null
  if (!capabilityAt || !isSegmentCollectionStale(collectedAt, capabilityAt)) return null
  if (hideWhenUndated && !collectedAt) return null

  const prefix = i18nPrefix ?? I18N_KEY_PREFIX[dimension]
  const dateLabel = collectedAt ? formatDate(collectedAt, i18n.language) : null

  // ⚠️ `--warning-soft-text` / `--warning-soft-bg`, jamais `--bellum-warning`
  // nu : ce dernier fait 1,84:1 en clair (voir NeedVerdictBanner.tsx) — sous
  // le plancher AA. Les jetons `*-soft-*` sont opaques et assortis, GA-33.
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[var(--bellum-border)] bg-[var(--warning-soft-bg)] px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--warning-soft-text)]">
          {dateLabel ? t(`${prefix}.titleDated`, { date: dateLabel }) : t(`${prefix}.titleUnknown`)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--bellum-text-muted)]">{t(`${prefix}.reason`)}</p>
        {action && (
          <div className="pt-2">
            {/* #2298.4 — « rien ne part seul » (doctrine) : ce bouton est le
                SEUL déclencheur, un geste explicite de l'utilisateur, jamais
                un effet automatique de l'affichage du bandeau. `pending`
                désactive le bouton pendant l'appel — jamais un second clic
                qui doublerait la requête. */}
            <Button size="sm" variant="outline" disabled={action.pending} onClick={action.onClick}>
              {action.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(dateStr: string, language: string): string {
  const date = new Date(dateStr)
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}
