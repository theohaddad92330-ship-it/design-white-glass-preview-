import { Card, Text } from '@bellum/ui'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import type { ProjectLearningRow } from '@bellum/contracts'
import { GraduationCap } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { apiFetch } from '@/lib/api'
import { matchApplicationSectors } from '@/features/discover/lib/discover-sectors'
import { useSession } from '@/lib/hooks/use-session'
import { isReachable, knownDestinations } from '../quality/lib/destinations'

/* ------------------------------------------------------------------ */
/*  « Ce qui fonctionne le mieux chez toi » (restitution V2 §6,        */
/*  renommé par #1436).                                                */
/*                                                                     */
/*  Le §6 veut que chaque analyse améliore la base globale. Le graphe  */
/*  enregistrait déjà ce que les analyses PRODUISENT ; ce panneau      */
/*  montre le retour — ce que l'équipe en a fait — et c'est ce même    */
/*  agrégat qui part avec les prochains runs pour prioriser le plan.   */
/*                                                                     */
/*  Rien n'est modélisé : ce sont des cycles de vie déplacés à la      */
/*  main, comptés. Une équipe qui n'a rien déplacé lit « rien encore » */
/*  plutôt qu'une leçon fabriquée.                                     */
/* ------------------------------------------------------------------ */

/**
 * COMBIEN DE MOUVEMENTS FONT UNE TENDANCE — #1436.
 *
 * *« Ne jamais présenter un pattern avec un échantillon trop faible comme une
 * vérité statistique. »* Le garde-fou vient du retour lui-même, et il est juste :
 * un secteur avec UN besoin converti n'est pas un motif, c'est une anecdote — et
 * la phrase « {{brand}} priorisera davantage ce type de contexte » la
 * transformerait en règle.
 *
 * Trois, parce que c'est le plus petit nombre qui puisse se répéter : deux, on
 * hésite encore entre le hasard et l'habitude. Ce n'est pas un seuil statistique
 * — il n'y en a pas à trois observations — c'est le seuil en dessous duquel on
 * refuse d'AFFIRMER. Les patterns restent affichés avec leur compte ; ce qui
 * disparaît est la promesse de priorisation.
 */
const MIN_PATTERN_MOVES = 3

/**
 * Combien de besoins ce motif a réellement fait bouger — c'est l'« occurrence »
 * du retour, et elle s'affiche à côté du motif.
 */
function moves(row: ProjectLearningRow): number {
  return row.converted + row.transformed + row.obsolete
}

/**
 * Où vivent les besoins déplacés.
 *
 * Les trois comptages sortent de la MÊME requête (`projects.service.ts`, `FROM
 * opportunities o` filtré par `stage`) : convertis, transformés et obsolètes
 * sont trois issues d'une seule population, les besoins. Un seul écran les
 * porte, donc une seule destination — et non trois qui feraient croire à trois
 * listes différentes.
 */
const NEEDS_POPULATION = '/projects/needs'

/** Où l'on va chercher d'AUTRES comptes du même secteur. */
const DISCOVER_POPULATION = '/discover'

/**
 * Les cellules qui portent une issue, les plus documentées d'abord.
 *
 * ⚠️ **TROIS au plus** (#1436 : « afficher maximum 3 patterns réellement
 * observés »). Il en montrait huit — c'est-à-dire une liste, pas des motifs. Un
 * bloc qui prétend dire ce qui marche le mieux et en aligne huit ne dit plus
 * lequel marche le mieux.
 */
const MAX_PATTERNS = 3

function rank(rows: ProjectLearningRow[]): ProjectLearningRow[] {
  return rows
    .filter(row => moves(row) > 0)
    .sort((a, b) => b.converted - a.converted || b.transformed - a.transformed || b.obsolete - a.obsolete)
    .slice(0, MAX_PATTERNS)
}

