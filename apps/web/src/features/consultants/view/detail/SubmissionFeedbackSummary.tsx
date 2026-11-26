import { Badge, Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { FEEDBACK_AXES } from '@bellum/contracts'
import { useSubmissionFeedback } from '@/features/submissions/api'

/**
 * #2185.42 — le retour du client sur un positionnement, sur la fiche du
 * TALENT concerné : l'onglet Positionnements ne montrait que l'étape et
 * `outcomeReason`, une raison COURTE (« prix », « compétences »…), jamais le
 * retour complet à onze axes (`submission_feedback`, `useSubmissionFeedback`)
 * — qui existait déjà, journalisé et testé, sans aucun appelant ici.
 *
 * Le plus RÉCENT retour (le premier de la liste, triée `created_at DESC` côté
 * serveur) est celui qui compte : un positionnement peut recevoir plusieurs
 * retours au fil de son avancement, et c'est le dernier qui reflète l'état
 * actuel.
 *
 * ⚠️ Doctrine « on n'affiche pas ce qu'on n'a pas » : un axe `unknown` (« pas
 * abordé ») ne pose AUCUNE ligne — le confondre avec un verdict réel ferait un
 * jugement que le client n'a jamais formulé. Aucun retour enregistré ne rend
 * RIEN, jamais un bloc vide qui se lirait comme un défaut d'affichage.
 */
export function SubmissionFeedbackSummary({ submissionId }: { submissionId: string }) {
  const { t } = useTranslation('submissions')
  const { data: feedback } = useSubmissionFeedback(submissionId)
  const latest = (feedback ?? [])[0]
  if (!latest) return null

  const axes = FEEDBACK_AXES.filter(axis => latest[axis] !== 'unknown')
  if (axes.length === 0 && !latest.verbatim) return null

  return (
    <Box display="flex" className="w-full flex-col gap-1 border-t border-border pt-1.5">
      {axes.length > 0 ? (
        <Box display="flex" className="flex-wrap gap-1.5">
          {axes.map(axis => (
            <Badge key={axis} variant="outline">
              {t(`feedback.axis.${axis}`)} · {t(`feedback.verdict.${latest[axis]}`)}
            </Badge>
          ))}
        </Box>
      ) : null}
      {latest.verbatim ? (
        <Text size="xs" className="italic text-[var(--bellum-text-muted)]">
          « {latest.verbatim} »
        </Text>
      ) : null}
    </Box>
  )
}
