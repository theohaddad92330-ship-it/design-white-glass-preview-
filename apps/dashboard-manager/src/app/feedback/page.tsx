import Link from 'next/link'
import { dureeEcoulee } from '@/lib/dates'
import { fetchFeedback, type FeedbackItem } from '@/lib/feedback'
import { FeedbackCard } from './_components/feedback-card'
import { FeedbackEcranFilter } from './_components/feedback-ecran-filter'
import { ECRAN_TOUS, matchEcranFiltre, optionsFiltreEcran } from './_components/feedback-ecran-filter.logic'
import {
  MIN_RETOURS_POUR_UNE_MEDIANE,
  delaiDeReponse,
  grouperParEcran,
  medianeDesDelais,
  type DelaiReponse,
} from './feedback.logic'

export const dynamic = 'force-dynamic'

type Filter = 'open' | 'closed' | 'all'
type Vue = 'date' | 'ecran'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'open', label: 'À traiter' },
  { key: 'closed', label: 'Traités' },
  { key: 'all', label: 'Tous' },
]

export default async function FeedbackPage(props: {
  searchParams: Promise<{ state?: string; vue?: string; ecran?: string }>
}) {
  const searchParams = await props.searchParams
  const filter: Filter = searchParams.state === 'closed' ? 'closed' : searchParams.state === 'all' ? 'all' : 'open'
  // « pas SEULEMENT par date » (#1658.2) : la date reste le défaut — c'est la
  // lecture de suivi quotidien — et l'écran est la lecture d'analyse.
  const vue: Vue = searchParams.vue === 'ecran' ? 'ecran' : 'date'

  let items: FeedbackItem[] = []
  let issuesAvailable = false
  let responsesAvailable = false
  let error: string | null = null
  try {
    const data = await fetchFeedback(200)
    items = data.items
    issuesAvailable = data.issuesAvailable
    responsesAvailable = data.responsesAvailable
  } catch (e) {
    error = e instanceof Error ? e.message : 'Erreur inconnue'
  }

  const visible = items.filter(item => matches(item, filter, issuesAvailable))

  // #1673.3 — le filtre « écran concerné », absent avant ce lot. Les OPTIONS
  // (et leur compte) portent sur `visible` — déjà réduit par le filtre
  // d'état — pas sur `items` : le compte affiché doit être celui de ce qui
  // est réellement rendu, la même règle que `UsersTable` applique déjà à ses
  // pilules (« le compteur reste vrai : il porte sur ce qui est réellement
  // rendu, pas sur la liste complète »).
  const ecranOptions = optionsFiltreEcran(visible, 'Tous les écrans')
  const ecranAllowed = ecranOptions.map(o => o.key)
  const ecranFiltre = ecranAllowed.includes(searchParams.ecran ?? '') ? (searchParams.ecran as string) : ECRAN_TOUS
  const visibleEcran = visible.filter(item => matchEcranFiltre(item, ecranFiltre))
  // Les liens d'état et de vue GARDENT l'écran choisi — changer d'onglet ne
  // doit pas effacer un filtre qu'on vient de poser.
  const hrefEcranSuffix = ecranFiltre === ECRAN_TOUS ? '' : `&ecran=${encodeURIComponent(ecranFiltre)}`

  // ⚠️ L'horloge est lue UNE fois, ici, et passée en paramètre. Chaque carte qui
  // appellerait `new Date()` pour elle-même mesurerait un instant différent —
  // et sur un rendu serveur, deux instants différents de celui du navigateur.
  const maintenant = new Date()
  const delais = new Map<string, DelaiReponse>(
    visibleEcran.map(item => [item.id, delaiDeReponse(item, { maintenant, responsesAvailable })]),
  )
  const mediane = medianeDesDelais([...delais.values()])

  return (
    <main className="wrap">
      <h1>Retours bêta</h1>
      <p className="subtitle">
        Ce qui a été remonté (page, contexte, capture, corrélation) et ce qui en a été fait. L'état vient des issues
        GitHub : fermer ou répondre ici agit sur l'issue, pas sur une copie.
      </p>

      {!issuesAvailable && !error ? (
        <p style={{ color: 'var(--amber)', fontSize: 13 }}>
          L'état des issues n'a pas pu être lu (intégration éteinte ou GitHub muet). Les retours restent affichés, mais
          « traité » ou non ne peut pas être déterminé — le filtre « À traiter » les montre tous.
        </p>
      ) : null}

      {/* ⚠️ LE FILTRE ACTIF ÉTAIT INVISIBLE, mesuré en production le 07/09/2026 :
          `color: rgb(93,77,224)` sur `background: rgb(93,77,224)`, soit un
          contraste de **1,00:1**. Le libellé était bien dans le DOM, et personne
          ne pouvait le lire — sur le filtre par DÉFAUT, donc le premier écran
          que voit quiconque ouvre cette page.

          La cause : `.btn` a un fond ACCENT et un texte blanc ; la ligne
          ci-dessus repeignait son texte en accent. Le motif venait de `.btn-sm`,
          qui a un fond de surface et dont l'état actif EST une couleur accent —
          juste chez son voisin, faux ici.

          La réponse ne demande aucune couleur nouvelle : l'onglet INACTIF est un
          `ghost` (fond de surface, texte de texte), l'ACTIF est le `.btn` plein.
          C'est la pastille sélectionnée ordinaire, et les deux passent AA. */}
      <nav style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
        {FILTERS.map(({ key, label }) => (
          <Link
            key={key}
            href={`/feedback?state=${key}${vue === 'ecran' ? '&vue=ecran' : ''}${hrefEcranSuffix}`}
            className={key === filter ? 'btn' : 'btn ghost'}
            aria-current={key === filter ? 'page' : undefined}
          >
            {/* #1673.3 — le compte suit le filtre « écran » actif : cliquer un
                autre onglet d'état GARDE l'écran choisi (le lien le reporte,
                ci-dessus), donc ce chiffre doit être celui qu'on verrait
                réellement après le clic. */}
            {label} (
            {items.filter(item => matches(item, key, issuesAvailable) && matchEcranFiltre(item, ecranFiltre)).length})
          </Link>
        ))}
      </nav>

      {/* #1673.3 — le filtre « écran concerné », absent avant ce lot. Sous
          les onglets d'état : on affine D'ABORD par état, ENSUITE par écran. */}
      <FeedbackEcranFilter options={ecranOptions} />

      {!error ? (
        <section
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            margin: '0 0 16px',
          }}
        >
          <p style={{ margin: 0, fontSize: 13 }}>
            <strong>Délai de première réponse — médiane : </strong>
            <MedianeTexte mediane={mediane} />
          </p>
          <nav style={{ display: 'flex', gap: 6 }} aria-label="Regroupement">
            <Link href={`/feedback?state=${filter}${hrefEcranSuffix}`} className={vue === 'date' ? 'btn' : 'btn ghost'}>
              Par date
            </Link>
            <Link
              href={`/feedback?state=${filter}&vue=ecran${hrefEcranSuffix}`}
              className={vue === 'ecran' ? 'btn' : 'btn ghost'}
            >
              Par écran
            </Link>
          </nav>
        </section>
      ) : null}

      {error ? (
        <p style={{ color: 'var(--red)' }}>Impossible de charger les retours : {error}</p>
      ) : visibleEcran.length === 0 ? (
        <p className="empty">Aucun retour dans cette vue.</p>
      ) : vue === 'ecran' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {grouperParEcran(visibleEcran).map(groupe => (
            <section key={groupe.libelle}>
              <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>
                {groupe.libelle}{' '}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}>
                  · {groupe.items.length} retour{groupe.items.length > 1 ? 's' : ''}
                </span>
              </h2>
              {groupe.ecran === null ? (
                <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
                  Ces retours n'ont ni route applicative ni URL lisible — on ne leur devine pas un écran.
                </p>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {groupe.items.map(item => (
                  <FeedbackCard
                    key={item.id}
                    item={item}
                    issuesAvailable={issuesAvailable}
                    delai={delais.get(item.id) ?? INDECIDABLE}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {visibleEcran.map(item => (
            <FeedbackCard
              key={item.id}
              item={item}
              issuesAvailable={issuesAvailable}
              delai={delais.get(item.id) ?? INDECIDABLE}
            />
          ))}
        </div>
      )}
    </main>
  )
}

/**
 * Le repli quand un retour n'a pas de délai dans la table — un cas qui n'arrive
 * pas (la table est construite sur la même liste), écrit pour que le jour où il
 * arriverait, la carte se taise au lieu d'afficher un délai qui n'est pas le sien.
 */
const INDECIDABLE: DelaiReponse = { etat: 'inconnu', raison: 'délai non calculé pour ce retour' }

/**
 * La médiane, en toutes lettres.
 *
 * ⚠️ « Trop peu de retours » N'EST PAS un chiffre déguisé : sous
 * {@link MIN_RETOURS_POUR_UNE_MEDIANE} réponses, une médiane est la moyenne de
 * deux valeurs qui bouge de moitié à chaque nouvelle réponse — et elle se lirait
 * pourtant comme un délai typique.
 */
function MedianeTexte({ mediane }: { mediane: ReturnType<typeof medianeDesDelais> }) {
  if (mediane.etat === 'mesuree') {
    return (
      <>
        {dureeEcoulee(mediane.msEcoules)}{' '}
        <span style={{ color: 'var(--muted)' }}>sur {mediane.retenus} retours répondus</span>
      </>
    )
  }
  if (mediane.etat === 'inconnue') {
    return <span style={{ color: 'var(--muted)' }}>non mesurable — {mediane.raison}</span>
  }
  return (
    <span style={{ color: 'var(--muted)' }}>
      trop peu de retours répondus ({mediane.retenus} sur {MIN_RETOURS_POUR_UNE_MEDIANE} requis)
    </span>
  )
}

/**
 * Ce qui entre dans une vue.
 *
 * Deux décisions d'honnêteté : un retour SANS issue (intégration éteinte au
 * moment du signalement) reste « à traiter » — il n'a été traité nulle part ;
 * et quand l'état des issues est illisible, on montre tout plutôt que de
 * classer au hasard.
 */
function matches(item: FeedbackItem, filter: Filter, issuesAvailable: boolean): boolean {
  if (filter === 'all') return true
  if (!issuesAvailable) return filter === 'open'
  const state = item.issue?.state ?? 'open'
  return filter === 'closed' ? state === 'closed' : state === 'open'
}
