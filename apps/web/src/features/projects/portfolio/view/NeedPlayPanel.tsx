import { Badge, Button, Text } from '@bellum/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { softBrakeToast } from '@/features/credits/lib/soft-brake'
import { accountsApi, type NeedPlayRow } from '@/features/accounts/api'
import type { NeedItem } from '@/features/projects/portfolio/model/needs'
import { ApiError } from '@/lib/api-error'

/**
 * « Préparer l'attaque » d'un besoin — la seule surface payante de l'écran
 * Besoins (décision Louis 31/07, D9 option A).
 *
 * Ce que le crédit achète est une GÉNÉRATION : le besoin lui-même vient de
 * l'analyse, déjà facturée. Deux conséquences visibles ici :
 *  - le coût est annoncé AVANT le clic — on ne débite jamais une action dont le
 *    prix se découvre après ;
 *  - un plan déjà généré par un collègue s'ouvre gratuitement, et le dit.
 */
export function NeedPlayPanel({ accountId, need }: { accountId: string; need: NeedItem }) {
  const { t } = useTranslation('projects')
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const plays = useQuery({
    queryKey: ['need-plays'],
    queryFn: accountsApi.listNeedPlays,
    staleTime: 60_000,
  })

  const existing = (plays.data ?? []).find(row => row.account_id === accountId && row.need_label === need.label)

  const prepare = useMutation({
    mutationFn: () =>
      accountsApi.createNeedPlay({
        account_id: accountId,
        kind: need.kind,
        label: need.label,
        detail: need.detail,
        offer: need.offer,
        urgency: need.urgency === 'unknown' ? null : need.urgency,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['need-plays'] })
      // Le solde a bougé (sauf relecture) — la jauge doit suivre sans rechargement.
      void queryClient.invalidateQueries({ queryKey: ['credits'] })
      setOpen(true)
    },
    onError: (error: unknown) => {
      // 402 = solde vide. Rien n'a été généré ni débité : le message dit quoi
      // faire, il n'annonce pas une panne.
      if (error instanceof ApiError && error.status === 402) {
        softBrakeToast()
        return
      }
      toast.error(t('play.error'))
    },
  })

  if (existing && open) return <PlayContent play={existing} />

  return (
    <div className="mt-3 pl-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={existing ? 'ghost' : 'outline'}
          size="sm"
          disabled={prepare.isPending}
          onClick={() => (existing ? setOpen(true) : prepare.mutate())}
        >
          {prepare.isPending ? t('play.preparing') : existing ? t('play.view') : t('play.prepare')}
        </Button>
        {existing ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('play.free')}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

function PlayContent({ play }: { play: NeedPlayRow }) {
  const { t } = useTranslation('projects')
  const content = play.content

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-3">
      <Section title={t('play.angle')}>{content.angle}</Section>

      {content.targets.length > 0 ? (
        <div>
          <Text size="xs" weight="medium">
            {t('play.targets')}
          </Text>
          <ul className="mt-1 space-y-1">
            {content.targets.map((target, index) => (
              <li key={index} className="flex flex-wrap items-center gap-2">
                {/* Un nom vide n'est pas un trou : c'est le garde qui a refusé
                    une personne absente du dossier. On montre le rôle. */}
                <Text size="xs">{target.name || target.role}</Text>
                {target.name ? null : <Badge variant="outline">{t('play.roleToIdentify')}</Badge>}
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {target.why}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section title={t('play.message')}>{content.message}</Section>

      {content.proofs.length > 0 ? (
        <div>
          <Text size="xs" weight="medium">
            {t('play.proofs')}
          </Text>
          <ul className="mt-1 space-y-1">
            {content.proofs.map((proof, index) => (
              <li key={index}>
                <Text size="xs">{proof.claim}</Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  « {proof.proof} »
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {content.missing.length > 0 ? (
        <div>
          {/* Ce qui manque est UTILE : un commercial qui sait qu'il n'a pas la
              référence prépare autrement. C'est aussi ce que le garde a retiré. */}
          <Text size="xs" weight="medium">
            {t('play.missing')}
          </Text>
          <ul className="mt-1 list-disc pl-4">
            {content.missing.map((item, index) => (
              <li key={index}>
                <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                  {item}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Section title={t('play.nextAction')}>{content.next_action}</Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: string }) {
  if (!children) return null
  return (
    <div>
      <Text size="xs" weight="medium">
        {title}
      </Text>
      <Text size="xs" className="whitespace-pre-line text-[var(--bellum-text-secondary)]">
        {children}
      </Text>
    </div>
  )
}
