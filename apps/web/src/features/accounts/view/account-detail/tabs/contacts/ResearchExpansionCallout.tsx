import { CONTACT_EXPANSION_UNAVAILABLE_LEVERS, type ContactScope } from '@bellum/contracts'
import { Button, Card, FilterChips, Input, Text } from '@bellum/ui'
import { motion } from 'framer-motion'
import { ArrowRight, Globe2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useEnrichContacts } from '@/features/accounts/hooks/useEnrichAccount'
import { EnrichConfirmDialog } from '@/features/contacts/components/EnrichConfirmDialog'
import { cardFade } from '../../motion'
import { ORG_LEVEL_ORDER } from './contactGrouping'

/**
 * P0-03 (Théo restitution) — « largeur puis qualification ». Instead of a single
 * wide pass, the rep can extend the contact search along ONE angle: a specific
 * entity/BU, or a persona/technology theme (« Data », « Achats », « DSI
 * France »). The server merges the new hits into the existing stock (no full
 * re-run, dedupe by name), so an angle never throws away what was already found.
 */
export function ResearchExpansionCallout({
  companyName,
  contactsCount,
  excludedCount,
  entities,
  enrichBatchMutation,
}: {
  companyName: string
  /** CEDRIC-FIX C.2b — les contacts RETENUS (ni écartés ni masqués) : le même nombre que la liste. */
  contactsCount: number
  /** Les contacts écartés (homonymes, hors périmètre), comptés À PART ; absent = non mesuré. */
  excludedCount?: number
  /** Entities detected on this account — offered as one-click angle chips. */
  entities: string[]
  enrichBatchMutation: ReturnType<typeof useEnrichContacts>
}) {
  const { t } = useTranslation('accountOrg')
  const [entity, setEntity] = useState<string | null>(null)
  const [theme, setTheme] = useState('')
  // #2552.2 — « élargir par direction, par site, par niveau » (François, call
  // bêta 17/09). Le contrat (`ContactScope.level`) et l'API portaient déjà cet
  // axe (S6, #2120) ; seul CE geste manquait à l'écran — même famille de
  // défaut que le reste du dépôt : du code juste, calculé, testé, que
  // personne n'appelait.
  const [level, setLevel] = useState<(typeof ORG_LEVEL_ORDER)[number] | null>(null)
  // #2309.30 — « périmètre géographique » : même famille de geste que l'angle
  // de niveau ci-dessus, sur un axe que le contrat (`ContactScope.geographies`)
  // et l'API (Apollo `person_locations`) portaient déjà sans écran pour
  // l'actionner. Deux valeurs seulement — celles que le repli par thème
  // reconnaît lui aussi (`contact_themes.py:_GEO_TOKENS`) — jamais un
  // troisième nom qu'aucun service ne saurait interpréter.
  const GEOGRAPHIES = ['France', 'Europe'] as const
  const [geography, setGeography] = useState<(typeof GEOGRAPHIES)[number] | null>(null)

  const scope = useMemo<ContactScope>(() => {
    const next: ContactScope = {}
    if (entity) next.entity = entity
    if (theme.trim()) next.theme = theme.trim()
    if (level) next.level = level
    if (geography) next.geographies = [geography]
    return next
  }, [entity, theme, level, geography])

  const hasAngle = Boolean(entity) || theme.trim().length > 0 || Boolean(level) || Boolean(geography)
  const disabled = enrichBatchMutation.isPending
  const entityChips = entities.filter(Boolean).slice(0, 8)

  // #2120.52-57 — même recherche gratuite que les deux autres points d'entrée
  // (TabContacts, ContactsEmptyState) ; elle partait sans confirmation malgré
  // sa durée (« quelques secondes à une minute »).
  const [searchArmed, setSearchArmed] = useState(false)
  const run = () => enrichBatchMutation.mutate(hasAngle ? scope : undefined)

  return (
    <motion.div variants={cardFade}>
      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-[var(--bellum-primary-50)] text-[var(--bellum-primary-600)] dark:bg-[color-mix(in_srgb,var(--bellum-primary-500)_12%,transparent)] dark:text-[var(--bellum-primary-300)]">
              <Globe2 className="size-5" />
            </span>
            <div>
              <Text size="base" weight="semibold">
                {t('expansion.title')}
              </Text>
              <Text size="sm" className="mt-1 max-w-2xl text-[var(--bellum-text-secondary)]">
                {t('expansion.description', { count: contactsCount, company: companyName })}
              </Text>
              {excludedCount && excludedCount > 0 ? (
                <Text size="sm" className="mt-1 max-w-2xl text-[var(--bellum-text-muted)]">
                  {t('expansion.excludedNote', { count: excludedCount })}
                </Text>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="default"
            onClick={() => setSearchArmed(true)}
            disabled={disabled}
            className="shrink-0 gap-2"
            icon={ArrowRight}
            iconPosition="right"
            isLoading={disabled}
          >
            {disabled ? t('expansion.searching') : hasAngle ? t('expansion.ctaAngle') : t('expansion.cta')}
          </Button>
        </div>

        <div className="border-t border-[var(--bellum-border)] pt-3">
          <Text size="xs" weight="medium" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
            {t('expansion.angleLabel')}
          </Text>
          {entityChips.length > 0 ? (
            <FilterChips
              className="mt-2"
              size="sm"
              ariaLabel={t('expansion.entityAngleAria')}
              options={entityChips.map(e => ({ value: e, label: e }))}
              value={entity}
              clearable
              onChange={setEntity}
            />
          ) : null}
          {/* #2552.2 — « par niveau » : même geste que les chips d'entité,
              même vocabulaire que le filtre « Niveau » de la liste
              (`orgMap.levels.*`) — pas une deuxième taxonomie sur le même
              écran. */}
          <FilterChips
            className="mt-2"
            size="sm"
            ariaLabel={t('expansion.levelAngleAria')}
            options={ORG_LEVEL_ORDER.map(orgLevel => ({ value: orgLevel, label: t(`orgMap.levels.${orgLevel}`) }))}
            value={level}
            clearable
            onChange={setLevel}
          />
          {/* #2309.30 — « par périmètre géographique », même geste que l'entité et
              le niveau ci-dessus. */}
          <FilterChips
            className="mt-2"
            size="sm"
            ariaLabel={t('expansion.geographyAngleAria')}
            options={GEOGRAPHIES.map(geo => ({ value: geo, label: t(`expansion.geographies.${geo}`) }))}
            value={geography}
            clearable
            onChange={setGeography}
          />
          <Input
            value={theme}
            onChange={ev => setTheme(ev.target.value)}
            disabled={disabled}
            placeholder={t('expansion.themePlaceholder')}
            className="mt-2 h-9 max-w-md"
            onKeyDown={ev => {
              if (ev.key === 'Enter' && hasAngle && !disabled) setSearchArmed(true)
            }}
          />
          {/* #2934 (#2309.24/.26/.28) — les leviers que l'épopée nomme mais
              qu'aucun axe dédié ne cible encore (famille de rôles voisine,
              site, opérationnels) : nommés en permanence, jamais un silence
              qui laisserait croire qu'ils n'existent pas — même patron que
              `themeNoPreset` au-dessus. */}
          <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
            {t('expansion.leversUnavailable.note', {
              levers: CONTACT_EXPANSION_UNAVAILABLE_LEVERS.map(lever =>
                t(`expansion.leversUnavailable.levers.${lever}`),
              ).join(', '),
            })}
          </Text>
          {/* #2532.2 bis — le RÉSULTAT d'une recherche CIBLÉE PAR THÈME se dit,
              à l'endroit du geste : « N trouvées pour ce thème » avec leurs
              noms, ou « aucune trouvée » avec les synonymes essayés — jamais
              seulement le compteur global de contacts qui bouge en silence
              (retour BOUYGUES CONSTRUCTION, 19/09/2026). */}
          {enrichBatchMutation.data?.themeSearch ? (
            <div className="mt-2" data-testid="theme-search-result">
              {enrichBatchMutation.data.themeSearch.matchedCount > 0 ? (
                <Text size="sm">
                  {t('expansion.themeResultFound', {
                    count: enrichBatchMutation.data.themeSearch.matchedCount,
                    theme: enrichBatchMutation.data.themeSearch.theme,
                  })}
                  {enrichBatchMutation.data.themeSearch.matchedNames.length > 0
                    ? ` : ${enrichBatchMutation.data.themeSearch.matchedNames.join(', ')}`
                    : ''}
                </Text>
              ) : (
                <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('expansion.themeResultEmpty', {
                    theme: enrichBatchMutation.data.themeSearch.theme,
                    titles: enrichBatchMutation.data.themeSearch.titles.join(', '),
                  })}
                </Text>
              )}
              {enrichBatchMutation.data.themeSearch.outOfThemeCount > 0 ? (
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
                  {t('expansion.themeResultOutOfTheme', {
                    count: enrichBatchMutation.data.themeSearch.outOfThemeCount,
                  })}
                </Text>
              ) : null}
              {/* #2532.2 (21/09/2026) — un thème SANS preset connu (aucune des
                  10 familles) est retombé sur le mot-clé brut + sa variante de
                  genre : l'écran NOMME cette limite, jamais un silence qui
                  laisserait croire à une expansion sectorielle qui n'a pas eu
                  lieu (« non mesuré n'est jamais 0 », doctrine CLAUDE.md). */}
              {!enrichBatchMutation.data.themeSearch.presetMatched ? (
                <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]" data-testid="theme-no-preset">
                  {t('expansion.themeNoPreset')}
                </Text>
              ) : null}
            </div>
          ) : null}
        </div>
      </Card>

      <EnrichConfirmDialog open={searchArmed} onOpenChange={setSearchArmed} free onConfirm={run} />
    </motion.div>
  )
}
