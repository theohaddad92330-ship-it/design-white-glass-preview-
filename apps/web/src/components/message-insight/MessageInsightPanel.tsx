import { Button, Text } from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { CollapsedSection } from '@/components/disclosure/CollapsedSection'
import { getRoleLabel } from '@/lib/contactRoles'
import { availableUnusedElements, type MessageInsight, type MessageToneOption } from '@/lib/message-insight'

/**
 * #1926.28 → .31, #1925 — « pourquoi ce message », sous un brouillon issu de
 * `/message/generate`. Partagé par le composer de fiche contact
 * (`EngagementMessage`) et la carte Action OS (`PendingActions`) : les deux
 * écrans affichent le MÊME brouillon généré par le MÊME appel, donc la même
 * matière — un texte dupliqué à la main aurait divergé au premier ajout
 * (GA-26).
 *
 * Rend `null` quand il n'y a RIEN à montrer — un brouillon d'une API plus
 * ancienne (déploiement en cours) ne porte aucun de ces champs, et l'écran ne
 * doit ni casser ni afficher un bloc vide.
 *
 * `onUseAlternativeAngle` / `onChangeTone` sont FACULTATIFS et c'est
 * volontaire : un appelant qui n'a pas de chemin de régénération (la carte
 * Action OS — Action OS réécrit son propre geste de confirmation ailleurs) les
 * omet, et ce panneau n'affiche alors AUCUN bouton mort — juste le texte.
 */
