import { Badge, Card, Text } from '@bellum/ui'
import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useOrgCorrectionHistory } from '@/features/accounts/view/account-detail/tabs/organigramme/corrections/useOrgCorrections'
import { contactCorrectionsFor } from '@/features/contacts/lib/contactCorrections'

/**
 * #2150.60 — « la fiche Contact conserve les corrections. »
 *
 * `useOrgCorrectionHistory` est le MÊME hook que l'onglet Organigramme du
 * compte (GA-26 : une seule fonction d'entrée) — aucune route neuve. Ce
 * composant se contente de filtrer sur CE contact
 * (`contactCorrectionsFor`) et de le dire dans un vocabulaire propre à la
 * fiche.
 *
 * ⚠️ Pas de bouton « Annuler » ici : ce geste porte le verrou optimiste de
 * version du GRAPHE (`expectedGraphVersion`), que la fiche d'un contact ne
 * charge pas — il reste sur l'Organigramme, qui le porte déjà.
 *
 * ⚠️ Un échec de lecture le DIT — jamais une liste vide (même faute que
 * `OrgCorrectionsHistory`, verifiée en prod le 17/08 sur les notes).
 */
export function ContactCorrectionsHistory({ accountId, contactId }: { accountId: string; contactId: string }) {
  const { t, i18n } = useTranslation('contacts')
  const history = useOrgCorrectionHistory(accountId)
  const entries = history.data ? contactCorrectionsFor(history.data, contactId) : undefined

  return (
    <Card className="overflow-hidden p-0 [--card-spacing:0px]" data-testid="contact-corrections-history">
      <div className="border-b border-[var(--bellum-border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
          <Text element="h3" size="base" weight="semibold">
            {t('corrections.title')}
          </Text>
        </div>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('corrections.subtitle')}
        </Text>
      </div>

      <div className="px-5 py-4">
        {history.isLoading ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('corrections.loading')}
          </Text>
        ) : null}

        {history.isError ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="contact-corrections-error">
            {t('corrections.loadError')}
          </Text>
        ) : null}

        {entries && entries.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('corrections.empty')}
          </Text>
        ) : null}

        {entries && entries.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {entries.map(entryItem => (
              <li key={entryItem.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <Text element="p" size="sm">
                    {t('corrections.change', {
                      field: t(`accountOrg:correction.fields.${entryItem.field}`),
                      from: describeValue(entryItem.oldValue, t),
                      to: describeValue(entryItem.newValue, t),
                    })}
                  </Text>
                  {entryItem.revertedAt ? <Badge variant="outline">{t('corrections.reverted')}</Badge> : null}
                </div>
                <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]" title={entryItem.reason}>
                  {entryItem.reason}
                </Text>
                <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('corrections.meta', {
                    source: t(`accountOrg:orgGraph.sourceKinds.${entryItem.evidence.kind}`),
                    when: new Date(entryItem.createdAt).toLocaleDateString(i18n.language),
                  })}
                </Text>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </Card>
  )
}

/** `null`/`[]` = non renseigné, JAMAIS « 0 » (GA-19) — même règle que
 *  `describeCorrectionValue`, réduite : cette fiche ne porte pas le graphe
 *  entier, donc pas de nom de personne à substituer à un id de lien. */
function describeValue(value: unknown, t: (key: string) => string): string {
  if (value === null || value === undefined) return t('accountOrg:correction.currentUnknown')
  if (Array.isArray(value)) return value.length === 0 ? t('accountOrg:correction.currentUnknown') : value.join(', ')
  return String(value)
}
