import { Badge, Button, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { tjmObservedFreshness, type Consultant } from '@bellum/contracts'
import { useTalentRateHistory } from '../../hooks'
import { talentNameText } from '../../lib/talentName'
import { TalentMarginCard } from './TalentMarginCard'

const RATE_LABELS: Record<string, string> = {
  tjm: 'form.tjm',
  min_tjm_cents: 'form.minTjm',
  cost_rate_cents: 'form.costRate',
  purchase_tjm_cents: 'form.purchaseTjm',
}

/**
 * L'onglet « Disponibilité & TJM » (PDF 3 §7, onglet 5 ; §8.1).
 *
 * Deux règles portent tout :
 *
 *  - **un montant absent le dit**, il ne vaut pas zéro. « Coût non renseigné »
 *    et « coût nul » mènent à deux décisions commerciales opposées ;
 *  - **l'historique vient du journal d'écriture**, pas d'une table dédiée. Le
 *    journal enregistre déjà chaque changement avec son auteur et sa date ; une
 *    seconde source finirait par diverger, et il faudrait choisir laquelle
 *    croire.
 */
export function TalentRatesTab({
  talent,
  onPrepareRevalidation,
}: {
  talent: Consultant
  /**
   * #2948 (#2329.53) — « Laura peut préparer : message… Rien n'est envoyé
   * sans validation. » Optionnel : un rendu isolé (test, aperçu) reste
   * valide sans le geste de revalidation.
   */
  onPrepareRevalidation?: (body: string) => void
}) {
  const { t } = useTranslation('consultants')
  const { data: history, isError } = useTalentRateHistory(talent.id)

  const euros = (cents: number | null | undefined): string | null =>
    cents == null ? null : `${Math.round(cents / 100)} €`

  // #2948 (#2329.42/.44) — un TJM d'une ANCIENNE mission est un contexte
  // historique, jamais la condition actuelle : voir `tjmObservedFreshness`.
  const freshness = talent.finance_visible ? tjmObservedFreshness(talent.tjm_metadata?.observed_at, new Date()) : null

  return (
    <div className="flex flex-col gap-3">
      <Card className="p-4">
        <dl className="grid gap-2 sm:grid-cols-2">
          <Rate label={t('form.tjm')} value={talent.tjm != null ? `${talent.tjm} €` : null} />
          {talent.finance_visible ? (
            <>
              <Rate label={t('form.minTjm')} value={euros(talent.min_tjm_cents)} />
              {talent.engagement_kind === 'salarie' ? (
                <Rate label={t('form.costRate')} value={euros(talent.cost_rate_cents)} />
              ) : (
                <Rate label={t('form.purchaseTjm')} value={euros(talent.purchase_tjm_cents)} />
              )}
            </>
          ) : (
            <Text size="sm" className="text-[var(--bellum-text-muted)]">
              {t('detail.financeHidden')}
            </Text>
          )}
        </dl>
      </Card>

      {/* #2948 (#2329.12-.16, #2329.42/.44) — CE QUE PORTE LE TJM au-delà du
          montant : `tjm_metadata` était calculé, testé et seedé (`ee93d99a`,
          `4156cf6959`) mais AUCUN écran ne le relisait — mesuré avant ce lot.
          Sous `finance:read` comme le reste du TJM. */}
      {talent.finance_visible ? (
        <Card className="p-4">
          <Text size="sm" weight="semibold">
            {t('detail.tjmMetadata.title')}
          </Text>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            <Rate label={t('detail.tjmMetadata.currency')} value={talent.tjm_metadata?.currency ?? null} />
            <Rate label={t('detail.tjmMetadata.source')} value={talent.tjm_metadata?.source ?? null} />
            <Rate label={t('detail.tjmMetadata.context')} value={talent.tjm_metadata?.context ?? null} />
            <Rate
              label={t('detail.tjmMetadata.observedAt')}
              value={formatDate(talent.tjm_metadata?.observed_at, { dateStyle: 'medium' })}
            />
            <Rate
              label={t('detail.tjmMetadata.confidential')}
              value={
                talent.tjm_metadata == null
                  ? null
                  : talent.tjm_metadata.confidential
                    ? t('detail.tjmMetadata.confidentialYes')
                    : t('detail.tjmMetadata.confidentialNo')
              }
            />
          </dl>
          {/* #2329.44 — seule la valeur HISTORIQUE mérite un drapeau : un TJM
              récent ou non daté n'a rien à signaler. */}
          {freshness === 'historical' ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="warning">{t('detail.tjmMetadata.historicalBadge')}</Badge>
              {/* #2948 (#2329.53) — Laura PRÉPARE un brouillon de revalidation,
                  elle ne l'envoie jamais : la personne le relit avant d'agir. */}
              {onPrepareRevalidation ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onPrepareRevalidation(
                      t('detail.tjmMetadata.revalidationDraft', {
                        name: talentNameText(talent.full_name, t('detail.notProvided')),
                      }),
                    )
                  }
                >
                  {t('detail.tjmMetadata.prepareRevalidation')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* §4.2 — « historique de missions, CA généré, marge moyenne » sur la
          fiche d'un consultant. Ici et pas ailleurs : c'est l'onglet où le TJM
          et le coût chargé se lisent déjà, donc l'endroit où la marge se lit
          sans avoir à croiser deux écrans. */}
      <TalentMarginCard talentId={talent.id} />

      <Card className="p-4">
        <Text size="sm" weight="semibold">
          {t('detail.rateHistory')}
        </Text>
        {isError ? (
          // Un 403 DIT « pas ton périmètre ». Une liste vide se lirait « aucun
          // changement », ce qui est une tout autre information.
          <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('detail.financeHidden')}
          </Text>
        ) : (history ?? []).length === 0 ? (
          <Text size="sm" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('detail.empty.rateHistory')}
          </Text>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {(history ?? []).map((change, index) => (
              <li key={`${change.field}-${change.changedAt}-${index}`} className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t(RATE_LABELS[change.field] ?? 'form.tjm')}</Badge>
                <Text size="sm">
                  {change.oldValue ?? t('detail.notProvided')} → {change.newValue ?? t('detail.notProvided')}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {formatDate(change.changedAt, { dateStyle: 'medium' })}
                </Text>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Rate({ label, value }: { label: string; value: string | null }) {
  const { t } = useTranslation('consultants')
  return (
    <div className="flex flex-col">
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {label}
      </Text>
      <Text size="sm">{value ?? t('detail.notProvided')}</Text>
    </div>
  )
}
