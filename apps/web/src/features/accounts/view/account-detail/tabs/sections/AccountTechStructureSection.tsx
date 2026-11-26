import { Card, Text } from '@bellum/ui'
import { Layers } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { AccountTechStructure, TechProof } from '@/features/accounts/api'
import { useAccountTechStructure } from '@/features/accounts/hooks/useAccountTechStructure'
import { formatDate } from '@/lib/locale'

/**
 * #4742 — LA STRUCTURE TECHNIQUE, DANS LE DOSSIER (arbitrage Louis 28/10/2026).
 *
 * `GET /accounts/:id/tech-structure` rangeait déjà CRM, ERP, données,
 * hébergement et outils métier, chaque technologie avec sa preuve — et aucun
 * écran ne l'appelait. Cette section est l'APPELANT : montée dans la synthèse,
 * lue à l'ouverture, sans bouton « charger ».
 *
 * Deux moitiés de doctrine cohabitent ici (voir
 * `architecture/une-absence-ne-fait-pas-une-ligne.test.ts`) :
 *  · dans la LISTE des technologies, une absence ne fait AUCUNE ligne — pas de
 *    ligne vide par axe sans preuve ;
 *  · sous un rendu STRUCTURÉ, l'axe non observé reste NOMMÉ, en une seule ligne
 *    (`not_observed_axes`) — jamais « 0 », jamais masqué. La structure se
 *    présente comme PARTIELLE ; aucun pourcentage de complétude (GA-259).
 *
 * Une panne se DIT : jamais une technologie inventée, jamais un « non observé »
 * deviné quand on n'a pas pu lire.
 *
 * Aucune source n'est nommée par son fournisseur : `kind` est une NATURE
 * (offre d'emploi, analyse), et le lien s'intitule par l'offre.
 */
export function AccountTechStructureSection({ accountId }: { accountId: string }) {
  const { t } = useTranslation('accounts')
  const { data, isPending, isError } = useAccountTechStructure(accountId)

  return (
    <Card className="p-4" data-testid="tech-structure-section">
      <div className="flex items-center gap-2">
        <Layers className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
        <Text element="h3" size="sm" weight="semibold">
          {t('techStructure.title')}
        </Text>
      </div>
      {isError ? (
        <Text size="xs" role="alert" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('techStructure.unavailable')}
        </Text>
      ) : isPending || !data ? (
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('techStructure.loading')}
        </Text>
      ) : (
        <TechStructureBody structure={data} />
      )}
    </Card>
  )
}

function TechStructureBody({ structure }: { structure: AccountTechStructure }) {
  const { t } = useTranslation('accounts')
  const observed = structure.axes.filter(axis => axis.status === 'observed' && axis.technologies.length > 0)

  return (
    <>
      {observed.length === 0 ? (
        <Text size="xs" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('techStructure.empty')}
        </Text>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {observed.map(axis => (
            <section
              key={axis.axis}
              data-testid={`tech-axis-${axis.axis}`}
              aria-label={t(`techStructure.axis.${axis.axis}`)}
            >
              <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                {t(`techStructure.axis.${axis.axis}`)}
              </Text>
              <ul className="mt-1 flex flex-col gap-1.5">
                {axis.technologies.map(tech => (
                  <li key={tech.name} className="min-w-0">
                    <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                      {tech.name}
                    </Text>
                    <ul className="flex flex-col gap-0.5">
                      {tech.proofs.map((proof, index) => (
                        <li key={`${proof.kind}-${proof.observed_at ?? ''}-${index}`}>
                          <ProofLine proof={proof} />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {structure.not_observed_axes.length > 0 ? (
        <div data-testid="tech-not-observed" className="mt-3 border-t border-[var(--bellum-border)] pt-3">
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('techStructure.notObservedLabel', {
              axes: structure.not_observed_axes.map(axis => t(`techStructure.axis.${axis}`)).join(' · '),
            })}
          </Text>
          {observed.length > 0 ? (
            <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
              {t('techStructure.partialNote')}
            </Text>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

/** Une preuve : sa nature, sa date, et son lien SEULEMENT s'il existe. */
function ProofLine({ proof }: { proof: TechProof }) {
  const { t } = useTranslation('accounts')
  const nature = t(`techStructure.proof.${proof.kind}`)
  const label = proof.label?.trim() || nature
  const date = formatDate(proof.observed_at)
  const isUrl = proof.url !== null && /^https?:\/\//i.test(proof.url)

  return (
    <Text size="xs" className="min-w-0 break-words text-[var(--bellum-text-muted)]">
      {isUrl ? (
        <a
          href={proof.url!}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('techStructure.proof.openLink', { label })}
          className="text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
        >
          {label}
        </a>
      ) : (
        label
      )}
      {date ? ` · ${t('techStructure.proof.on', { date })}` : ''}
    </Text>
  )
}
