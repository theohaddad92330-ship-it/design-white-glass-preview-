import { memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { Loader2 } from 'lucide-react'
import {
  APPLICATION_SECTORS,
  APPLICATION_SECTOR_GROUPS,
  SITE_TYPES,
  SOLD_SENIORITY_LEVELS,
  type ApplicationSectorGroup,
  type EsnAnswers,
  type OfferPortfolioPatch,
} from '@bellum/contracts'
import { chipClassName, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useEsnProfileWorkspaceMeta } from '../hooks/useEsnProfileWorkspaceMeta'
import { useOfferPortfolio, useUpdateOfferPortfolio } from '../hooks/useOfferPortfolio'
import { useSaveEsnField } from '../hooks/useSaveEsnField'
import { OfferUnderstood } from './OfferUnderstood'

type Props = { answers: EsnAnswers }

/** Une puce à bascule. `<button type="button">` et non un `<div onClick>` :
 *  ce qui se clique se tabule (GA-35). */
function Chip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      /* ⚠️ Le repos portait `border-neutral-200`, une classe de la palette
         Tailwind : elle ne suit AUCUN thème, d'où le `dark:border-white/10`
         posé en rattrapage. La grammaire partagée répond aux deux thèmes sans
         qu'un écran ait à les connaître. */
      className={chipClassName({ active, size: 'sm' })}
    >
      {label}
    </button>
  )
}

/**
 * Le portefeuille d'offre — ce que la société vend, à quels secteurs, sur quels
 * sites, avec quel vocabulaire (addendum Stelya §5, §18).
 *
 * L'écran commence par la RESTITUTION, parce que c'est le premier critère de
 * viabilité du retour bêta : « Bellum restitue son positionnement sans ESN, ni
 * régie, ni cabinet ». Tant que rien n'est enregistré, il le DIT — afficher des
 * défauts silencieusement les ferait passer pour un choix que personne n'a fait.
 *
 * Le type de société n'est pas demandé : il se DÉRIVE des domaines déjà
 * sélectionnés à l'onboarding. Une question de plus aurait demandé au vendeur
 * ce que ses domaines viennent de dire.
 */