export function WorkspaceLearningPanel() {
  const { t } = useTranslation('pilotage')
  const { user } = useSession()
  // L'arbre de routes RÉEL de ce navigateur — voir `quality/lib/destinations`.
  const router = useRouter()
  const known = useMemo(() => knownDestinations(router.routesByPath as unknown as Record<string, unknown>), [router])
  // La route s'appelle `/projects/learning` depuis T1. Cet appel visait encore
  // `/opportunities/learning` et rendait 404 : le panneau affichait donc « Rien
  // encore — la boucle reste muette tant qu'il n'y a rien à apprendre », une
  // phrase rassurante pour une requête qui n'aboutissait jamais.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['opportunity-learning', user?.id],
    queryFn: () => apiFetch<{ rows: ProjectLearningRow[] }>({ path: '/projects/learning' }),
    enabled: !!user,
    staleTime: 60_000,
  })

  if (isLoading) return null
  // Une lecture en échec n'est PAS « rien à apprendre » : se taire ici
  // reproduirait exactement le défaut qu'on vient de corriger.
  if (isError) return null
  const rows = rank(data?.rows ?? [])

  // ⚠️ La phrase de priorisation ne s'écrit QUE si un motif atteint le seuil.
  // Sous trois mouvements, elle promettrait une règle tirée d'une anecdote.
  const hasTrend = rows.some(row => moves(row) >= MIN_PATTERN_MOVES)

  return (
    <Card className="mt-6 p-4">
      <div className="flex items-center gap-2">
        <GraduationCap className="size-4 text-[var(--bellum-text-accent)]" />
        <Text size="sm" weight="semibold">
          {t('learning.title')}
        </Text>
      </div>
      {/* #1436 — CE QUE CES CHIFFRES SONT : la population, et la fenêtre.
          « Toujours afficher : période, nombre d'occurrences, données
          utilisées. » Vérifié dans la requête du serveur — elle ne filtre sur
          AUCUNE date : la fenêtre est donc tout l'historique de l'espace, et
          c'est écrit plutôt que sous-entendu. Annoncer « 90 jours » ici aurait
          été un chiffre faux sur une donnée juste. */}
      <Text size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
        {t('learning.dataUsed')}
      </Text>

      {rows.length === 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('learning.empty')}
        </Text>
      ) : (
        <>
          <div className="mt-3 flex flex-col gap-2">
            {rows.map(row => (
              <div
                key={`${row.sector ?? ''}|${row.offer ?? ''}|${row.kind}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[var(--bellum-border)] pt-2 first:border-0 first:pt-0"
              >
                <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {[row.sector, row.offer].filter(Boolean).join(' · ') || t('learning.unlabelled')}
                </Text>
                {/* L'OCCURRENCE, à côté du motif : « 10 conversions » ne veut
                    rien dire sans « sur 14 besoins déplacés ». */}
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {t('learning.occurrences', { count: moves(row) })}
                </Text>
                {/* Les comptages MÈNENT aux besoins qu'ils comptent. « 3
                    convertis » décrivait des objets réels — des besoins qu'un
                    humain a déplacés — et n'offrait aucun chemin vers eux. */}
                <span className="flex flex-wrap gap-x-3 text-xs tabular-nums text-[var(--bellum-text-muted)]">
                  {row.converted > 0 ? (
                    <Outcome label={t('learning.converted', { count: row.converted })} known={known} />
                  ) : null}
                  {row.transformed > 0 ? (
                    <Outcome label={t('learning.transformed', { count: row.transformed })} known={known} />
                  ) : null}
                  {row.obsolete > 0 ? (
                    <Outcome label={t('learning.obsolete', { count: row.obsolete })} known={known} />
                  ) : null}
                  <SimilarAccounts sector={row.sector} known={known} />
                </span>
              </div>
            ))}
          </div>
          {/* La promesse — vraie quand elle s'affiche : cet agrégat part
              RÉELLEMENT avec les prochaines analyses (`workspace-learning.ts`).
              Sous le seuil, on dit ce qu'on a, pas ce qu'on en déduira. */}
          <Text size="xs" className="mt-3 block text-[var(--bellum-text-secondary)]">
            {hasTrend ? t('learning.intro') : t('learning.tooFewMoves', { count: MIN_PATTERN_MOVES })}
          </Text>
        </>
      )}
    </Card>
  )
}

/**
 * « VOIR LES COMPTES SIMILAIRES » — quand le secteur est RECONNU, et pas avant.
 *
 * ⚠️ Le retour demande ce bouton (#1436). Le piège est que `row.sector` est un
 * texte LIBRE venu du compte (« Transport & logistique »), tandis que Découvrir
 * filtre sur les codes d'une taxinomie partagée. Passer le texte tel quel à
 * `?sectors=` aurait produit un lien qui n'applique AUCUN filtre : un compteur
 * juste sous un filtre faux, exactement le défaut qu'on corrige ailleurs.
 *
 * `matchApplicationSectors` fait la traduction et rend `[]` quand elle échoue —
 * et un secteur non reconnu n'a donc pas de lien. Le motif garde ses portes vers
 * les besoins qu'il compte, qui existent toujours.
 */
function SimilarAccounts({ sector, known }: { sector: string | null; known: ReadonlySet<string> }) {
  const { t } = useTranslation('pilotage')
  if (!sector) return null
  const codes = matchApplicationSectors([sector])
  if (codes.length === 0 || !isReachable(DISCOVER_POPULATION, known)) return null
  return (
    <Link
      to={DISCOVER_POPULATION}
      search={{ sectors: codes.join(',') }}
      aria-label={t('learning.seeSimilarAria', { sector })}
      className="rounded-md text-[var(--bellum-text-accent)] underline-offset-4 hover:underline"
    >
      {t('learning.seeSimilar')}
    </Link>
  )
}

/**
 * Une issue comptée, et la porte vers les besoins qu'elle compte.
 *
 * Ces liens vivent DANS une ligne de texte : ils restent à la hauteur de leur
 * ligne, l'exemption que GA-30 nomme — les agrandir casserait la ligne au lieu
 * de rendre la cible plus facile à toucher.
 */
function Outcome({ label, known }: { label: string; known: ReadonlySet<string> }) {
  const { t } = useTranslation('pilotage')
  if (!isReachable(NEEDS_POPULATION, known)) return <span>{label}</span>
  return (
    <Link
      to={NEEDS_POPULATION}
      // Trois liens qui se suivent vers la même liste doivent se distinguer à
      // l'oreille : le libellé visible entre dans le nom annoncé (WCAG 2.5.3).
      aria-label={t('population.openAria', { label })}
      className="rounded-md text-[var(--bellum-text-accent)] underline-offset-4 hover:underline"
    >
      {label}
    </Link>
  )
}
