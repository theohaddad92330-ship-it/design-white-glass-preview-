import { Badge, Box, Button, Input, Text } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlocks'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useDecideSkillAlias, useSharedAliasSuggestions, useSkillAliasQueue } from '../api'

/**
 * La file d'enrichissement du catalogue de compétences (PDF 3 §5.3).
 *
 * Ce que cet écran rend visible et qui ne l'était pas : **les mots que le
 * produit ne comprend pas**. Jusqu'ici un terme hors référentiel était
 * silencieusement ignoré — donc les profils qui l'avaient écrit ne remontaient
 * sur aucune recherche, et personne ne pouvait s'en apercevoir.
 *
 * Rien ne s'applique tant que quelqu'un n'a pas tranché : la fréquence ORDONNE
 * la file, elle ne décide pas. Un alias appliqué seul rapprocherait deux
 * compétences que personne n'a validées.
 */
export function SkillAliasQueue() {
  const { t } = useTranslation('catalogues')
  const { data: items, isLoading } = useSkillAliasQueue()
  const decide = useDecideSkillAlias()
  const [targets, setTargets] = useState<Record<string, string>>({})

  if (isLoading) return null

  return (
    <SettingsBlock title={t('aliases.title')} description={t('aliases.intro')} testId="skill-alias-block">
      {(items ?? []).length === 0 ? (
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('aliases.empty')}
        </Text>
      ) : (
        <ul className="flex flex-col">
          {(items ?? []).map(item => (
            <li
              key={item.id}
              className="flex flex-col gap-2 border-b border-[var(--bellum-border)] py-3 first:pt-0 last:border-b-0 last:pb-0 md:flex-row md:flex-wrap md:items-center"
            >
              <Box display="flex" className="min-w-0 flex-1 items-center gap-2">
                <Text size="sm" weight="semibold">
                  {item.rawTerm}
                </Text>
                {/* La fréquence ordonne la file : un mot vu quinze fois mérite
                  d'être tranché avant un mot vu une fois. */}
                <Badge variant="warning">{t('aliases.occurrences', { count: item.occurrences })}</Badge>
              </Box>
              <Input
                value={targets[item.id] ?? item.canonicalTerm ?? ''}
                aria-label={t('aliases.target', { term: item.rawTerm })}
                placeholder={t('aliases.targetPlaceholder')}
                className="min-h-11 w-full md:w-56"
                onChange={event => setTargets(previous => ({ ...previous, [item.id]: event.target.value }))}
              />
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 gap-1"
                disabled={decide.isPending || !(targets[item.id] ?? item.canonicalTerm)}
                onClick={() =>
                  decide
                    .mutateAsync({
                      id: item.id,
                      decision: 'approved',
                      canonicalTerm: targets[item.id] ?? item.canonicalTerm ?? undefined,
                    })
                    .then(() => toast.success(t('aliases.approved')))
                    .catch((error: Error) => toast.error(error.message || t('aliases.failed')))
                }
              >
                <Check aria-hidden className="size-4" />
                {t('aliases.approve')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-11 gap-1"
                disabled={decide.isPending}
                onClick={() =>
                  decide
                    .mutateAsync({ id: item.id, decision: 'rejected' })
                    .then(() => toast.success(t('aliases.rejected')))
                    .catch((error: Error) => toast.error(error.message || t('aliases.failed')))
                }
              >
                <X aria-hidden className="size-4" />
                {t('aliases.reject')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <SharedAliasSuggestions />
    </SettingsBlock>
  )
}

/**
 * Ce que d'AUTRES ESN ont validé, et que ton espace n'a pas tranché.
 *
 * Une SUGGESTION, jamais un alias appliqué : le vocabulaire d'une ESN cyber
 * n'est pas celui d'une ESN data — « ELK » ne veut pas dire la même chose chez
 * l'une et chez l'autre. Le nombre d'espaces qui l'ont validé n'est pas une
 * statistique, c'est l'argument qu'on montre à celui qui décide.
 *
 * Rien à suggérer = rien à afficher : un bloc vide en permanence apprend à
 * ignorer la zone.
 */
function SharedAliasSuggestions() {
  const { t } = useTranslation('catalogues')
  const { data: suggestions } = useSharedAliasSuggestions()
  if ((suggestions ?? []).length === 0) return null

  return (
    <div className="mt-4 border-t border-[var(--bellum-border)] pt-3">
      <Text element="h3" size="sm" weight="semibold">
        {t('aliases.sharedTitle')}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
        {t('aliases.sharedIntro')}
      </Text>
      <ul className="mt-2 flex flex-wrap gap-2">
        {(suggestions ?? []).map(suggestion => (
          <li key={suggestion.rawTerm}>
            <Badge variant="outline">
              {suggestion.rawTerm} → {suggestion.canonicalTerm} ·{' '}
              {t('aliases.sharedCount', { count: suggestion.workspacesApproved })}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}
