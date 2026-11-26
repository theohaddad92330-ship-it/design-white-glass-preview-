import type { AccountPartner } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/** #5107.2 — les initiales du monogramme : une lettre par mot, deux au plus. */
function initialsOf(name: string): string {
  const letters = name
    .split(/[\s\-–—/&.]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toLocaleUpperCase())
  return letters.slice(0, 2).join('') || '?'
}

/**
 * #5107.2 — la preuve d'une société, en une phrase : les origines de preuve que le serveur a DÉJÀ posées
 * (`evidence_origins`, #1605), nommées avec les mêmes libellés que la liste détaillée, suivies du nombre de parcours
 * observés quand le corpus en a. Rien n'est recalculé ; aucune origine ⇒ `null` ⇒ pas de carte (#5107.4).
 */
function proofSentence(
  partner: AccountPartner,
  tPartners: (key: string, options?: Record<string, string | number>) => string,
): string | null {
  const origins = partner.evidence_origins ?? []
  if (origins.length === 0) return null
  const parts = origins.map(origin => tPartners(`evidence.${origin}`))
  if (typeof partner.market_observation_count === 'number') {
    parts.push(tPartners('observed.persons', { count: partner.market_observation_count }))
  }
  return parts.join(' · ')
}

/**
 * #5107 — « Écosystème », forme maquette V22 : une carte par société de services reliée au compte ET portant une
 * preuve. Une société sans preuve ne fait pas de carte (elle reste dans la lecture détaillée) ; sans carte du tout :
 * un état vide, jamais une carte inventée. Aucun fournisseur nommé, aucune probabilité.
 */
export function EcosystemGrid({
  partners,
  firstName = '',
  onOpenDetail,
}: {
  partners: readonly AccountPartner[]
  firstName?: string
  /** Le rang de la société dans `partners` (la liste COURANTE de `TabPartners`) : c'est ce que la modale attend. */
  onOpenDetail: (index: number) => void
}) {
  const { t } = useTranslation('accounts', { keyPrefix: 'ecosystemGrid' })
  const { t: tPartners } = useTranslation('partners')
  const cards = partners.flatMap((partner, index) => {
    const proof = proofSentence(partner, tPartners)
    return proof ? [{ partner, index, proof }] : []
  })

  return (
    <section data-testid="ecosystem-grid" className="flex min-w-0 flex-col gap-5">
      <header className="min-w-0">
        <Text element="h2" size="lg" weight="semibold">
          {t('title')}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {firstName ? t('lead', { firstName }) : t('leadWithoutName')}
        </Text>
      </header>

      {cards.length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('empty')}
        </Text>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 min-[1100px]:grid-cols-3">
          {cards.map(({ partner, index, proof }) => (
            <article
              key={partner.id}
              data-testid={`ecosystem-card-${partner.id}`}
              className="flex min-w-0 flex-col gap-3 rounded-card border border-[var(--bellum-border)] bg-card p-5"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-xs font-semibold text-[var(--bellum-text-accent)]"
                >
                  {initialsOf(partner.name)}
                </span>
                <div className="min-w-0">
                  <Text element="h3" size="sm" weight="semibold">
                    {partner.name}
                  </Text>
                  <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
                    {partner.scope?.trim() || t('scopeUnknown')}
                  </Text>
                </div>
              </div>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {proof}
              </Text>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--bellum-border)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
                  {t('pill')}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="ml-auto min-h-11"
                  aria-label={t('detailAria', { name: partner.name })}
                  onClick={() => onOpenDetail(index)}
                >
                  {t('detail')}
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
