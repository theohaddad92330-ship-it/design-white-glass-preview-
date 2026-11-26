import type { MatchExplanation } from '@bellum/contracts'
import { matchScoreIsMeasured } from '@bellum/contracts'
import {
  Box,
  Button,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Text,
} from '@bellum/ui'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ScoreWithAxes } from '@/components/primitives/ScoreWithAxes'
import { matchingApi } from '../api'
import { useMatchExplanation } from '../hooks'
import { TransparencyBanner } from './TransparencyBanner'

/**
 * LE DOCUMENT D'EXPLICATION, À L'ÉCRAN (§13, art. 86 de l'AI Act).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE TROU QU'IL COMBLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le calcul, le rendu, le schéma et la route existaient depuis le PDF 4. Le
 * seul geste de l'application était `window.open(…&format=md)`, c'est-à-dire un
 * TÉLÉCHARGEMENT. Le docblock de la route l'écrivait lui-même : « "exportable"
 * veut dire qu'on peut le remettre à quelqu'un, pas qu'on peut le lire à
 * l'écran ». Personne ne pouvait donc répondre « pourquoi ce profil est-il
 * classé là ? » sans ouvrir un fichier dans un éditeur de texte.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INVARIANT QUI NE SE NÉGOCIE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * **Le document ne porte la donnée d'AUCUN autre candidat.** C'est ce qui
 * permet de le remettre à la personne concernée sans fuite croisée, et c'est
 * pourquoi ce composant ne reçoit NI le `run`, NI la table des identités, NI
 * les résultats des autres : un identifiant, un nom, et ce que la route rend
 * pour lui. La tentation qui casserait tout serait de lui passer le classement
 * « pour avoir le contexte ».
 *
 * Deux conséquences visibles ici :
 *  - la demande part à l'OUVERTURE seulement — précharger les quarante
 *    explications d'un classement ferait voyager la donnée de gens que
 *    personne ne regarde ;
 *  - aucun rang, aucune comparaison, aucun « mieux classé que ». Le document
 *    explique UN classement, il ne situe pas quelqu'un par rapport aux autres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune PROBABILITÉ — ni chance d'être retenu, ni prévisionnel. Ce qui est
 * montré est un score DÉCOMPOSÉ, dont chaque axe est nommé, et dont ce qui n'a
 * pas pu être évalué est nommé aussi : un axe non évaluable SORT du
 * dénominateur, il ne vaut pas zéro. C'est toute la différence entre « ce point
 * ne vous a pas été reproché » et « vous avez zéro ».
 */
