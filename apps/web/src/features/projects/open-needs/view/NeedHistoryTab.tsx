import type { OpenNeedRow } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/lib/locale'
import { useNeedDocuments } from '../hooks/useNeedDocuments'
import { useNeedHistory } from '../hooks/useNeedHistory'
import { useNeedStatusHistory } from '../hooks/useNeedStatusHistory'
import { useNeedSteps } from '../hooks/useNeedSteps'

/**
 * L'onglet HISTORIQUE d'une fiche besoin (dossier du 26/08, image 02) : ce qui
 * a été journalisé sur ce besoin, le plus récent d'abord.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE SOURCES, ET AUCUNE REQUÊTE DE PLUS (31/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * L'onglet ne montrait que les FRANCHISSEMENTS DE PORTE
 * (`DecisionGatesService.forSubject`, sujet `need`) — ce qui laissait croire à
 * un audit complet alors qu'il n'en rendait qu'un quart. Ce lot le complète
 * avec ce qui est RÉELLEMENT daté ailleurs sur la fiche, sans ouvrir une seule
 * lecture neuve : les trois hooks ci-dessous sont ceux que les autres onglets
 * montent déjà, et TanStack Query dédoublonne sur la clé de cache.
 *
 *  1. **les portes franchies** — la décision, son motif, et ce qui MANQUAIT au
 *     moment de décider ;
 *  2. **l'entrée dans l'état COURANT** — `need.status_changed_at`, avec son
 *     motif quand l'état en exige un. UNE seule ligne, et c'est tout ce que la
 *     base sait : voir ci-dessous ;
 *  3. **les étapes cochées** — `NeedStep.doneAt`, la date où quelqu'un a
 *     déclaré l'étape faite ;
 *  4. **les documents ouverts** — `NeedDocument.createdAt`, la date où le
 *     document a commencé à être suivi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUI N'EST PAS JOURNALISÉ — ET C'EST DIT À L'ÉCRAN
 * ─────────────────────────────────────────────────────────────────────────────
 * Un onglet nommé « Historique » qui rend quatre sources se lit comme un
 * journal complet. Il ne l'est pas, et trois manques sont RÉELS :
 *
 *  · ⚠️ #2967 (lot V39) — CE MANQUE EST REFERMÉ depuis le 25/09/2026 : les
 *    états successifs sont journalisés dans `commercial_transitions` et lus
 *    ici (`useNeedStatusHistory`). Ce qui suit reste vrai AVANT cette date :
 *  · **les états successifs.** `project_needs.status_changed_at` est ÉCRASÉE à
 *    chaque transition : la base connaît la date d'entrée dans l'état COURANT,
 *    et rien d'autre. « Ce besoin est passé en shortlist le 12, puis chez le
 *    client le 19 » est une information que personne ne peut rendre — et une
 *    frise qui la suggérerait serait une frise inventée ;
 *  · **les modifications de champ** — TJM, compétences, échéance, urgence,
 *    porteur. Elles s'écrivent en place, sans trace. C'est la même absence, sur
 *    d'autres colonnes ;
 *  · **QUI a fait quoi.** Aucune des quatre sources ne porte d'auteur : ni un
 *    franchissement de porte, ni une étape cochée, ni un document. Afficher un
 *    nom demanderait de le deviner.
 *
 * Le dire vaut mieux qu'un journal qui a l'air complet : quelqu'un qui cherche
 * « pourquoi ce TJM a-t-il changé » doit apprendre en trois secondes que la
 * réponse n'est nulle part, plutôt que de fouiller une frise dix minutes.
 *
 * ⚠️ Distinct de « Notes & activités » : ce fil-ci ne porte que des faits
 * STRUCTURÉS et datés — pas les appels, e-mails et notes libres, qui restent
 * sur l'autre onglet, et au périmètre du PROJET.
 */
type HistoryEntry = {
  key: string
  at: string
  title: string
  detail: string | null
  /** Ce qui manquait au moment de décider — la seule ligne d'alerte du fil. */
  missing: string | null
}

