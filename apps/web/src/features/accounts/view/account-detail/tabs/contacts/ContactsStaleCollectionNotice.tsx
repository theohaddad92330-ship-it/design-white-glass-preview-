import { isSegmentCollectionStale, SEGMENT_CAPABILITY_EPOCH } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useIsDemo } from '@/features/demo/useIsDemo'

/**
 * #AF.3 (18/09/2026) — L'AVEU DE FRAÎCHEUR du segment contacts.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA CORRIGE
 * ─────────────────────────────────────────────────────────────────────────
 * #2543 (couverture des contacts) est servi en production, mais les contacts
 * sont LUS en base — jamais recalculés à l'affichage. Un compte analysé AVANT
 * le correctif continue de montrer son stock d'alors avec la même assurance
 * qu'une collecte fraîche. Tant qu'il n'a pas été rejoué (rattrapage ciblé,
 * #AF.4, ou un simple « Enrichir contacts »), cet onglet le DIT — doctrine du
 * dépôt, mot pour mot : « un fait périmé redevient inconnu avec sa date, il
 * ne disparaît pas ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE MÊME CRITÈRE QUE LE CIBLAGE — GA-26
 * ─────────────────────────────────────────────────────────────────────────
 * `isSegmentCollectionStale` / `SEGMENT_CAPABILITY_EPOCH` sont EXACTEMENT ce
 * que `SegmentCatchupService.listConcernedAccounts` (apps/api) évalue côté
 * serveur pour décider qui rejouer. Un seul endroit décide « concerné » —
 * l'écran ne réimplémente rien, il relit la même fonction pure.
 *
 * `collectedAt` absent (jamais daté — tous les dossiers antérieurs à ce lot)
 * est traité comme PÉRIMÉ, jamais présumé à jour : « non mesuré n'est jamais
 * 0 », ici « non mesuré n'est jamais à jour ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2543.3b/.3c/.3d (18/09/2026) — le geste, UNE ligne, jamais en démo
 * ─────────────────────────────────────────────────────────────────────────
 * #2543.3b : mesuré en production le 18/09, le bandeau renvoyait à un bouton
 * « Enrichir contacts » que l'utilisateur devait chercher ailleurs sur
 * l'écran. Il porte maintenant le geste lui-même (`onEnrich`/`enriching`,
 * fournis par l'appelant — `TabContacts.tsx` branche le MÊME
 * `useEnrichContacts` que le reste de l'onglet, GA-26, rien de neuf n'est
 * écrit ici).
 *
 * #2543.3c : en espace de DÉMONSTRATION, aucune collecte réelle n'a jamais
 * eu lieu — une « date de collecte » n'existe pas et ne peut donc pas être
 * périmée. Le bandeau serait du bruit pur (mesuré sur Thalès, en démo :
 * « Date de collecte non mesurée — à revérifier », sur un dossier semé).
 * Même détection que le ruban « MODE DÉMO » (`useIsDemo`, GA-26).
 *
 * #2543.3d : une ligne — la phrase + le bouton dans le MÊME conteneur flex.
 * L'explication longue (`contactsTab.staleCollection.reason`) a disparu :
 * ce qui compte est le geste, pas le paragraphe. `flex-wrap` laisse le
 * bouton passer sous la phrase à largeur mobile — la phrase, elle, reste une
 * ligne (`truncate`).
 */
export function ContactsStaleCollectionNotice({
  collectedAt,
  onEnrich,
  enriching = false,
}: {
  collectedAt: string | null | undefined
  /** Le geste qui lève le contrôle — le MÊME que le bouton « Enrichir
   *  contacts » du reste de l'onglet. Fourni par l'appelant, qui sait
   *  l'exécuter (GA-26 : un seul endroit déclenche ce rafraîchissement). */
  onEnrich: () => void
  enriching?: boolean
}) {
  const { t, i18n } = useTranslation('accountOrg')
  const isDemo = useIsDemo()
  // #2543.3c — aucune collecte réelle en démo : la question ne se pose pas.
  if (isDemo) return null
  const capabilityAt = SEGMENT_CAPABILITY_EPOCH.contacts
  if (!capabilityAt || !isSegmentCollectionStale(collectedAt, capabilityAt)) return null

  const dateLabel = collectedAt ? formatDate(collectedAt, i18n.language) : null
  // SIMON-FIX (vu en passant a) — jamais datée : on SAIT que la collecte précède la capacité (la date est née
  // avec elle). « Collecte antérieure au … » plutôt que « non mesurée » (recette Simon 20/10).
  const capabilityLabel = formatDate(capabilityAt, i18n.language)

  // ⚠️ `--warning-soft-text` / `--warning-soft-bg`, jamais `--bellum-warning`
  // nu : ce dernier fait 1,84:1 en clair (voir NeedVerdictBanner.tsx) — sous
  // le plancher AA. Les jetons `*-soft-*` sont opaques et assortis, GA-33.
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--bellum-border)] bg-[var(--warning-soft-bg)] px-4 py-3">
      <AlertTriangle className="size-4 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--warning-soft-text)]">
        {dateLabel
          ? t('contactsTab.staleCollection.titleDated', { date: dateLabel })
          : t('contactsTab.staleCollection.titleBefore', { date: capabilityLabel })}
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        icon={RefreshCw}
        disabled={enriching}
        onClick={onEnrich}
        className="shrink-0"
      >
        {enriching ? t('contactsTab.staleCollection.actionPending') : t('contactsTab.staleCollection.action')}
      </Button>
    </div>
  )
}

function formatDate(dateStr: string, language: string): string {
  const date = new Date(dateStr)
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
}
