import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { workspaceNextSteps, workspaceProgressSchema, type WorkspaceProgress } from '@bellum/contracts'
import { Button, Text } from '@bellum/ui'
import { apiFetch } from '@/lib/api'

/**
 * #5011.1 / #5011.2 — LA SUITE D'UNE RÉPONSE DÉPEND DE L'AVANCEMENT COMPTÉ DE L'ESPACE.
 *
 * L'état est lu côté API (`GET /workspace-progress`, filtre `workspace_id`) puis dérivé par le contrat
 * (`workspaceNextSteps`) : chaque étape cite le fait compté qui la justifie — jamais une suite
 * inventée, jamais rien si la lecture échoue ou si l'espace est avancé. Laura propose, l'humain valide
 * (#5011.3) : un clic POSE un texte dans le composeur, il n'envoie rien. Garde, ne recode pas : guide
 * in-app (#2950) et modes guidés (#2918).
 */
/**
 * Lue UNE fois par fenêtre de 30 s pour tout l'écran (dix réponses = une requête), sans fournisseur de
 * requêtes : l'écran de chat se monte aussi hors de l'application complète. Illisible ⇒ `null` —
 * aucune suite devinée, jamais un faux « espace vide ».
 */
const FRESH_MS = 30_000
let cached: { at: number; read: Promise<WorkspaceProgress | null> } | null = null

function readWorkspaceProgress(): Promise<WorkspaceProgress | null> {
  if (!cached || Date.now() - cached.at > FRESH_MS) {
    cached = {
      at: Date.now(),
      read: (async () => {
        try {
          return workspaceProgressSchema.parse(await apiFetch({ path: '/workspace-progress' }))
        } catch {
          return null
        }
      })(),
    }
  }
  return cached.read
}

/** Pour les tests : l'espace d'un autre test ne doit pas se lire dans celui-ci. */
export function resetWorkspaceProgressCache(): void {
  cached = null
}

function useWorkspaceProgress(): WorkspaceProgress | null {
  const [progress, setProgress] = useState<WorkspaceProgress | null>(null)
  useEffect(() => {
    let alive = true
    void readWorkspaceProgress().then(read => {
      if (alive) setProgress(read)
    })
    return () => {
      alive = false
    }
  }, [])
  return progress
}

export function WorkspaceNextSteps({ onPrefill }: { onPrefill: (text: string) => void }) {
  const { t } = useTranslation('chat')
  const progress = useWorkspaceProgress()
  if (!progress) return null
  const steps = workspaceNextSteps(progress)
  const first = steps[0]
  if (!first) return null
  return (
    <div role="group" aria-label={t('workspaceNext.label')} className="mt-2 space-y-1.5">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {first.count === undefined
          ? t(`workspaceNext.fact.${first.fact}`)
          : t(`workspaceNext.fact.${first.fact}`, { count: first.count })}
      </Text>
      <div className="flex flex-wrap gap-2">
        {steps.map(step => (
          <Button
            key={step.kind}
            variant="outline"
            size="sm"
            className="min-h-11"
            onClick={() => onPrefill(t(`workspaceNext.prompt.${step.kind}`))}
          >
            {t(`workspaceNext.step.${step.kind}`)}
          </Button>
        ))}
      </div>
    </div>
  )
}