export function NeedHistoryTab({ need }: { need: OpenNeedRow }) {
  const { t } = useTranslation('projects')
  const { crossings, isLoading, isError } = useNeedHistory(need.id)
  // Les DEUX autres sources datées de la fiche. Leur échec n'empêche PAS
  // l'historique : l'onglet rend ce qu'il a pu lire, et il n'a jamais promis
  // que ces lignes existeraient. Confondre « aucune étape cochée » et « je n'ai
  // pas pu lire les étapes » ferait de chaque panne un fait.
  const steps = useNeedSteps(need.id)
  const documents = useNeedDocuments(need.id)
  // #2967 (lot V39) — la CINQUIÈME source : les changements d'état journalisés
  // (`commercial_transitions`, depuis le 25/09/2026). Même tolérance que les
  // deux lectures ci-dessus : son échec n'empêche pas le reste du fil.
  const transitions = useNeedStatusHistory(need.id)

  if (isLoading) {
    return (
      <Text size="sm" className="text-[var(--bellum-text-muted)]">
        {t('needSheet.history.loading')}
      </Text>
    )
  }

  if (isError) {
    return (
      <Box className="rounded-md border border-dashed border-destructive/40 p-4">
        <Text size="sm" className="text-[var(--bellum-text-muted)]">
          {t('needSheet.history.readError')}
        </Text>
      </Box>
    )
  }

  const entries: HistoryEntry[] = [
    ...crossings.map(crossing => ({
      key: `gate-${crossing.id}`,
      at: crossing.created_at,
      title: crossing.gate,
      detail: t(`needSheet.history.decision.${crossing.decision}`) + (crossing.reason ? ` — ${crossing.reason}` : ''),
      missing:
        crossing.missing.length > 0 ? t('needSheet.history.missing', { list: crossing.missing.join(', ') }) : null,
    })),
    // #2967 — LES ÉTATS SUCCESSIFS, lus dans le journal : de→vers, preuve, et
    // la SOURCE (Laura propose, l'humain valide ; une correction prime).
    ...transitions.items.map(line => ({
      key: `transition-${line.id}`,
      at: line.occurredAt,
      title: line.fromState
        ? t('needSheet.history.statusTransition', {
            from: t(`needStatus.${line.fromState}`, { defaultValue: line.fromState }),
            to: t(`needStatus.${line.toState}`, { defaultValue: line.toState }),
          })
        : t('needSheet.history.statusFirst', { to: t(`needStatus.${line.toState}`, { defaultValue: line.toState }) }),
      detail:
        [line.source === 'human' ? null : t(`needSheet.history.source.${line.source}`), line.proof]
          .filter(Boolean)
          .join(' — ') || null,
      missing: null,
    })),
    // L'ÉTAT COURANT — une seule ligne, jamais une frise : la colonne est
    // écrasée à chaque transition. Tue quand le journal ci-dessus porte déjà
    // les états successifs : la même entrée n'apparaît jamais deux fois (GA-26).
    ...(need.status_changed_at && transitions.items.length === 0
      ? [
          {
            key: 'status',
            at: need.status_changed_at,
            title: t('needSheet.history.statusEntered', { status: t(`needStatus.${need.status}`) }),
            detail: need.status_reason,
            missing: null,
          },
        ]
      : []),
    // Une étape COCHÉE est datée ; une étape à faire ne l'est pas, et elle n'a
    // donc rien à faire dans un historique.
    ...steps.items.flatMap(step =>
      step.doneAt
        ? [
            {
              key: `step-${step.id}`,
              at: step.doneAt,
              title: t('needSheet.history.stepDone'),
              detail: step.label,
              missing: null,
            },
          ]
        : [],
    ),
    ...documents.items.map(document => ({
      key: `doc-${document.id}`,
      at: document.createdAt,
      title: t('needSheet.history.documentAdded', { kind: t(`needSheet.documents.kind.${document.kind}`) }),
      // Le statut est celui d'AUJOURD'HUI, pas celui du jour de l'ajout : le
      // dire évite de lire « signé le 3 » sur un document signé le 20.
      detail: t('needSheet.history.documentStatusToday', {
        status: t(`needSheet.documents.status.${document.status}`),
      }),
      missing: null,
    })),
  ]
    // Une date illisible ne se range nulle part : la jeter vaut mieux que de la
    // ranger au hasard en tête ou en pied du fil.
    .filter(entry => !Number.isNaN(new Date(entry.at).getTime()))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <Box className="space-y-2">
      {entries.length === 0 ? (
        <Box className="rounded-md border border-dashed border-border p-4">
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('needSheet.history.empty')}
          </Text>
        </Box>
      ) : (
        entries.map(entry => (
          <Box key={entry.key} className="rounded-md border border-border bg-card p-3">
            <Box display="flex" className="flex-wrap items-center justify-between gap-2">
              <Text element="span" size="sm" weight="medium">
                {entry.title}
              </Text>
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {formatDate(entry.at)}
              </Text>
            </Box>
            {entry.detail ? (
              <Text element="span" size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
                {entry.detail}
              </Text>
            ) : null}
            {entry.missing ? (
              <Text element="span" size="xs" className="mt-1 block text-[var(--warning-soft-text)]">
                {entry.missing}
              </Text>
            ) : null}
          </Box>
        ))
      )}

      {/* ⚠️ CE QUE CE FIL NE SAIT PAS. Écrit à l'écran, sous les lignes, et pas
          seulement en commentaire : un onglet nommé « Historique » se lit comme
          un audit complet, et quelqu'un qui cherche « pourquoi ce TJM a-t-il
          changé » doit apprendre en trois secondes que la réponse n'est nulle
          part — plutôt que de fouiller une frise dix minutes. */}
      <Text size="xs" className="block text-[var(--bellum-text-muted)]">
        {t('needSheet.history.notJournalled')}
      </Text>
    </Box>
  )
}
