import { useEffect, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { MemberPortfolio, WorkspaceTeamMember } from '@bellum/contracts'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import {
  HandoverPlanRecap,
  HandoverRecipientSelect,
  allocationsOf,
  type HandoverChoice,
} from '@/features/team/view/HandoverPlanSection'
import { useMemberPortfolio } from '@/features/team/hooks/useMemberPortfolio'

/**
 * LE DÉPART D'UN MEMBRE — la prévisualisation, puis le geste.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CET ÉCRAN EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Tome 8 §33, angle mort n°2 : « quand quelqu'un quitte l'ESN, son portefeuille,
 * ses relations et sa mémoire Laura partent avec lui. **Rien n'est prévu.** »
 *
 * Avant, la ligne d'un membre portait une corbeille qui retirait le siège **au
 * premier clic**, sans confirmation et sans rien montrer de ce que la personne
 * portait. Ses comptes et ses contacts retournaient dans la file des non
 * attribués ; ses tâches, ses opportunités, ses besoins et ses missions
 * restaient chez un non-membre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX GESTES, ET C'EST DÉLIBÉRÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * **Transférer** ne retire pas le siège : une reprise se fait le plus souvent
 * pendant le préavis, quand la personne est encore là pour répondre aux
 * questions. **Retirer** reste possible sans transférer — le portefeuille
 * retourne alors dans la file des non attribués, où l'équipe le voit.
 *
 * Les deux sont dans la même boîte parce qu'ils partagent la seule chose qui
 * compte : le tableau de ce que la personne porte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'ÉCRAN DIT, ET QU'IL EST SEUL À POUVOIR DIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * - **Un comptage impossible n'est pas « 0 ».** Une nature dont le serveur n'a
 *   pas su compter les objets s'affiche « non mesuré » avec sa raison, jamais
 *   un zéro — sinon « il ne porte rien, on peut le retirer » se lit sur une
 *   base indisponible.
 * - **Ce qui ne se transmet pas est NOMMÉ.** La messagerie, l'agenda, les
 *   conversations avec Laura, les préférences. Une boîte mail est PERSONNELLE
 *   (D58) et le corps des messages ne sort jamais vers un humain (D65). Sans
 *   cette liste, un responsable croit avoir tout repris et découvre le trou
 *   trois semaines plus tard.
 * - **Ce qui a été appris reste.** Les fiches, les notes, l'historique et les
 *   angles appartiennent à l'espace : ils ne bougent pas parce qu'ils n'ont
 *   jamais appartenu à la personne.
 */
export function MemberOffboardingDialog({
  member,
  open,
  onOpenChange,
  onRemove,
  removing,
}: {
  member: WorkspaceTeamMember
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Retirer le siège — la mutation vit dans `useTeam`, partagée avec la liste. */
  onRemove: () => void
  removing: boolean
}) {
  const { t } = useTranslation('team')
  const { t: tCommon } = useTranslation('common')
  const { portfolio, handOver } = useMemberPortfolio(member.userId, open)
  const [successor, setSuccessor] = useState<string>('')
  // #4158.29 — un destinataire par nature, pour répartir entre plusieurs collègues.
  const [choice, setChoice] = useState<HandoverChoice>({})

  // Rouvrir la boîte sur un autre membre ne doit pas hériter du successeur
  // choisi pour le précédent — c'est le genre de report qui donne un compte à
  // la mauvaise personne.
  useEffect(() => {
    if (!open) {
      setSuccessor('')
      setChoice({})
    }
  }, [open, member.userId])

  const data = portfolio.data
  const name = member.fullName ?? member.email ?? t('member.fallbackName')
  const successors = data?.eligibleSuccessors ?? []
  const canHandOver = successor !== '' && !handOver.isPending && !removing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('handover.title', { name })}</DialogTitle>
          <DialogDescription>{t('handover.description')}</DialogDescription>
        </DialogHeader>

        <Box className="space-y-4">
          {/* Ce qui change de main */}
          <Box as="section" className="space-y-2">
            <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {t('handover.transfers.title')}
            </Text>
            {portfolio.isLoading && (
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('handover.transfers.loading')}
              </Text>
            )}
            {portfolio.isError && (
              <Text size="sm" color="text-[var(--danger-soft-text)]">
                {t('handover.transfers.failed')}
              </Text>
            )}
            {data && (
              <ul className="space-y-1">
                {data.holdings.map(holding => (
                  <li
                    key={holding.kind}
                    className="flex items-baseline justify-between gap-3 border-b border-[var(--bellum-border)] py-1 last:border-b-0"
                  >
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {t(`handover.kinds.${holding.kind}`)}
                    </Text>
                    {/* ⚠️ `null` = on n'a pas su compter. L'écrire « 0 » ferait
                        lire « rien à reprendre » à une lecture ratée, sur le
                        geste le plus irréversible de cet écran. */}
                    {holding.count === null ? (
                      <UnknownValue reason={t('handover.countFailed')} />
                    ) : (
                      <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
                        {holding.count}
                      </Text>
                    )}
                    {/* #4158.29 — le destinataire de CETTE nature, dans la même ligne */}
                    <HandoverRecipientSelect
                      kind={holding.kind}
                      count={holding.count}
                      data={data}
                      value={choice[holding.kind]}
                      onChange={userId => setChoice(previous => ({ ...previous, [holding.kind]: userId }))}
                    />
                  </li>
                ))}
              </ul>
            )}
            {data && (
              <HandoverPlanRecap
                fromUserId={member.userId}
                data={data}
                allocations={allocationsOf(data, choice)}
                onValidated={() => setChoice({})}
              />
            )}
          </Box>

          {/* Ce qui ne se transmet pas — nommé, jamais silencieux */}
          {data && (
            <Box as="section" className="space-y-1">
              <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
                {t('handover.personal.title')}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {data.personal.map(kind => t(`handover.personalKinds.${kind}`)).join(' · ')}
              </Text>
              <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                {t('handover.personal.help')}
              </Text>
            </Box>
          )}

          {/* Ce qui reste à l'espace sans bouger */}
          <Text size="xs" color="text-[var(--bellum-text-secondary)]">
            {t('handover.learned')}
          </Text>

          {/* Le successeur */}
          <Box as="section" className="space-y-2">
            <Text element="h3" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
              {t('handover.successor.title')}
            </Text>
            {data && successors.length === 0 ? (
              <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                {t('handover.successor.none')}
              </Text>
            ) : (
              <Select value={successor} onValueChange={setSuccessor} disabled={successors.length === 0}>
                <SelectTrigger
                  aria-label={t('handover.successor.aria')}
                  className="h-11 w-full border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-sm"
                >
                  <SelectValue placeholder={t('handover.successor.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {successors.map(candidate => (
                    <SelectItem key={candidate.userId} value={candidate.userId}>
                      {candidate.fullName ?? candidate.email ?? t('member.fallbackName')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Box>
        </Box>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={onRemove}
            disabled={handOver.isPending}
            isLoading={removing}
          >
            {t('handover.removeAnyway')}
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={!canHandOver}
            isLoading={handOver.isPending}
            onClick={() => {
              if (!canHandOver) return
              handOver.mutate(successor, { onSuccess: () => setSuccessor('') })
            }}
          >
            {t('handover.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