export const OfferPortfolioSection = memo<Props>(function OfferPortfolioSection({ answers }) {
  const { t } = useTranslation(['profile', 'common'])
  const { data: meta } = useEsnProfileWorkspaceMeta()
  const { data: portfolio, isLoading } = useOfferPortfolio()
  const update = useUpdateOfferPortfolio()
  const saveField = useSaveEsnField()
  const locked = (meta?.shared ?? false) && !(meta?.canEditCompany ?? true)
  const positioning = typeof answers.positioning === 'string' ? answers.positioning.trim() : ''

  const sectorsByGroup = useMemo(() => {
    const map = new Map<ApplicationSectorGroup, typeof APPLICATION_SECTORS>()
    for (const group of APPLICATION_SECTOR_GROUPS) {
      map.set(
        group,
        APPLICATION_SECTORS.filter(sector => sector.group === group),
      )
    }
    return map
  }, [])

  if (isLoading || !portfolio) {
    return (
      <SettingsBlock label={t('offerPortfolio.title')}>
        <div className="px-5 py-4 sm:px-6" aria-busy="true">
          <Loader2
            className="size-4 animate-spin text-[var(--bellum-text-muted)]"
            aria-label={t('offerPortfolio.loading')}
          />
        </div>
      </SettingsBlock>
    )
  }

  const patch = (next: OfferPortfolioPatch): void => {
    if (locked) return
    update.mutate(next)
  }

  return (
    <SettingsBlock label={t('offerPortfolio.title')} description={t('offerPortfolio.subtitle')}>
      <div className="space-y-4 px-5 py-4 sm:px-6">
        {/* La restitution — le premier critère de viabilité du retour bêta. */}
        <div className="rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] p-4">
          <OfferUnderstood
            companyType={portfolio.company_type}
            offerDomains={answers.offer_domains ?? []}
            positioning={positioning}
            onSavePositioning={next => saveField('positioning', next)}
            lockedReason={locked ? t('offerPortfolio.understood.lockedReason') : null}
          />
          {portfolio.source === 'legacy' && (
            <Text element="p" size="xs" className="mt-2 text-[var(--bellum-text-secondary)]">
              {t('offerPortfolio.understood.notConfigured')}
            </Text>
          )}
        </div>

        {/* Secteurs d'application — le marché où la prestation est délivrée. */}
        <div className="space-y-2">
          <Text element="p" size="xs" weight="medium">
            {t('offerPortfolio.sectors.title')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('offerPortfolio.sectors.hint')}
          </Text>
          {[...sectorsByGroup.entries()].map(([group, sectors]) => (
            <div key={group} className="space-y-1">
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t(`common:sectorGroups.${group}`, { defaultValue: group })}
              </Text>
              <div className="flex flex-wrap gap-2">
                {sectors.map(sector => {
                  const active = portfolio.target_application_sectors.includes(sector.code)
                  return (
                    <Chip
                      key={sector.code}
                      label={sector.labelFr}
                      active={active}
                      onToggle={() =>
                        patch({
                          target_application_sectors: active
                            ? portfolio.target_application_sectors.filter(code => code !== sector.code)
                            : [...portfolio.target_application_sectors, sector.code],
                        })
                      }
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Politique de site — une préférence, jamais une règle. */}
        <div className="space-y-2">
          <Text element="p" size="xs" weight="medium">
            {t('offerPortfolio.site.title')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('offerPortfolio.site.hint')}
          </Text>
          <div className="flex flex-wrap gap-2">
            {SITE_TYPES.map(type => {
              const active = portfolio.target_site.types.includes(type)
              return (
                <Chip
                  key={type}
                  label={t(`offerPortfolio.siteTypes.${type}`, { defaultValue: type })}
                  active={active}
                  onToggle={() =>
                    patch({
                      target_site: {
                        ...portfolio.target_site,
                        types: active
                          ? portfolio.target_site.types.filter(value => value !== type)
                          : [...portfolio.target_site.types, type],
                      },
                    })
                  }
                />
              )
            })}
          </div>
          <label className="flex items-center gap-2">
            <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('offerPortfolio.site.minHeadcount')}
            </Text>
            <input
              type="number"
              min={1}
              disabled={locked}
              defaultValue={portfolio.target_site.min_headcount ?? ''}
              placeholder={t('offerPortfolio.site.noThreshold')}
              onBlur={event => {
                const raw = event.target.value.trim()
                const parsed = raw === '' ? null : Number.parseInt(raw, 10)
                // Vide ⇒ `null` (aucun seuil), jamais `0` : « je ne filtre pas sur
                // la taille » et « je vise les sites de zéro personne » ne sont
                // pas la même phrase.
                const next = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null
                if (next !== portfolio.target_site.min_headcount) {
                  patch({ target_site: { ...portfolio.target_site, min_headcount: next } })
                }
              }}
              className="min-h-11 w-28 rounded-md border border-neutral-200 bg-transparent px-3 text-sm text-[var(--bellum-text-primary)] disabled:opacity-50 dark:border-white/10"
            />
          </label>
        </div>

        {/* #3238.8 — les niveaux VENDUS : croisés, dans Découvrir, avec la
          séniorité CHERCHÉE par une offre d'emploi. Non coché = non déclaré. */}
        <div className="space-y-2">
          <Text element="p" size="xs" weight="medium">
            {t('offerPortfolio.soldSeniority.title')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('offerPortfolio.soldSeniority.hint')}
          </Text>
          <div className="flex flex-wrap gap-2">
            {SOLD_SENIORITY_LEVELS.map(level => {
              const active = portfolio.sold_seniority_levels.includes(level)
              return (
                <Chip
                  key={level}
                  label={t(`offerPortfolio.soldSeniority.levels.${level}`)}
                  active={active}
                  onToggle={() =>
                    patch({
                      sold_seniority_levels: active
                        ? portfolio.sold_seniority_levels.filter(value => value !== level)
                        : [...portfolio.sold_seniority_levels, level],
                    })
                  }
                />
              )
            })}
          </div>
        </div>

        {/*
        #2076.13 — la portée de réutilisation des retours (`privacy.feedback_reuse`,
        addendum Stelya §20.1, GA-47). Fermée par défaut ; ouverte, seul le
        MOTIF d'un verdict de première preuve (cible + verdict) atteint la
        recette produit — jamais la note, jamais le compte. Recopiée sur chaque
        retour au moment où il est donné : l'ouvrir aujourd'hui ne rend pas
        public ce qui a été dit hier.
      */}
        <label className="flex min-h-11 items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-4"
            disabled={locked}
            checked={portfolio.privacy.feedback_reuse === 'generalized_only'}
            onChange={event =>
              patch({ privacy: { feedback_reuse: event.target.checked ? 'generalized_only' : 'tenant_private' } })
            }
          />
          <span className="space-y-1">
            <Text element="span" size="xs" weight="medium" className="block">
              {t('offerPortfolio.feedbackReuse.label')}
            </Text>
            <Text element="span" size="xs" className="block text-[var(--bellum-text-secondary)]">
              {t('offerPortfolio.feedbackReuse.hint')}
            </Text>
          </span>
        </label>

        {/*
        Le lexique a DÉMÉNAGÉ vers Réglages › Lexique (D17, 28/08/2026).
        Il n'est pas dupliqué ici : le même réglage montré à deux endroits sous
        la même forme diverge au premier écran qui n'écrit que l'un des deux
        (loi 4 du tome 7). L'écran dédié porte les mots interdits ET, ce que ces
        deux listes ne savaient pas faire, le nom que l'espace donne à chaque
        objet du produit — « Affaire » seul ne dit pas qu'il remplace « Projet ».
      */}
        <div className="space-y-1">
          <Text element="p" size="xs" weight="medium">
            {t('offerPortfolio.lexicon.movedTitle')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('offerPortfolio.lexicon.movedHint')}
          </Text>
          <Link
            to="/settings/lexicon"
            className="inline-flex min-h-11 items-center text-xs text-[var(--bellum-text-accent)] hover:underline"
          >
            {t('offerPortfolio.lexicon.movedLink')}
          </Link>
        </div>

        {locked && (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('offerPortfolio.locked')}
          </Text>
        )}
      </div>
    </SettingsBlock>
  )
})
