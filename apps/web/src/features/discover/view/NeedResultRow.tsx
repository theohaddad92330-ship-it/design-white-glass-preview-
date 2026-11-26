import { useState } from 'react'
import { offerOriginLabel } from '@bellum/contracts'
import { SignalSourceLink } from '@/components/primitives/SignalSourceLink'
import { useTranslation } from 'react-i18next'
import { Building2, ExternalLink } from 'lucide-react'
import type { DiscoverNeedRow } from '@/features/discover/lib/discover-result-rows'
import { DeliveryFitAxesDisclosure } from '@/features/discover/view/DeliveryFitAxesDisclosure'
import { OfferRequesterLine } from '@/features/discover/view/OfferRequesterLine'

/* ------------------------------------------------------------------ */
/*  #2166.26-.33 — UN BESOIN, une ligne.                                */
/*                                                                     */
/*  Le même signal existait déjà, en pastille sous une carte de compte. */
/*  Le sortir en ligne change ce qu'on peut en faire : on lit le marché */
/*  par ordre de fraîcheur au lieu de lire des entreprises.             */
/*                                                                     */
/*  Ce que la ligne ne dit PAS est écrit dessus (#2166.33). C'est       */
/*  volontairement encombrant : l'expertise demandée, l'urgence et le   */
/*  type de contrat ne sont dans AUCUNE source structurée, et les       */
/*  deviner depuis l'intitulé d'une annonce fabriquerait un fait.       */
/* ------------------------------------------------------------------ */

function formatDate(iso: string, locale: string): string {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return parsed.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })
}

interface NeedResultRowProps {
  row: DiscoverNeedRow
  /** #2166.32 — qualifier, c'est analyser le compte porteur du signal. */
  onQualify: () => void
}

export function NeedResultRow({ row, onQualify }: NeedResultRowProps) {
  const { t, i18n } = useTranslation('discover')
  // #5010.3 (recette prod 03/11) — le SITE de publication d'une offre s'affiche (« Voir l'annonce · LinkedIn »), comme sur la
  // carte (`FactSourceLink`) ; liste blanche fermée de sites d'emploi, agrégateur ou site inconnu = libellé générique.
  const evidenceSite = row.evidenceUrl ? offerOriginLabel(row.evidenceUrl) : null
  // #3237 — la ligne s'ouvre sur le détail du delivery fit (les treize axes).
  const [open, setOpen] = useState(false)
  const axes = row.deliveryFitAxes
  const evaluatedFit = row.deliveryFit && row.deliveryFit !== 'unknown' ? row.deliveryFit : null

  return (
    <div
      className="flex flex-wrap items-start gap-x-4 gap-y-2 rounded-xl px-4 py-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            {t(`signalTypes.${row.nature}`)}
          </span>
          {axes ? (
            // #3237 — le libellé EST le geste : un bouton (clavier compris) qui ouvre les axes.
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen(current => !current)}
              className="min-h-11 text-left text-sm font-semibold leading-tight text-[color:var(--text-primary)]"
            >
              {row.label}
            </button>
          ) : (
            <span className="text-sm font-semibold leading-tight text-[color:var(--text-primary)]">{row.label}</span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-[10px] w-[10px]" aria-hidden />
            {row.company}
          </span>
          {/* #2166.29 — la date est obligatoire au contrat : aucune ligne sans elle. */}
          <span>{formatDate(row.date, i18n.language)}</span>
          {/* #2166.31 / #2165.46 — une DISTINCTION nommée, pas une échelle ;
              `null` (un AO, une immatriculation, …) n'est pas une publication
              au sens de cet axe, donc rien ne s'affiche plutôt qu'une
              étiquette « direct » que rien ne mesure. */}
          {row.evidenceLevel && (
            <span title={t(`needs.evidenceLevelHint.${row.evidenceLevel}`)}>
              {t(`needs.evidenceLevel.${row.evidenceLevel}`)}
            </span>
          )}
          {/* Lot M : pour une offre d'emploi le détail brut est le nom du site d'annonces — jamais montré. */}
          {row.detail && row.nature !== 'hiring' && <span>{row.detail}</span>}
          {/* #3238 — le site qui a publié l'offre, quand la source l'affiche et qu'il diffère du siège. */}
          {row.siteCity && <span data-testid="need-site-city">{t('needs.siteCity', { city: row.siteCity })}</span>}
          {/* #4182 — qui demande ce profil : étayé par le texte de l'offre, sinon la méthode se déplie. */}
          {row.requester && <OfferRequesterLine requester={row.requester} />}
          {/* #3237 — le niveau composé, seulement quand il est ÉVALUÉ (un
              `unknown` ne fait aucune ligne, GA-18/GA-19) ; le détail des axes
              s'ouvre d'un clic sur la ligne. */}
          {evaluatedFit && <span>{t(`rail.deliveryFit.${evaluatedFit}`)}</span>}
        </div>
        {axes && <DeliveryFitAxesDisclosure axes={axes} open={open} onOpenChange={setOpen} />}

        {/* #2613 — la ligne « Non su : … » (#2166.33) est RETIRÉE : décision de
            Louis du 20/09/2026, une absence ne fait pas une ligne dans une
            liste. `row.unknown` reste au MODÈLE (il sert aux filtres). */}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* #2166.30 — la preuve est CLIQUABLE quand la source en publie une. */}
        {/* #3922.5 — sans preuve cliquable, la ligne le DIT (décision K01 du 09/10/2026, qui
            l'emporte ici sur #2613 : un commercial doit savoir qu'il n'a pas de lien avant d'appeler). */}
        {!row.evidenceUrl && <SignalSourceLink url={null} sourceKind={null} />}
        {row.evidenceUrl && (
          <a
            href={row.evidenceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm"
            style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
          >
            <ExternalLink className="h-[13px] w-[13px]" aria-hidden />
            {evidenceSite ? t('facts.linkAnnouncementOn', { site: evidenceSite }) : t('needs.openEvidence')}
          </a>
        )}
        <button
          type="button"
          onClick={onQualify}
          className="inline-flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm"
          style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
        >
          {t('needs.qualify')}
        </button>
      </div>
    </div>
  )
}
