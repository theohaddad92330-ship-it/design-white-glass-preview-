import type { AccountFactsBrief, MeetingType } from '@bellum/contracts'
import {
  deriveMeetingFlow,
  deriveMeetingPitch,
  deriveR1Recap,
  isRexDocumentCategory,
  selectRex,
  type R1Recap,
} from '@bellum/contracts'
import { useMemo } from 'react'
import { useMissions } from '@/features/missions/api'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useRagDocuments } from '@/features/rag/hooks/useRagDocuments'

/**
 * #4424.2-.4 — LE CALCUL UNIQUE du R1, du R2 et du pitch (GA-26).
 *
 * Le brief d'un rendez-vous d'agenda (`MeetingPrepDialog`) et le panneau
 * « Préparer le rendez-vous » de la fiche compte lisent CE hook : un second
 * chemin de calcul ferait diverger deux écrans qui disent la même chose.
 * Les REX viennent de ce que l'espace sait DÉJÀ (missions, documents de preuve
 * client, références du profil) ; aucun modèle n'est appelé.
 */
export function useMeetingR1R2(input: {
  readonly meetingType: MeetingType | null
  /** Date du rendez-vous ; `null` = « maintenant » (fiche compte), tous les comptes rendus comptent. */
  readonly meetingStart: string | null
  readonly accountName: string | null | undefined
  readonly stakes: readonly string[]
  readonly factsBrief: AccountFactsBrief | null
}) {
  const { meetingType, meetingStart, accountName, stakes, factsBrief } = input
  // Les missions et les documents de l'espace ne se lisent que pour un R1 — le seul qui les cite.
  const isR1 = meetingType === 'r1_discovery'
  const { data: esnProfile } = useEsnProfile()
  const workspaceMissionsQuery = useMissions({}, { enabled: isR1 })
  const ragDocumentsQuery = useRagDocuments({ enabled: isR1 })
  const rex = useMemo(
    () =>
      selectRex({
        missions: (workspaceMissionsQuery.data?.missions ?? []).map(mission => ({
          label: mission.accountName ? `${mission.label} — ${mission.accountName}` : mission.label,
          date: mission.started_on ?? mission.updated_at,
        })),
        documents: (ragDocumentsQuery.data ?? [])
          .filter(doc => isRexDocumentCategory(doc.category))
          .map(doc => ({ label: doc.title, date: doc.created_at })),
        references: esnProfile?.client_references ?? [],
      }),
    [workspaceMissionsQuery.data, ragDocumentsQuery.data, esnProfile],
  )
  // #4424.3 — le R1 se lit sur les comptes rendus du compte (fiche de
  // préparation) ; une fiche absente vaut « pas pu lire », jamais « aucun R1 ».
  const r1 = deriveR1Recap({
    meetingStart,
    recaps: factsBrief?.meetings ?? null,
    needs: factsBrief?.needs ?? null,
  })
  const pitch = deriveMeetingPitch({
    esnName: esnProfile?.esn_name ?? null,
    offers: esnProfile?.expertise_areas ?? [],
    stakes: [...stakes],
    rex: rex.kind === 'found' ? (rex.items[0] ?? null) : null,
    accountName: accountName ?? null,
    meetingType,
  })
  return { rex, r1, pitch, flow: deriveMeetingFlow(meetingType) }
}

/**
 * #4424 — R2 si un R1 a déjà eu lieu sur ce compte (un compte rendu existe,
 * même règle de dérivation que `deriveR1Recap`), sinon R1. « Pas pu lire » ne
 * vaut pas « un R1 a eu lieu ».
 */
export function suggestR1R2Type(r1: R1Recap): 'r1_discovery' | 'r2_workshop' {
  return r1.kind === 'found' ? 'r2_workshop' : 'r1_discovery'
}

/** `accounts.it_challenges` — même permissivité, même prudence. */
export function readAccountStakes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap(item => {
    if (typeof item !== 'object' || item === null) return []
    const row = item as Record<string, unknown>
    const title = typeof row.title === 'string' ? row.title.trim() : ''
    return title ? [title] : []
  })
}