export function MessageInsightPanel({
  insight,
  onUseAlternativeAngle,
  onChangeTone,
  channel,
}: {
  insight: MessageInsight
  /** #4980.2 — pour un e-mail, le bouton se nomme « Pourquoi ce mail est pertinent ». */
  channel?: string
  onUseAlternativeAngle?: (angle: string) => void
  onChangeTone?: (tone: MessageToneOption) => void
}) {
  const { t } = useTranslation('common')

  const rationale = insight.rationale?.trim() || ''
  const usedElements = insight.specificity?.elements ?? []
  // #3418.4 (retour bêta 30/09) — le rôle dans la décision, déterminé AVANT
  // rédaction comme le reste du cadrage : nommé ici plutôt que laissé au seul
  // `missing` quand il EST connu.
  const decisionRole = insight.brief?.decisionRole ?? null
  // #2887.5 — « interdits » : le sixième attribut composé du cadrage, nommé
  // seulement quand la relation en porte un PROPRE (texte libre dérivé côté
  // serveur, comme `rationale` — jamais une clé i18n, voir `MessageBrief`).
  const forbidden = insight.brief?.forbidden?.trim() || ''
  // #2371.5 — la longueur du canal, même source que le prompt (texte serveur).
  const length = insight.brief?.length?.trim() || ''
  const sources = (insight.knowledgeSources ?? []).filter(source => source.title?.trim())
  const lexiconTerms = insight.lexiconWarning?.terms ?? []
  const hasWhy =
    Boolean(rationale) ||
    usedElements.length > 0 ||
    Boolean(decisionRole) ||
    Boolean(forbidden) ||
    Boolean(length) ||
    sources.length > 0
  const missing = insight.brief?.missing ?? []
  const alternativeAngle = insight.alternativeAngle?.trim() || ''
  const toneOptions = insight.toneOptions ?? []
  // #1926.30 (décision « message générique ») — `non_evaluable` n'affiche
  // JAMAIS cet avertissement : un dossier qui n'offre même pas deux familles
  // n'est pas un message raté, c'est une donnée qu'on n'a jamais eue.
  const isGeneric = insight.specificity?.status === 'generique'

  const showTone = Boolean(onChangeTone) && toneOptions.length > 0
  const hasAnything =
    hasWhy || lexiconTerms.length > 0 || missing.length > 0 || Boolean(alternativeAngle) || isGeneric || showTone
  if (!hasAnything) return null

  return (
    <div className="mt-2.5 space-y-2">
      {isGeneric && insight.specificity ? (
        <GenericWarning enrichWith={availableUnusedElements(insight.specificity)} />
      ) : null}

      {lexiconTerms.length > 0 ? <LexiconWarning terms={lexiconTerms} /> : null}

      {hasWhy ? (
        <CollapsedSection title={t(channel === 'email' ? 'messageInsight.whyEmail' : 'messageInsight.why')}>
          <div className="space-y-3">
            {rationale ? (
              <div>
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                  {t('messageInsight.rationale')}
                </Text>
                <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                  {rationale}
                </Text>
              </div>
            ) : null}
            {decisionRole ? (
              <div>
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                  {t('messageInsight.decisionRole')}
                </Text>
                <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                  {getRoleLabel(decisionRole)}
                </Text>
              </div>
            ) : null}
            {forbidden ? (
              <div>
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                  {t('messageInsight.forbidden')}
                </Text>
                <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                  {forbidden}
                </Text>
              </div>
            ) : null}
            {length ? (
              <div>
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                  {t('messageInsight.length')}
                </Text>
                <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
                  {length}
                </Text>
              </div>
            ) : null}
            {usedElements.length > 0 ? (
              <div>
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                  {t('messageInsight.dataUsed')}
                </Text>
                <ul className="mt-0.5 space-y-0.5">
                  {usedElements.map(element => (
                    <li key={element.kind}>
                      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                        {t(`messageInsight.element.${element.kind}`, { defaultValue: element.kind })} :{' '}
                      </Text>
                      <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {element.value}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {sources.length > 0 ? (
              <div>
                <Text size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
                  {t('messageInsight.knowledgeSources')}
                </Text>
                <ul className="mt-0.5 space-y-0.5">
                  {sources.map(source => (
                    <li key={source.docId}>
                      <Text element="span" size="xs" className="text-[var(--bellum-text-secondary)]">
                        {source.title}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </CollapsedSection>
      ) : null}

      {missing.length > 0 ? (
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('messageInsight.missingBrief', {
            items: missing.map(code => t(`messageInsight.missing.${code}`, { defaultValue: code })).join(' · '),
          })}
        </Text>
      ) : null}

      {alternativeAngle ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            <Text element="span" size="xs" weight="semibold" className="text-[var(--bellum-text-muted)]">
              {t('messageInsight.alternativeAngle')} :{' '}
            </Text>
            {alternativeAngle}
          </Text>
          {onUseAlternativeAngle ? (
            <Button size="sm" variant="ghost" onClick={() => onUseAlternativeAngle(alternativeAngle)}>
              {t('messageInsight.useThisAngle')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {showTone && onChangeTone ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('messageInsight.changeTone')}
          </Text>
          {toneOptions.map(tone => (
            <Button key={tone.id} size="sm" variant="outline" onClick={() => onChangeTone(tone)}>
              {t(`messageInsight.tone.${tone.id}`, { defaultValue: tone.instruction })}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LexiconWarning({ terms }: { terms: string[] }) {
  const { t } = useTranslation('common')
  return (
    <div
      className="flex items-start gap-1.5 rounded-md border px-2.5 py-2"
      style={{
        backgroundColor: 'var(--warning-soft-bg)',
        borderColor: 'var(--warning-soft-border)',
      }}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
      <Text size="xs" weight="medium" className="min-w-0 text-[var(--warning-soft-text)]">
        {t('messageInsight.lexiconWarning', { terms: terms.join(' · ') })}
      </Text>
    </div>
  )
}

function GenericWarning({ enrichWith }: { enrichWith: string[] }) {
  const { t } = useTranslation('common')
  return (
    <div
      className="flex items-start gap-1.5 rounded-md border px-2.5 py-2"
      style={{
        backgroundColor: 'var(--warning-soft-bg)',
        borderColor: 'var(--warning-soft-border)',
      }}
    >
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-[var(--warning-soft-text)]" aria-hidden />
      <div className="min-w-0">
        <Text size="xs" weight="medium" className="text-[var(--warning-soft-text)]">
          {t('messageInsight.genericWarning')}
        </Text>
        {enrichWith.length > 0 ? (
          <Text element="p" size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
            {t('messageInsight.genericHint', {
              items: enrichWith.map(kind => t(`messageInsight.element.${kind}`, { defaultValue: kind })).join(' · '),
            })}
          </Text>
        ) : null}
      </div>
    </div>
  )
}
