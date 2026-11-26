import type { OrgGraph, OrgGraphCorrection } from '@bellum/contracts'
import { Badge, Button, Card, Text } from '@bellum/ui'
import type { TFunction } from 'i18next'
import { History, RotateCcw, Undo2 } from 'lucide-react'
import { useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SessionContext } from '@/features/auth/session-context'
import { describeCorrectionValue, graphNodeLabels, readGraphConflict } from './orgCorrectionDraft'
import { useOrgCorrectionHistory, useRevertOrgCorrection } from './useOrgCorrections'

/**
 * « QUI A CHANGÉ ÇA, ET POURQUOI » — l'historique des corrections du dossier.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA FORME EST REPRISE, PAS INVENTÉE
 * ─────────────────────────────────────────────────────────────────────────
 * Le produit répond DÉJÀ à cette question ailleurs : `AccountTimelineCard`
 * (`GET /accounts/:id/timeline`) rend un fil d'événements datés dans une carte,
 * avec trois états DISTINCTS — chargement, échec de lecture, et vide réel. On
 * reprend cette forme telle quelle plutôt que d'en inventer une seconde : deux
 * historiques dessinés différemment sur le même écran se lisent comme deux
 * choses différentes.
 *
 * ⚠️ **Un échec de lecture le DIT.** C'est la faute trouvée en production le
 * 17/08 sur les notes, et elle est pire ici : un tiroir vide se lirait
 * « personne n'a jamais corrigé cet organigramme », c'est-à-dire exactement
 * l'inverse de ce qu'il faut croire quand on n'a pas pu lire.
 *
 * ⚠️ **Une correction ANNULÉE reste affichée**, avec sa pierre tombale. « On
 * archive, on ne supprime pas » : sans elle, on ne peut pas expliquer pourquoi
 * l'organigramme disait autre chose pendant trois semaines.
 *
 * ⚠️ **L'auteur n'est jamais un identifiant technique.** Le ledger porte un
 * `userId` ; l'écran dit « par toi » quand c'est le porteur de la session, et
 * « par un autre membre de l'espace » sinon. Il n'écrit pas un UUID à la place
 * d'un humain, et il n'invente pas un nom qu'il n'a pas. (Le 409, lui, porte un
 * VRAI nom — le serveur y joint `profiles` ; `GET …/corrections` ne le fait pas
 * encore : décision D323, parquée.)
 */
export function OrgCorrectionsHistory({ accountId, graph }: { accountId: string; graph: OrgGraph }) {
  const { t, i18n } = useTranslation('accountOrg')
  const session = useContext(SessionContext)
  const history = useOrgCorrectionHistory(accountId)
  const revert = useRevertOrgCorrection(accountId)
  const labels = graphNodeLabels(graph)

  const undo = (entry: OrgGraphCorrection) => {
    if (revert.isPending) return
    revert.mutate(
      { correctionId: entry.id, expectedGraphVersion: graph.graphVersion },
      {
        onSuccess: () => toast.success(t('correction.history.revertDone')),
        onError: error => {
          // Le même verrou que la correction : annuler EST une écriture. Le
          // conflit se dit ici aussi, sinon l'annulation échoue en silence.
          const conflict = readGraphConflict(error)
          if (conflict) {
            toast.error(t('correction.conflict.title'), {
              description: t('correction.conflict.body', { yours: conflict.yours, current: conflict.current }),
            })
            return
          }
          toast.error(error instanceof Error && error.message ? error.message : t('correction.history.revertError'))
        },
      },
    )
  }

  return (
    <Card className="overflow-hidden p-0 [--card-spacing:0px]" data-testid="org-corrections-history">
      <div className="border-b border-[var(--bellum-border)] px-5 py-4">
        <div className="flex items-center gap-2">
          <History className="size-4 text-[var(--bellum-text-accent)]" aria-hidden />
          <Text element="h3" size="base" weight="semibold">
            {t('correction.history.title')}
          </Text>
        </div>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('correction.history.subtitle')}
        </Text>
      </div>

      <div className="px-5 py-4">
        {history.isLoading ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('correction.history.loading')}
          </Text>
        ) : null}

        {/* Un échec de lecture n'est PAS un historique vide. */}
        {history.isError ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]" data-testid="org-corrections-history-error">
            {t('correction.history.loadError')}
          </Text>
        ) : null}

        {history.data && history.data.length === 0 ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('correction.history.empty')}
          </Text>
        ) : null}

        {history.data && history.data.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {history.data.map(entry => (
              <li key={entry.id} className="flex gap-2">
                <span className="mt-0.5 shrink-0">
                  <RotateCcw className="size-3.5 text-[var(--bellum-text-secondary)]" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text element="p" size="sm">
                      {historyLine(entry, labels, t, i18n.language)}
                    </Text>
                    {/* #2126.39 — une correction privée le dit ; l'espace ne la voit pas. */}
                    {entry.visibility === 'private' ? (
                      <Badge variant="outline">{t('correction.history.private')}</Badge>
                    ) : null}
                    {entry.revertedAt ? <Badge variant="outline">{t('correction.history.reverted')}</Badge> : null}
                  </div>
                  <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]" title={entry.reason}>
                    {entry.reason}
                  </Text>
                  <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
                    {t('correction.history.meta', {
                      source: t(`orgGraph.sourceKinds.${entry.evidence.kind}`),
                      version: entry.graphVersionAfter,
                      when: new Date(entry.createdAt).toLocaleDateString(i18n.language),
                    })}
                    {session?.user
                      ? ` · ${session.user.id === entry.userId ? t('correction.history.byYou') : t('correction.history.byOther')}`
                      : ''}
                  </Text>
                  {/* Réversible — décision 7. La ligne d'origine ne disparaît
                      pas : elle reçoit sa pierre tombale, et l'annulation dépose
                      sa PROPRE ligne. */}
                  {entry.revertedAt ? null : (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="mt-1 gap-1.5 pointer-coarse:min-h-11"
                      onClick={() => undo(entry)}
                      disabled={revert.isPending}
                    >
                      <Undo2 className="size-3" aria-hidden />
                      {t('correction.history.revert')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * La phrase d'une ligne d'historique, selon son motif.
 *
 * #2126.10 — un fait déclaré OBSOLÈTE dit depuis quand, et ce qu'il valait : il
 * n'a pas disparu, il est redevenu inconnu avec sa date. Un motif qui ne
 * réécrit rien (confirmer, pas pertinent…) nomme son geste et la valeur qu'il
 * vise, sans flèche « avant → après » qui ferait croire à un changement.
 */
function historyLine(
  entry: OrgGraphCorrection,
  labels: ReadonlyMap<string, string>,
  t: TFunction<'accountOrg'>,
  language: string,
): string {
  const describe = (value: unknown) =>
    describeCorrectionValue(value, labels, t('correction.currentUnknown'), key => t(`correction.roles.${key}`))
  const field = t(`correction.fields.${entry.field}`)
  const subject = labels.get(entry.objectId) ?? entry.objectId
  if (entry.motive === 'obsolete') {
    return t('correction.history.obsoleteSince', {
      date: new Date(entry.createdAt).toLocaleDateString(language),
      field,
      subject,
      value: describe(entry.oldValue),
    })
  }
  if (entry.motive && entry.motive !== 'corrected') {
    return t('correction.history.motiveLine', {
      motive: t(`correction.motives.${entry.motive}`),
      field,
      subject,
      value: describe(entry.newValue),
    })
  }
  return t('correction.history.change', {
    field,
    subject,
    from: describe(entry.oldValue),
    to: describe(entry.newValue),
  })
}
