import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ROUTE_ACCESS_STATES, type RouteAccess, type RouteAccessState } from '@bellum/contracts'

/**
 * GA-78 / GA-79 — le bandeau de capacité : un geste, et une seule forme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET CE QU'ELLE A COÛTÉ DE NE PAS L'AVOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Tome 7, loi 2 #5 : « un seul bandeau de capacité par écran, qui NOMME l'action
 * bloquée ». Le composant existe depuis le chantier du PDF 1
 * (`components/access/CapabilityBanner.tsx`), il est testé — et il a vécu des
 * semaines avec **zéro appelant**, pendant que le produit portait onze variantes
 * de « cet écran ne sert pas ». C'est le défaut n°1 de ce dépôt : du code juste
 * que personne n'appelle.
 *
 * Deux règles distinctes, donc deux gardes :
 *
 *  - **GA-78** — chacun des états du bandeau porte un GESTE, ou figure dans une
 *    liste d'exceptions NOMMÉE avec sa raison. Le docblock du composant
 *    promettait « quatre GESTES distincts » et n'en rendait aucun ; c'est
 *    exactement le défaut que la source appelle « une bannière sans destinataire
 *    ni geste ». La liste des états est lue DANS LE CONTRAT : un cinquième état
 *    ajouté demain fait parler cette garde, au lieu de passer inaperçu.
 *
 *  - **GA-79** — les écrans qui annoncent une capacité manquante passent par le
 *    composant, et n'en redessinent pas un à côté. Une liste qui ne peut que
 *    grandir : un écran migré qui régresse vers son propre encadré fait rougir
 *    la CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE COUVRE PAS — dit ici plutôt que sous-entendu
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne détecte PAS un nouvel encadré ad hoc sur un écran qui n'a jamais été
 * migré : reconnaître « ceci est un bandeau de capacité » dans du JSX quelconque
 * demanderait de reconnaître un objet métier dans une balise, ce que ce dépôt a
 * déjà refusé de faire pour la loi 4. Quatre bandeaux ad hoc restent recensés au
 * §12.6 du tracker (`PlanFeatureLocked`, `BlockStateNotice`, et les deux avis de
 * Découvrir), chacun avec sa raison de ne pas être migré ici. Le silence de
 * cette garde sur eux n'est donc pas une preuve, et c'est écrit.
 */

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => createElement('a', { href: to }, children),
}))

const { CapabilityBanner } = await import('@/components/access/CapabilityBanner')

const WEB_SRC = join(__dirname, '..')

/** Retire les commentaires : un docblock qui EXPLIQUE la règle la cite. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Le détecteur de montage.
 *
 * ⚠️ Le caractère qui suit le nom est OBLIGATOIRE. Un `includes('<CapabilityBanner')`
 * accepterait `<CapabilityBannerLegacy`, c'est-à-dire exactement le contournement
 * que cette garde existe pour interdire — le piège a déjà été payé cette semaine
 * sur une autre garde.
 */
function mountsTheBanner(source: string): boolean {
  return /<CapabilityBanner[\s/>]/.test(stripComments(source))
}

// ─────────────────────────────────────────────────────────────────────────────
// GA-78 — chaque état porte son geste
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les états SANS geste, et pourquoi.
 *
 * `permission` : il n'existe aucun écran où s'accorder un droit qu'on n'a pas.
 * Le destinataire du geste est une PERSONNE — « demande l'accès à un responsable
 * de ton espace » — et la description le nomme déjà. Un bouton qui ne répare
 * rien est pire qu'un message nu ; la phrase est celle du dépôt, écrite sur
 * l'échec de lecture du CRM (`CrmDataPanel.tsx`).
 */
const STATES_WITHOUT_GESTURE: readonly RouteAccessState[] = ['permission']

/** La destination attendue, état par état. `ready` ne rend rien du tout. */
const DESTINATIONS: Record<string, string> = {
  plan_locked: '/billing',
  no_integration: '/integrations',
  degraded: '/integrations',
}

function renderState(state: RouteAccessState) {
  const access: RouteAccess = { state, missing: [] }
  return render(createElement(CapabilityBanner, { access }))
}

describe('GA-78 — la garde LIT quelque chose', () => {
  it('les états viennent du CONTRAT, et il y en a plus d’un', () => {
    // Sans ça, un enum vidé rendrait la boucle ci-dessous verte sur zéro tour.
    expect(ROUTE_ACCESS_STATES.length).toBeGreaterThan(1)
    expect([...ROUTE_ACCESS_STATES]).toContain('ready')
  })

  it('l’exception reste UNE exception — pas une liste où l’on range les gênants', () => {
    expect(STATES_WITHOUT_GESTURE).toHaveLength(1)
    for (const state of STATES_WITHOUT_GESTURE) expect([...ROUTE_ACCESS_STATES]).toContain(state)
  })

  it('chaque état non servi est soit une destination connue, soit une exception écrite', () => {
    // La table des destinations et la liste d'exceptions doivent, ensemble,
    // couvrir tout le contrat : un cinquième état ne peut pas se glisser sans
    // qu'on décide de son geste.
    const covered = new Set([...Object.keys(DESTINATIONS), ...STATES_WITHOUT_GESTURE, 'ready'])
    expect([...ROUTE_ACCESS_STATES].filter(state => !covered.has(state))).toEqual([])
  })
})

