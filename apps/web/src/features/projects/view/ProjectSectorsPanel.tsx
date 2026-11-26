import { Badge, Button, FilterChips, SelectField, Text } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  APPLICATION_SECTORS,
  APPLICATION_SECTOR_GROUPS,
  OFFER_DOMAINS,
  type ApplicationSector,
  type ApplicationSectorGroup,
  type OfferDomain,
} from '@bellum/contracts'
import { Factory } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { projectsApi, projectQueryKeys } from '../api'

/** Un code inconnu (une valeur écrite avant l'ajout d'un domaine, par exemple)
 *  retombe sur « non dit » plutôt que d'être envoyé au serveur, qui le
 *  refuserait au moment le plus tardif. */
function asOfferDomain(value: string | null | undefined): OfferDomain | null {
  return OFFER_DOMAINS.includes(value as OfferDomain) ? (value as OfferDomain) : null
}

/**
 * Le secteur d'APPLICATION de la demande (addendum Stelya §4.1, doctrine C05).
 *
 * Les colonnes existaient depuis le 24/08 et l'axe `sector` du matching les
 * LISAIT déjà ; aucun écran ne pouvait les remplir. L'axe retombait donc
 * toujours sur le secteur du COMPTE — un compte industriel porte
 * « automatisation d'une ligne automobile » ET « maintenance nucléaire », et
 * leur donner le secteur du groupe rend interchangeables deux profils qui ne le
 * sont pas.
 *
 * Rien n'est PRÉ-COCHÉ depuis le compte. Un secteur hérité en silence se lirait
 * comme une saisie, et plus personne ne saurait lequel des deux il regarde :
 * c'est exactement le repli que le matching prend soin de NOMMER.
 */
export function ProjectSectorsPanel({
  opportunityId,
  sectors,
  domainCode,
}: {
  opportunityId: string
  sectors?: readonly string[]
  domainCode?: string | null
}) {
  const { t, i18n } = useTranslation(['projects', 'common'])
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>(() => [...(sectors ?? [])])
  const [domain, setDomain] = useState<OfferDomain | null>(() => asOfferDomain(domainCode))
  const [open, setOpen] = useState(false)

  const french = i18n.language.startsWith('fr')
  const label = (sector: ApplicationSector) => (french ? sector.labelFr : sector.labelEn)

  const byGroup = useMemo(() => {
    const map = new Map<ApplicationSectorGroup, ApplicationSector[]>()
    for (const group of APPLICATION_SECTOR_GROUPS) map.set(group, [])
    for (const sector of APPLICATION_SECTORS) map.get(sector.group)?.push(sector)
    return [...map.entries()].filter(([, list]) => list.length > 0)
  }, [])

  const save = useMutation({
    mutationFn: () => projectsApi.updateSectors(opportunityId, selected, domain),
    onSuccess: () => {
      toast.success(t('sectors.saved'))
      void qc.invalidateQueries({ queryKey: projectQueryKeys.all })
    },
    onError: () => toast.error(t('sectors.error')),
  })

  const toggle = (code: string) =>
    setSelected(prev => (prev.includes(code) ? prev.filter(value => value !== code) : [...prev, code]))

  return (
    <div className="mt-3 rounded-lg border border-[var(--bellum-border)] p-3">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2"
      >
        <span className="flex items-center gap-2">
          <Factory className="size-4 text-[var(--bellum-text-accent)]" />
          <Text size="sm" weight="medium">
            {t('sectors.title')}
          </Text>
        </span>
        {/* Aucun secteur n'est PAS « 0 secteur » : c'est une demande dont on n'a
            pas dit le terrain, et le matching le sait. */}
        {selected.length > 0 ? (
          <Badge variant="outline">{t('sectors.count', { count: selected.length })}</Badge>
        ) : (
          <UnknownValue reason={t('sectors.none')} />
        )}
      </button>

      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('sectors.hint')}
          </Text>

          {byGroup.map(([group, list]) => (
            <div key={group} className="space-y-1">
              <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                {t(`common:sectorGroups.${group}`, { defaultValue: group })}
              </Text>
              {/* Les secteurs se combinent : `multiple`. Ils étaient écrits à la
                  main en pastille `accent-soft`, une sixième forme pour un même
                  geste. */}
              <FilterChips
                multiple
                size="sm"
                ariaLabel={t(`common:sectorGroups.${group}`, { defaultValue: group })}
                options={list.map(sector => ({ value: sector.code, label: label(sector) }))}
                values={selected}
                onToggle={toggle}
              />
            </div>
          ))}

          <div className="grid gap-1">
            <Text element="label" size="xs" weight="medium" htmlFor={`domain-${opportunityId}`}>
              {t('sectors.domain')}
            </Text>
            {/* « Non dit » est une valeur, pas un marque-place : une famille de
                prestation devinée depuis ce que l'ESN vend décrirait l'offre et
                non l'achat. */}
            <SelectField
              id={`domain-${opportunityId}`}
              value={domain ?? ''}
              onChange={next => setDomain(asOfferDomain(next))}
              emptyOption={{ label: t('sectors.domainUnknown') }}
              options={OFFER_DOMAINS.map(code => ({
                value: code,
                label: t(`sectors.domains.${code}`, { defaultValue: code }),
              }))}
            />
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
              {t('sectors.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
