import { Box, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ScreenState } from '@/components/primitives/ScreenState'
import { privacyApi } from '../lib/privacy-api'

const WEBSITE_URL: string = import.meta.env.VITE_MARKETING_URL || 'https://bellum-ai.com'

/**
 * #4295.15 — « Confidentialité & registre » : `/privacy` rendait « Page introuvable » en recette de production.
 *
 * Rien n'est écrit ici à la main : le registre des durées de conservation est lu sur `GET /privacy/retention`
 * (la même table que la purge applique — `PrivacyRetentionService`, servie depuis longtemps et lue par personne), la
 * politique est celle que publie le site, et les droits (accès, export, effacement) renvoient à Données & exports.
 * Une catégorie sans durée ne reçoit pas de durée inventée ; un registre vide se dit vide.
 */
/**
 * `embedded` — Théo D settings-compte.A4 : la politique et le registre vivent
 * aussi en bas de Mes données (exigence RGPD, pas un réglage). Sans titre de
 * page ni lien « Données & exports » (on y est déjà) ; la route `/privacy`
 * garde la page entière.
 */
export function PrivacyView({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation('myData')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['privacy', 'retention'],
    queryFn: () => privacyApi.retention(),
    staleTime: 60_000,
  })
  const rules = data?.rules ?? []

  return (
    <Box className="w-full max-w-5xl space-y-5">
      {!embedded && (
        <Box>
          <Text element="h1" size="3xl" weight="semibold" className="tracking-tight text-[var(--bellum-text-primary)]">
            {t('privacyPage.title')}
          </Text>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-2">
            {t('privacyPage.subtitle')}
          </Text>
        </Box>
      )}

      {/* Théo D settings-compte (Mes données) : embarquée, la page suit la maquette — le registre d'abord, puis
          « Tes droits », qui porte le lien vers la politique publiée. */}
      {!embedded && (
        <section
          className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6"
          aria-labelledby="privacy-policy"
        >
          <Text element="h2" id="privacy-policy" size="base" weight="semibold">
            {t('privacyPage.policy.title')}
          </Text>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('privacyPage.policy.body')}
          </Text>
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <a href={`${WEBSITE_URL}/privacy`} target="_blank" rel="noreferrer">
              {t('privacyPage.policy.open')}
            </a>
          </Button>
        </section>
      )}

      <section
        className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6"
        aria-labelledby="privacy-register"
      >
        <Text element="h2" id="privacy-register" size="base" weight="semibold">
          {t('privacyPage.register.title')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('privacyPage.register.body')}
        </Text>
        {isLoading ? <ScreenState state="loading" message={t('privacyPage.register.loading')} /> : null}
        {isError ? (
          <ScreenState
            state="error"
            message={t('privacyPage.register.error')}
            action={{ label: t('privacyPage.register.retry'), onClick: () => void refetch() }}
          />
        ) : null}
        {data && rules.length === 0 ? (
          <Text element="p" size="sm" color="text-[var(--bellum-text-muted)]">
            {t('privacyPage.register.empty')}
          </Text>
        ) : null}
        {rules.length > 0 ? (
          <Box className="min-w-0 overflow-x-auto rounded-control border border-[var(--bellum-border)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('privacyPage.register.category')}</TableHead>
                  <TableHead className="whitespace-nowrap">{t('privacyPage.register.duration')}</TableHead>
                  <TableHead>{t('privacyPage.register.why')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map(rule => (
                  <TableRow key={rule.key}>
                    <TableCell>{rule.label}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {rule.days === null
                        ? t('privacyPage.register.lifetime')
                        : t('privacyPage.register.days', { count: rule.days })}
                    </TableCell>
                    <TableCell>{rule.rationale}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        ) : null}
        {data ? (
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            {data.sweepEnabled ? t('privacyPage.register.sweepOn') : t('privacyPage.register.sweepOff')}
          </Text>
        ) : null}
      </section>

      <section
        className="space-y-3 rounded-card border border-[var(--bellum-border)] bg-card p-6"
        aria-labelledby="privacy-rights"
      >
        <Text element="h2" id="privacy-rights" size="base" weight="semibold">
          {t('privacyPage.rights.title')}
        </Text>
        <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
          {t('privacyPage.rights.body')}
        </Text>
        {embedded ? (
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <a href={`${WEBSITE_URL}/privacy`} target="_blank" rel="noreferrer">
              {t('privacyPage.policy.open')}
            </a>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
            <Link to="/settings/mes-donnees">{t('privacyPage.rights.open')}</Link>
          </Button>
        )}
      </section>
    </Box>
  )
}
