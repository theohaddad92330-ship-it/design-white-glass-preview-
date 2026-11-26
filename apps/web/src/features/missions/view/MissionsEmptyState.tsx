import { Box, Button, EmptyState } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Briefcase } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePipeline } from '@/features/projects/hooks/usePipeline'
import { CrmReprisalProposal } from './CrmReprisalProposal'

/**
 * L'état vide de « Missions › En cours » — il DIT d'où vient une mission, et il
 * OFFRE le chemin qui y mène.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI
 * ─────────────────────────────────────────────────────────────────────────
 * Retour bêta du 27/08 (issue #1127). Devant l'onglet vide, la question posée
 * a été : « il faut d'abord ajouter des consultants en vivier avant d'ajouter
 * des missions ? ». Le modèle est AUTRE — une mission naît d'un projet
 * **signé** : `create_mission` est le seul effet de déplacement exécuté par le
 * serveur au passage d'un projet en `won`, et il appelle `DeliveryService.create`
 * (`projects.controller.ts` → `delivery.service.ts`). Le vivier n'entre nulle
 * part dans ce chemin.
 *
 * Le texte NOMMAIT déjà l'origine (« dès qu'un projet est signé ») ; ce qui
 * manquait, c'est le CHEMIN depuis l'endroit où la question se pose. Une
 * réponse juste, calculée, sans porte, se relit comme une devinette.
 *
 * ⚠️ **La porte dépend de ce que l'espace contient, et c'est le cœur du
 * correctif.** Envoyer vers le pipe un espace qui n'a aucun projet ne ferait
 * que déplacer le vide d'un écran à l'autre — la chaîne complète est
 * `analyse de compte → projet → projet signé → mission`, et on ouvre la porte
 * du maillon qui manque, pas celle du maillon suivant.
 *
 * ⚠️ **Tant que le pipe n'est pas LU, aucune porte contextuelle n'est
 * proposée.** Un « aucun projet » affirmé pendant le chargement serait faux
 * une fois sur deux, et une mauvaise porte est pire que pas de porte (cause
 * racine connue : « un zéro de chargement ment »).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * #2557.1 — LE GESTE DE CRÉATION, LUI, NE DÉPEND D'AUCUNE LECTURE
 * ─────────────────────────────────────────────────────────────────────────
 * Retour bêta du 17/09/2026 (François Thomas) : devant l'onglet vide, il n'a
 * pas trouvé comment créer une mission. La porte contextuelle ci-dessus
 * reste utile (elle dit D'OÙ vient une mission), mais elle dépend du pipe et
 * peut être absente pendant un chargement ou après une erreur — exactement
 * les deux cas où `door` est `null`. Le geste de création, lui, ne dépend de
 * rien de tout ça : `/missions/nouvelle` est TOUJOURS offert, en plus de la
 * porte contextuelle quand elle existe.
 */
/** La porte à ouvrir, ou `null` tant qu'on ne sait pas laquelle serait juste. */
type Door = { description: string; to: '/projects' | '/search'; cta: string }

/**
 * ⚠️ `finishedCount` existe parce que la première version de cet écran s'en
 * passait, et ratait le cas EXACT du retour bêta #1127.
 *
 * Elle raisonnait ainsi : « des missions existent, elles sont finies, donc la
 * question "d'où vient une mission ?" ne se pose pas ici. » C'est défendable en
 * théorie et faux en fait — Louis a posé cette question précisément dans cet
 * état, avec une mission terminée à son compteur. Avoir eu une mission finie ne
 * dit pas comment on crée la suivante.
 *
 * Le compteur ne change donc que le TITRE et le rappel de ce qui est masqué :
 * la porte, elle, s'ouvre dans les deux cas.
 */
export function MissionsEmptyState({ finishedCount = 0 }: { finishedCount?: number }) {
  const { t } = useTranslation('missions')
  const { data: summary, isLoading, isError } = usePipeline()

  let door: Door | null = null
  if (!isLoading && !isError && summary) {
    const signed = summary.columns.find(column => column.stage === 'won')?.count ?? 0
    // `intake` compte les projets DÉTECTÉS que personne n'a encore repris. Ils
    // sont des projets : les ignorer enverrait vers une première analyse un
    // espace qui a déjà de quoi remplir son pipe.
    const hasProject = summary.total_count > 0 || summary.intake > 0

    if (signed > 0) {
      // Des projets sont signés et aucune mission ne tourne : la porte mène au
      // pipe, où le projet signé se retrouve.
      door = {
        description: t('states.emptySignedDescription', { count: signed }),
        to: '/projects',
        cta: t('states.emptyProjectsCta'),
      }
    } else if (hasProject) {
      door = {
        description: t('states.emptyNoneSignedDescription'),
        to: '/projects',
        cta: t('states.emptyProjectsCta'),
      }
    } else {
      // Aucun projet : le pipe serait vide lui aussi. On remonte d'un maillon,
      // jusqu'à l'analyse de compte — c'est de là que naissent les projets.
      door = {
        description: t('states.emptyNoProjectDescription'),
        to: '/search',
        cta: t('states.emptyAnalyseCta'),
      }
    }
  }

  return (
    <Box display="flex" className="flex-col items-center gap-4">
      <EmptyState
        title={finishedCount > 0 ? t('states.allFinishedTitle') : t('states.emptyTitle')}
        // À défaut de savoir, on nomme l'origine sans rien affirmer du pipe.
        // Quand des missions terminées existent, on le DIT d'abord — sinon
        // « aucune mission » au-dessus d'un espace qui en compte se lit comme une
        // panne de lecture — puis on nomme quand même l'origine de la suivante.
        description={
          finishedCount > 0
            ? `${t('states.allFinishedDescription', { count: finishedCount })} ${door?.description ?? t('states.emptyDescription')}`
            : (door?.description ?? t('states.emptyDescription'))
        }
        icon={<Briefcase className="size-7" />}
        action={
          // `Link` et non un `div` cliquable : ce qui se clique se tabule
          // (GA-35), et un vrai `href` s'ouvre aussi au clic du milieu.
          <Box display="flex" className="flex-col items-center gap-2 sm:flex-row">
            {/* #2557.1 — le geste de création est TOUJOURS offert, qu'une
                porte contextuelle existe ou non : la recette est « un espace
                sans mission crée sa première mission sans aide extérieure ». */}
            <Button asChild size="sm">
              <Link to="/missions/nouvelle">{t('states.emptyCreateCta')}</Link>
            </Button>
            {door ? (
              <Button asChild size="sm" variant="outline">
                <Link to={door.to}>{door.cta}</Link>
              </Button>
            ) : undefined}
          </Box>
        }
      />
      {/* #2562 — la proposition de reprise depuis le CRM connecté, quand
          l'espace en a une à faire : ne s'affiche RIEN tant qu'il n'y a rien
          à proposer (voir `CrmReprisalProposal`). */}
      <CrmReprisalProposal />
    </Box>
  )
}