describe('GA-78 — chaque état porte son geste', () => {
  it('un état non servi rend un geste, et il mène là où il dit', () => {
    const offenders: string[] = []
    for (const state of ROUTE_ACCESS_STATES) {
      if (state === 'ready' || STATES_WITHOUT_GESTURE.includes(state)) continue
      const { container, unmount } = renderState(state)
      const link = container.querySelector('a')
      if (link?.getAttribute('href') !== DESTINATIONS[state]) {
        offenders.push(`${state} → ${link?.getAttribute('href') ?? 'aucun geste'}`)
      }
      unmount()
    }
    expect(offenders).toEqual([])
  })

  it('un état exempté n’en rend AUCUN — l’exception se voit à l’écran, pas seulement au commentaire', () => {
    for (const state of STATES_WITHOUT_GESTURE) {
      const { container, unmount } = renderState(state)
      expect(`${state}: ${container.querySelectorAll('a, button').length}`).toBe(`${state}: 0`)
      unmount()
    }
  })

  it('`ready` ne rend rien — un bandeau qui s’affiche toujours ne se lit plus', () => {
    const { container } = renderState('ready')
    expect(container).toBeEmptyDOMElement()
  })
})

describe('GA-78 — la garde sait dire NON', () => {
  it('un bandeau sans geste serait vu', () => {
    // Le rendu volontairement fautif : un encadré qui dit tout sauf quoi faire.
    const sansGeste = render(createElement('div', { role: 'status' }, 'Aucun outil connecté')).container
    expect(sansGeste.querySelector('a')).toBeNull()
    expect(sansGeste.querySelector('button')).toBeNull()
  })

  it('un geste qui mène ailleurs que là où il dit serait vu', () => {
    render(createElement(CapabilityBanner, { access: { state: 'plan_locked', missing: [] } }))
    expect(screen.getByRole('link')).not.toHaveAttribute('href', '/integrations')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// GA-79 — une seule forme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les écrans qui annoncent une capacité manquante par le composant partagé.
 *
 * Cette liste ne peut que GRANDIR. Elle est le cliquet : un écran qui reprendrait
 * son propre encadré ferait rougir la CI, et c'est le seul moyen d'empêcher les
 * onze variantes de repousser.
 */
const SCREENS_ON_THE_SHARED_BANNER = [
  'features/missions/view/TimesheetsPage.tsx',
  'features/outreach/view/SequencesPage.tsx',
  'features/mailbox/view/MailboxPage.tsx',
  'features/google/components/GoogleConnectNotice.tsx',
  'features/microsoft/components/MicrosoftConnectNotice.tsx',
] as const

describe('GA-79 — la garde LIT quelque chose', () => {
  it('les écrans surveillés existent et portent du code, pas seulement des commentaires', () => {
    expect(SCREENS_ON_THE_SHARED_BANNER.length).toBeGreaterThanOrEqual(5)
    for (const relative of SCREENS_ON_THE_SHARED_BANNER) {
      const stripped = stripComments(readFileSync(join(WEB_SRC, relative), 'utf8'))
      expect(`${relative}: ${stripped.trim().length > 200}`).toBe(`${relative}: true`)
    }
  })
})

describe('GA-79 — les écrans passent par le composant partagé', () => {
  it('chacun MONTE le bandeau', () => {
    const offenders = SCREENS_ON_THE_SHARED_BANNER.filter(
      relative => !mountsTheBanner(readFileSync(join(WEB_SRC, relative), 'utf8')),
    )
    expect(offenders).toEqual([])
  })
})

describe('GA-79 — la garde sait dire NON', () => {
  it('refuse un écran qui ne monte rien', () => {
    expect(mountsTheBanner('export function Ecran() { return <div>Rien</div> }')).toBe(false)
  })

  it('refuse un composant dont le nom COMMENCE par celui du bandeau', () => {
    // Le piège exact : `.includes('<CapabilityBanner')` dirait « oui » ici.
    expect(mountsTheBanner('<CapabilityBannerLegacy access={access} />')).toBe(false)
    expect(mountsTheBanner('<CapabilityBanner access={access} />')).toBe(true)
    expect(mountsTheBanner('<CapabilityBanner\n  access={access}\n/>')).toBe(true)
  })

  it('ne compte pas un montage cité dans un COMMENTAIRE', () => {
    // Trois gardes nées borgnes cette semaine lisaient de la prose.
    expect(mountsTheBanner('/** On monte ici un <CapabilityBanner /> un jour. */\nexport const x = 1')).toBe(false)
    expect(mountsTheBanner('// TODO: <CapabilityBanner access={a} />\nexport const x = 1')).toBe(false)
  })
})