export function MatchExplainSheet({
  needId,
  runId,
  consultantId,
  name,
  open,
  onOpenChange,
}: {
  needId: string
  runId: string
  /** `null` tant qu'aucune carte n'a demandé son explication : rien n'est lu. */
  consultantId: string | null
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('matching')
  const explanation = useMatchExplanation(needId, runId, open ? consultantId : null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        closeLabel={t('common:actions.close')}
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-base">{t('explain.title', { name })}</SheetTitle>
          <SheetDescription>{t('explain.subtitle')}</SheetDescription>
        </SheetHeader>
        {/* En TÊTE, non masquable : un écran qui expose un classement de
            personnes le dit, quelle que soit la taille du panneau. */}
        <TransparencyBanner />
        <ScrollArea className="flex-1">
          <Box display="flex" className="flex-col gap-4 p-5">
            {explanation.isPending ? (
              <Text size="sm" className="text-[var(--bellum-text-muted)]">
                {t('explain.loading')}
              </Text>
            ) : explanation.data ? (
              <ExplanationBody explanation={explanation.data} needId={needId} runId={runId} />
            ) : (
              <Text size="sm" className="text-[var(--warning-soft-text)]">
                {t('explain.failed')}
              </Text>
            )}
          </Box>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function ExplanationBody({
  explanation,
  needId,
  runId,
}: {
  explanation: MatchExplanation
  needId: string
  runId: string
}) {
  const { t, i18n } = useTranslation('matching')
  const runAt = new Date(explanation.runAt)
  const axes = explanation.axes.map(axis => {
    const label = t(`axes.${axis.axis}`, { defaultValue: axis.axis })
    return {
      // Un axe non évaluable porte son POURQUOI et pas seulement son nom :
      // « Langue » dit qu'on n'a pas su, « aucune langue saisie » dit quoi
      // compléter pour que le classement devienne fiable.
      label:
        axis.score === null && axis.detail ? t('explain.axisWithDetail', { axis: label, detail: axis.detail }) : label,
      score: axis.score,
      detail: axis.detail,
    }
  })
  // Même règle que sur la carte et dans le tableau de comparaison, répondue au
  // même endroit : trois lecteurs qui la reposeraient chacun finiraient par dire
  // trois choses différentes du même profil.
  const scored = matchScoreIsMeasured(explanation.axes)

  return (
    <>
      <Box className="rounded-md border border-border p-3">
        <Text element="p" size="sm" weight="medium">
          {/* Un compte absent ne s'écrit pas « non renseigné » à côté du poste :
              le document sert de réponse à une personne, et un champ de
              remplissage y ferait du bruit là où il n'y a rien à dire. */}
          {explanation.accountName
            ? t('explain.role', { role: explanation.role, account: explanation.accountName })
            : explanation.role}
        </Text>
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {/* La DATE et le seuil font partie du document : une explication qui
              tairait le seuil du jour ne serait plus reproductible demain. */}
          {t('explain.runAt', {
            date: Number.isNaN(runAt.getTime()) ? explanation.runAt : runAt.toLocaleDateString(i18n.language),
          })}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('explain.threshold', { threshold: explanation.threshold })}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('explain.bucketLine', {
            bucket: t(`explain.bucket.${explanation.bucket}`, { defaultValue: explanation.bucket }),
          })}
        </Text>
      </Box>

      <Section title={t('scores.correspondence')} hint={t('explain.correspondenceHint')}>
        {/* Le score n'est JAMAIS nu : ses axes, et ce qui n'a pas pu être
            évalué, nommé. La primitive porte les deux.
            ⚠️ Et quand il n'y a PAS de score, on ne montre pas le zéro que le
            contrat impose faute de champ nullable : ce document est celui qu'on
            remet à la personne concernée, et un « 0/100 » qu'aucun calcul n'a
            produit y serait le plus coûteux des chiffres inventés. */}
        <ScoreWithAxes score={scored ? explanation.correspondenceScore : null} max={100} axes={axes} />
      </Section>

      <Section title={t('scores.pushable')} hint={t('explain.pushableHint')}>
        {/* Les TERMES du poussable ne voyagent pas dans ce document — seul son
            résultat y figure. On nomme donc ce qu'il combine plutôt que
            d'attribuer sa note aux axes de la correspondance, qui répondent à
            une autre question. */}
        <ScoreWithAxes score={scored ? explanation.pushableScore : null} max={100} />
        <Text element="p" size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('explain.pushableTerms')}
        </Text>
      </Section>

      <Section title={t('explain.weights')} hint={t('explain.weightsHint')}>
        <Box display="flex" className="flex-wrap gap-1.5">
          {Object.entries(explanation.weights).map(([axis, weight]) => (
            <Text
              key={axis}
              size="xs"
              element="span"
              className="rounded-md border border-border px-2 py-1 text-[var(--bellum-text-secondary)]"
            >
              {t('explain.weightChip', { axis: t(`axes.${axis}`, { defaultValue: axis }), weight })}
            </Text>
          ))}
        </Box>
      </Section>

      {explanation.exclusions.length > 0 ? (
        <Section title={t('explain.exclusions')}>
          <List
            items={explanation.exclusions.map(exclusion => ({
              key: exclusion.reason,
              label: t('explain.exclusionLine', {
                reason: t(`reasons.${exclusion.reason}`, { defaultValue: exclusion.reason }),
                detail: exclusion.detail,
              }),
            }))}
          />
        </Section>
      ) : null}

      {explanation.gaps.length > 0 ? (
        <Section title={t('explain.gaps')}>
          <List items={explanation.gaps.map(gap => ({ key: gap, label: gap }))} />
        </Section>
      ) : null}

      {explanation.questionsToValidate.length > 0 ? (
        <Section title={t('card.toValidate')}>
          <List items={explanation.questionsToValidate.map(question => ({ key: question, label: question }))} />
        </Section>
      ) : null}

      <Box display="flex" className="flex-col items-start gap-1">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void download(needId, runId, explanation.consultantId, t('explain.downloadFailed'))
          }}
        >
          <Download className="size-4" aria-hidden />
          {t('explain.download')}
        </Button>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('explain.downloadHint')}
        </Text>
      </Box>
    </>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Box>
      <Text element="h3" size="sm" weight="semibold">
        {title}
      </Text>
      {hint ? (
        <Text element="p" size="xs" className="mb-1 text-[var(--bellum-text-muted)]">
          {hint}
        </Text>
      ) : null}
      {children}
    </Box>
  )
}

function List({ items }: { items: { key: string; label: string }[] }) {
  return (
    <ul className="mt-1 list-disc pl-4">
      {items.map(item => (
        <li key={item.key}>
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {item.label}
          </Text>
        </li>
      ))}
    </ul>
  )
}

/**
 * Remet le document à la personne qui le demande.
 *
 * Il est récupéré par le client authentifié PUIS remis au navigateur : une
 * balise `<a href>` nue — ou le `window.open` d'avant — part sans l'identité de
 * l'onglet et vers l'origine de l'application, qui n'est pas celle de l'API.
 */
async function download(needId: string, runId: string, consultantId: string, failure: string): Promise<void> {
  try {
    const markdown = await matchingApi.explainMarkdown(needId, runId, consultantId)
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `classement-${consultantId}.md`
    anchor.click()
    URL.revokeObjectURL(url)
  } catch {
    // Un échec de téléchargement ne fait pas disparaître l'explication à
    // l'écran : elle est déjà lisible, c'est le fichier qui manque.
    toast.error(failure)
  }
}
