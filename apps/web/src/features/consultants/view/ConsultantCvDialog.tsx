import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Copy, FileText, Quote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '@/lib/api-error'
import { toast } from 'sonner'
import { softBrakeToast } from '@/features/credits/lib/soft-brake'
import type { ConsultantCvRewrite } from '@bellum/contracts'
import { consultantsApi } from '../api'

/**
 * « Adapter le CV à ce besoin » (annexe méthodo p22 « Réécriture du CV selon la
 * mission »).
 *
 * L'écran affiche les MANQUES avec le même relief que les forces. C'est
 * délibéré : un CV réécrit est un document qui part chez un client, et la seule
 * façon d'en garder la crédibilité est que le commercial sache, avant de
 * l'envoyer, ce que le profil ne prouve pas. Les manques ne sont pas un détail
 * de bas de page — ils sont ce qui l'empêche de se faire démonter en soutenance.
 *
 * Chaque expérience porte sa CITATION du CV source. C'est la trace visible du
 * garde-fou serveur : ce qui n'a pas pu être cité n'est tout simplement pas là.
 */
export function ConsultantCvDialog({
  open,
  consultantId,
  consultantName,
  opportunityId,
  rewrite,
  onClose,
  onGenerated,
}: {
  open: boolean
  consultantId: string
  consultantName: string
  opportunityId: string
  rewrite: ConsultantCvRewrite | null
  onClose: () => void
  onGenerated: (rewrite: ConsultantCvRewrite) => void
}) {
  const { t } = useTranslation('consultants')
  // #2440.34 (épopée #2975) — `cv_rewrite` débite `enrichment_credit`
  // (`consultants.controller.ts:721`), le MÊME compteur que `TabContacts`/
  // `ContactsSelectionBar` : une seule dérivation (GA-26), jamais un second
  // calcul. `undefined` tant que non résolu — jamais `0` par défaut, sinon
  // « non mesuré » se lirait comme « épuisé ».

  const generate = useMutation({
    mutationFn: () => consultantsApi.rewriteCv(consultantId, opportunityId),
    onSuccess: result => {
      onGenerated(result)
      toast.success(t('cv.generated'))
    },
    onError: (error: unknown) => {
      // Le 400 « pas de CV source » est une consigne actionnable, pas une panne :
      // on la distingue d'un échec de génération.
      const message = error instanceof Error ? error.message : ''
      // 402 = solde vide. Rien n'a été généré et rien n'a été débité : le
      // message doit dire quoi faire, pas « une erreur est survenue ».
      if (error instanceof ApiError && error.status === 402) {
        softBrakeToast()
        return
      }
      toast.error(message.includes('CV enregistré') ? message : t('cv.error'))
    },
  })

  const copy = () => {
    if (!rewrite) return
    void navigator.clipboard.writeText(asPlainText(rewrite))
    toast.success(t('cv.copied'))
  }

  return (
    <Dialog open={open} onOpenChange={value => (value ? null : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 text-[var(--bellum-text-accent)]" />
            {t('cv.title', { name: consultantName })}
          </DialogTitle>
          <DialogDescription>{t('cv.description')}</DialogDescription>
        </DialogHeader>

        {!rewrite ? (
          <div className="flex flex-col items-start gap-3 py-4">
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('cv.intro')}
            </Text>
            <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
              {generate.isPending ? t('cv.generating') : t('cv.generate')}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 py-2">
            <div>
              <Text element="h3" size="base" weight="semibold">
                {rewrite.headline}
              </Text>
              <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                {t('cv.forNeed', { need: rewrite.missionLabel })}
              </Text>
            </div>

            {rewrite.summary ? (
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {rewrite.summary}
              </Text>
            ) : null}

            {rewrite.keywords.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {rewrite.keywords.map(keyword => (
                  <Badge key={keyword} variant="primary">
                    {keyword}
                  </Badge>
                ))}
              </div>
            ) : null}

            {rewrite.highlights.length > 0 ? (
              <div className="flex flex-col gap-3">
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-secondary)]">
                  {t('cv.highlights')}
                </Text>
                {rewrite.highlights.map((highlight, index) => (
                  <div key={index} className="rounded-lg border border-[var(--bellum-border)] p-3">
                    <Text size="sm" weight="semibold">
                      {highlight.title}
                    </Text>
                    <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
                      {highlight.detail}
                    </Text>
                    {highlight.proof ? (
                      <div className="mt-2 flex items-start gap-1.5 border-t border-[var(--bellum-border)] pt-2">
                        <Quote className="mt-0.5 size-3 shrink-0 text-[var(--bellum-text-muted)]" />
                        <Text size="xs" className="italic text-[var(--bellum-text-muted)]">
                          {highlight.proof}
                        </Text>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('cv.noHighlights')}
              </Text>
            )}

            {rewrite.gaps.length > 0 ? (
              <div className="rounded-lg border border-[var(--bellum-warning)] bg-[var(--bellum-warning)]/5 p-3">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5 text-[var(--warning-soft-text)]" />
                  <Text size="xs" weight="semibold">
                    {t('cv.gaps')}
                  </Text>
                </div>
                <ul className="mt-2 flex flex-col gap-1">
                  {rewrite.gaps.map((gap, index) => (
                    <li key={index}>
                      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                        — {gap}
                      </Text>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center gap-2 border-t border-[var(--bellum-border)] pt-3">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={copy}>
                <Copy className="size-3.5" />
                {t('cv.copy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => generate.mutate()} disabled={generate.isPending}>
                {generate.isPending ? t('cv.generating') : t('cv.regenerate')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Le CV en texte brut, prêt à coller dans un mail ou un document.
 *  Les manques n'y sont PAS : ce sont une note interne au commercial, pas une
 *  partie du document envoyé au client. */
function asPlainText(rewrite: ConsultantCvRewrite): string {
  const lines = [rewrite.headline, '', rewrite.summary, '']
  for (const highlight of rewrite.highlights) {
    lines.push(`• ${highlight.title}`, `  ${highlight.detail}`, '')
  }
  return lines.join('\n').trim()
}
