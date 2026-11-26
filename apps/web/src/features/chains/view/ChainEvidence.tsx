import { chainFlowSteps, chainManualSteps, type Chain, type ChainDerivation, type ChainKey } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToggleChainMark } from '../api'

/**
 * POURQUOI CE DOSSIER EST LÀ, ET CE QUI L'Y A MENÉ (#1507 §4 et §5).
 *
 * « Passé à Profil proposé » ne se vérifie pas. « Passé à Profil proposé parce
 * que 2 positionnements sont partis le 03/09 » se vérifie — et c'est ce que le
 * moteur sait dire, parce qu'il a LU ce fait pour placer le dossier.
 *
 * ⚠️ Les phrases sont des CLÉS i18n (`fact.<chaîne>.<position>`) résolues ici,
 * jamais des phrases fabriquées par le serveur : un libellé d'affichage écrit
 * côté moteur est français pour toujours.
 */
export function ChainEvidence({
  chain,
  derivation,
  locale,
  defaultOpen = false,
}: {
  chain: Chain
  derivation: ChainDerivation
  locale: 'fr' | 'en'
  /** #3486 — sur la fiche d'un dossier, « Pourquoi ? » est lu tout de suite : un libellé replié seul se lit comme une ligne vide. */
  defaultOpen?: boolean
}) {
  const { t, i18n } = useTranslation('chains')
  const [open, setOpen] = useState(defaultOpen)
  const steps = chainFlowSteps(chain)

  const formatDate = (at: string | null): string | null => {
    if (at === null) return null
    const date = new Date(at)
    if (Number.isNaN(date.getTime())) return null
    return new Intl.DateTimeFormat(i18n.language.startsWith('en') ? 'en-GB' : 'fr-FR', {
      day: '2-digit',
      month: '2-digit',
    }).format(date)
  }

  if (derivation.kind === 'undetermined') {
    return (
      <Box className="flex flex-col gap-1">
        <Badge variant="outline">{t('flow.undetermined')}</Badge>
        {/* « Si Bellum ne sait pas : étape non déterminée + pourquoi » — le §6.
            Sans la raison, la phrase est un aveu sans geste possible. */}
        <Text element="p" size="xs" color="text-muted-foreground">
          {t(`flow.undeterminedReason.${derivation.reason}`)}
        </Text>
      </Box>
    )
  }

  if (derivation.evidence.length === 0) return null

  return (
    <Box className="flex flex-col gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        // #3551 — le bouton ghost porte px-3 : sans cette marge, le libellé sortait de
        // 12 px de l'alignement du contenu (mesuré x457 contre x445).
        className="-ml-3 w-fit pointer-coarse:min-h-11"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        {t('flow.why')}
      </Button>
      {open ? (
        <ul className="flex flex-col gap-0.5 border-l border-border pl-2">
          {derivation.evidence.map(entry => {
            const step = steps.find(item => item.position === entry.position)
            const date = formatDate(entry.at)
            return (
              <li key={`${entry.position}-${entry.fact}`}>
                <Text element="span" size="xs" color="text-muted-foreground">
                  <Text element="span" size="xs" weight="medium">
                    {step?.label[locale] ?? String(entry.position)}
                  </Text>
                  {' — '}
                  {/* ⚠️ `count` n'est PASSÉ que quand le fait se compte. Le
                      donner à zéro sur un fait qui n'a pas de pluriel force
                      i18next à chercher une forme `_other` qui n'existe pas —
                      et la phrase disparaîtrait au profit du repli. */}
                  {entry.count === null
                    ? t(entry.fact, { defaultValue: t('flow.factUnknown') })
                    : t(entry.fact, { count: entry.count, defaultValue: t('flow.factUnknown') })}
                  {date ? ` · ${date}` : ''}
                </Text>
              </li>
            )
          })}
          {derivation.gateReason ? (
            // Le motif d'un refus vient de l'OBJET (`staffable_reason`,
            // `loss_reason`) : il a été écrit par quelqu'un, on le cite.
            <li>
              <Text element="span" size="xs" color="text-muted-foreground">
                {t('flow.gateReason', { reason: derivation.gateReason })}
              </Text>
            </li>
          ) : null}
        </ul>
      ) : null}
    </Box>
  )
}

/**
 * LA CHECKLIST DES GESTES HORS OUTIL (#1503, décision D48).
 *
 * Badge d'accès, VPN, matériel, soutenance : aucune table ne les porte, et il
 * n'en existera pas. Ils sortent donc du fil dérivé — sinon le dossier
 * s'arrêterait pour toujours à la dernière étape lisible — et deviennent des
 * cases qu'un humain coche.
 *
 * ⚠️ Une case cochée n'entre en concurrence avec AUCUN état : c'est ce qui la
 * distingue d'une position écrite à la main, et c'est pour ça qu'elle est
 * permise alors que « Démarrer un parcours » ne l'est plus.
 */
export function ChainChecklist({
  chain,
  subjectId,
  marked,
  locale,
}: {
  chain: Chain
  subjectId: string
  marked: readonly { position: number; markedAt: string | null }[]
  locale: 'fr' | 'en'
}) {
  const { t } = useTranslation('chains')
  const toggle = useToggleChainMark()
  // #3526 — la case suit le geste, pas le serveur : cochée tout de suite, et
  // jamais désactivée (un second clic pendant l'écriture était perdu). La
  // valeur du serveur reprend la main dès que l'écriture est terminée.
  const [pending, setPending] = useState<Record<number, boolean>>({})
  const steps = chainManualSteps(chain)
  if (steps.length === 0) return null

  const done = steps.filter(step => marked.some(entry => entry.position === step.position)).length

  return (
    <Box className="flex flex-col gap-1">
      <Box display="flex" className="items-center justify-between gap-2">
        <Text element="span" size="xs" weight="medium">
          {t('checklist.title')}
        </Text>
        <Text element="span" size="xs" color="text-muted-foreground">
          {t('checklist.progress', { done, total: steps.length })}
        </Text>
      </Box>
      <ul className="flex flex-col gap-0.5">
        {steps.map(step => {
          const isMarked = pending[step.position] ?? marked.some(entry => entry.position === step.position)
          return (
            <li key={step.position}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isMarked}
                  onChange={event => {
                    const next = event.target.checked
                    setPending(prev => ({ ...prev, [step.position]: next }))
                    toggle
                      .mutateAsync({
                        chainKey: chain.key as ChainKey,
                        subjectId,
                        position: step.position,
                        marked: next,
                      })
                      .catch(() => undefined)
                      .finally(() =>
                        setPending(prev => {
                          const rest = { ...prev }
                          delete rest[step.position]
                          return rest
                        }),
                      )
                  }}
                />
                <Text element="span" size="sm" color={isMarked ? undefined : 'text-muted-foreground'}>
                  {step.label[locale]}
                </Text>
              </label>
            </li>
          )
        })}
      </ul>
    </Box>
  )
}
