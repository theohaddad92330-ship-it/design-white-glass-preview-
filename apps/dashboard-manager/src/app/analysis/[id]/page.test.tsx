import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANALYSE_COMPLETE, ANALYSE_EN_ECHEC, ANALYSE_PARTIELLE } from './_fixtures/analyses'
import { fetchTelemetryDetail } from '@/lib/telemetry'
import AnalysisDetailPage from './page'

/**
 * LE FILET DU DÉCOUPAGE de `analysis/[id]/page.tsx` (2 242 lignes).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * L'écran le plus gros du back-office n'avait AUCUN test de rendu, et le dépôt
 * n'avait aucun précédent de scission — le seul mouvement comparable est une
 * fusion, en sens inverse. « Découpage pur, aucun changement de comportement »
 * sans filet, c'est le genre de promesse qui se dément en réunion.
 *
 * CE QUE LE FILET COMPARE, ET POURQUOI PAS AUTRE CHOSE
 * Il compare le HTML RENDU, en entier, sur trois analyses contrastées. Un test
 * qui CHERCHE trois libellés ne compte pas : il resterait vert si l'ordre des
 * sections changeait, si un attribut disparaissait, si une valeur se rendait
 * « 0 » au lieu de « — ». L'instantané, lui, tombe sur le moindre octet — c'est
 * exactement la question posée : est-ce que la page rend LA MÊME CHOSE ?
 *
 * ⚠️ L'ORDRE DES SECTIONS FAIT PARTIE DU RENDU. Les blocs de cet écran sont
 * entrelacés (l'audit par phase s'intercale entre le vocabulaire du groupe et
 * l'organigramme, le grounding entre la concurrence et les entités). Un
 * découpage par THÈME qui rendrait les composants dans l'ordre des thèmes
 * changerait l'ordre à l'écran sans qu'aucune assertion de présence le voie.
 * L'instantané le voit.
 *
 * COMMENT LE FILET A SERVI
 * Instantanés écrits AVANT la scission, sur `page.tsx` d'origine ; la scission
 * a ensuite dû les faire passer sans `-u`. Un instantané régénéré avec `-u`
 * pendant un découpage ne prouve plus rien : c'est le geste à ne pas faire.
 */

/**
 * Le JSX du back-office est compilé par Next avec le runtime automatique ; le
 * lanceur de tests, lui, lit `jsx: "preserve"` du tsconfig et retombe sur le
 * runtime CLASSIQUE, qui appelle `React.createElement` sans importer React.
 * On fournit donc la fabrique que le build fournit d'habitude. Changer la
 * configuration du lanceur serait le geste propre — elle n'appartient pas à ce
 * lot, et un `globalThis` ici ne touche aucun fichier de production.
 */
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('@/lib/telemetry', () => ({ fetchTelemetryDetail: vi.fn() }))

// `LiveRefresh` est un composant client : il appelle `useRouter()` avant même
// de décider s'il rend quelque chose. Sans routeur, le rendu serveur casse.
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => undefined }) }))

const fetchDetail = vi.mocked(fetchTelemetryDetail)

type Detail = Awaited<ReturnType<typeof fetchTelemetryDetail>>

async function rendu(detail: unknown): Promise<string> {
  fetchDetail.mockResolvedValue(detail as Detail)
  return renderToStaticMarkup(await AnalysisDetailPage({ params: Promise.resolve({ id: 'peu-importe' }) }))
}

describe('le détail d’une analyse rend la même chose avant et après le découpage', () => {
  beforeEach(() => {
    fetchDetail.mockReset()
  })

  it('LIT quelque chose — les trois jeux sont contrastés, pas trois copies', () => {
    // Contrôle positif : trois jeux identiques rendraient trois instantanés
    // identiques, et le filet serait vert en ne gardant qu'un seul cas.
    expect(ANALYSE_COMPLETE.status).toBe('completed')
    expect(ANALYSE_EN_ECHEC.status).toBe('error')
    expect(ANALYSE_PARTIELLE.status).toBe('running')
    expect(ANALYSE_COMPLETE.topContacts.length).toBeGreaterThan(1)
    expect(ANALYSE_EN_ECHEC.topContacts).toEqual([])
    expect(ANALYSE_COMPLETE.rawAnalysis).not.toBeNull()
    expect(ANALYSE_EN_ECHEC.rawAnalysis).toBeNull()
  })

  it('une analyse COMPLÈTE — toutes les sections du dossier', async () => {
    const html = await rendu(ANALYSE_COMPLETE)
    // Le jeu doit vraiment allumer l'écran : un instantané de page vide serait
    // stable lui aussi, et ne garderait rien.
    expect(html.length).toBeGreaterThan(20000)
    expect(html).toMatchSnapshot()
  })

  it('une analyse en ÉCHEC — la phase d’arrêt et les états vides', async () => {
    const html = await rendu(ANALYSE_EN_ECHEC)
    expect(html.length).toBeGreaterThan(1000)
    expect(html).toMatchSnapshot()
  })

  it('une analyse PARTIELLE — champs absents, identité incertaine, suivi live', async () => {
    const html = await rendu(ANALYSE_PARTIELLE)
    expect(html.length).toBeGreaterThan(1000)
    expect(html).toMatchSnapshot()
  })

  it('le détail introuvable — la page rend son erreur, pas une page blanche', async () => {
    fetchDetail.mockRejectedValue(new Error('Telemetry endpoint returned 404 Not Found'))
    const html = renderToStaticMarkup(await AnalysisDetailPage({ params: Promise.resolve({ id: 'inconnu' }) }))
    expect(html).toMatchSnapshot()
  })

  it('les trois rendus sont bien DIFFÉRENTS entre eux', async () => {
    // Sans ce contrôle, trois instantanés identiques passeraient inaperçus et
    // le filet ne couvrirait qu'un seul chemin.
    const [complete, echec, partielle] = [
      await rendu(ANALYSE_COMPLETE),
      await rendu(ANALYSE_EN_ECHEC),
      await rendu(ANALYSE_PARTIELLE),
    ]
    expect(new Set([complete, echec, partielle]).size).toBe(3)
  })
})
