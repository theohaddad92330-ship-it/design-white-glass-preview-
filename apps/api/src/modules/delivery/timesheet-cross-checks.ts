import type { EntityManager } from 'typeorm'

/**
 * LES DEUX LECTURES CROISÉES D'UN RELEVÉ — à un seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ces deux requêtes servent à DEUX moments qui ne se ressemblent pas :
 *
 *  · au DÉPÔT (`DeliveryService.submitTimesheet`), pour écrire la phrase
 *    d'anomalie qui restera archivée sur la ligne ;
 *  · à la RELECTURE (`TimesheetsService.review`), pour dire au valideur ce qui a
 *    pu être vérifié — et ce qui ne l'a pas été.
 *
 * Ce sont deux usages, mais **un seul prédicat**. Recopié dans le second
 * service, il aurait divergé du premier au premier ajustement : un relevé
 * déposé sans chevauchement s'afficherait « chevauchement détecté » à la
 * relecture, ou l'inverse — et celui des deux qu'on croit décide de ce qu'on
 * facture. C'est le défaut « une dérivation refaite à deux endroits », déjà payé
 * ici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ TROIS ISSUES, JAMAIS DEUX
 * ─────────────────────────────────────────────────────────────────────────────
 * `unreadable` est la raison d'être de la forme de retour. Un `catch` qui rend
 * `null` est indiscernable d'une lecture réussie qui n'a rien trouvé — et la
 * seconde est une GARANTIE, que la première n'a pas produite. « Cassé » et
 * « rien trouvé » ne se rendent jamais pareil.
 *
 * Le module ne journalise rien lui-même : c'est l'appelant qui a le logger et le
 * contexte (mission, consultant), et deux journalisations pour un incident se
 * lisent comme deux incidents.
 */

/** Ce que la lecture a trouvé, n'a pas trouvé, ou n'a pas pu lire. */
export type CrossCheckOutcome<T> = { status: 'none' } | { status: 'found'; value: T } | { status: 'unreadable' }

/** L'autre mission qui occupe ce consultant sur le même mois. */
export interface OverlappingMission {
  missionLabel: string | null
  consultantName: string | null
  from: string
  to: string | null
}

/** Un autre relevé, sur cette mission et ce mois, déjà validé par le client. */
export interface DuplicateValidatedTimesheet {
  consultantName: string | null
  validatedAt: string | null
}

/**
 * Ce consultant est-il AUSSI affecté ailleurs sur ce mois ?
 *
 * Le relevé porte sur UNE mission ; si le consultant en a une autre sur la même
 * période, les jours ont pu se partager entre deux relevés sans que rien ne le
 * dise. C'est un SIGNAL, jamais un refus.
 */
export async function overlappingMissionAssignment(
  manager: EntityManager,
  scope: { workspaceId: string; missionId: string; consultantId: string; periodMonth: string },
): Promise<CrossCheckOutcome<OverlappingMission>> {
  try {
    const rows = await manager.query<
      { mission_label: string | null; consultant_name: string | null; starts_on: string; ends_on: string | null }[]
    >(
      `SELECT m.label AS mission_label, c.full_name AS consultant_name, ma.starts_on, ma.ends_on
         FROM mission_assignments ma
         JOIN missions m ON m.id = ma.mission_id
         LEFT JOIN consultants c ON c.id = ma.consultant_id
        WHERE ma.consultant_id = $1::uuid
          AND ma.mission_id <> $2::uuid
          AND m.workspace_id = $3::uuid
          AND ma.starts_on <= ($4::date + interval '1 month' - interval '1 day')
          AND (ma.ends_on IS NULL OR ma.ends_on >= $4::date)
        ORDER BY ma.starts_on
        LIMIT 1`,
      [scope.consultantId, scope.missionId, scope.workspaceId, scope.periodMonth],
    )
    const row = rows?.[0]
    if (!row) return { status: 'none' }
    return {
      status: 'found',
      value: {
        missionLabel: row.mission_label,
        consultantName: row.consultant_name,
        from: row.starts_on,
        to: row.ends_on,
      },
    }
  } catch {
    return { status: 'unreadable' }
  }
}

/**
 * Un AUTRE relevé, sur CETTE mission et CE mois, déjà VALIDÉ par le client.
 *
 * La maille est mission × consultant : deux consultants sur une mission
 * déposent deux relevés, légitimement. Mais un relevé qui arrive APRÈS qu'un
 * autre a été validé est indistinguable d'un second consultant réellement
 * staffé — c'est le doublon qui passe. `IS DISTINCT FROM` exclut le relevé du
 * MÊME consultant (`null` compris) : ce cas-là est tranché ailleurs, par le
 * refus de réécrire un relevé validé.
 */
export async function duplicateValidatedTimesheet(
  manager: EntityManager,
  scope: { missionId: string; periodMonth: string; consultantId: string | null },
): Promise<CrossCheckOutcome<DuplicateValidatedTimesheet>> {
  try {
    const rows = await manager.query<
      { consultant_name: string | null; validated_by_client_at: Date | string | null }[]
    >(
      `SELECT c.full_name AS consultant_name, ts.validated_by_client_at
         FROM mission_timesheets ts
         LEFT JOIN consultants c ON c.id = ts.consultant_id
        WHERE ts.mission_id = $1::uuid
          AND ts.period_month = $2::date
          AND ts.status = 'validated'
          AND ts.consultant_id IS DISTINCT FROM $3::uuid
        ORDER BY ts.validated_by_client_at DESC NULLS LAST
        LIMIT 1`,
      [scope.missionId, scope.periodMonth, scope.consultantId],
    )
    const row = rows?.[0]
    if (!row) return { status: 'none' }
    return {
      status: 'found',
      value: {
        consultantName: row.consultant_name,
        validatedAt: row.validated_by_client_at
          ? new Date(row.validated_by_client_at).toISOString().slice(0, 10)
          : null,
      },
    }
  } catch {
    return { status: 'unreadable' }
  }
}
