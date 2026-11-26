import { describe, expect, it } from 'vitest'

import { PAGES } from './pages'
import type { OverlaySpec } from './types'
import { validateOverlay, validateOverlays } from './validate'

/**
 * Le contrat des SURCOUCHES : une spec valide minimale, que chaque test casse d'UNE façon.
 */
const base = (): OverlaySpec => ({
  id: 'app/overlays/test-delete',
  surface: 'app',
  kind: 'confirm',
  parent: { page: 'app/accounts' },
  source: 'packages/ui/src/components/dialog.tsx:23',
  title: 'Supprimer ce compte ?',
  description: 'Le compte et ses analyses sont archivés.',
  destructive: true,
  viewports: ['desktop', 'mobile'],
  actions: [{ label: 'Annuler' }, { label: 'Supprimer le compte', variant: 'destructive' }],
  uxNotes: [
    {
      kind: 'decision',
      text: 'Focus sur « Annuler » à l’ouverture ; Échap ferme sans rien supprimer.',
      source: 'packages/ui/src/components/dialog.tsx:23',
    },
  ],
})

const broken = (patch: (o: Record<string, unknown>) => void): OverlaySpec => {
  const o = base() as unknown as Record<string, unknown>
  patch(o)
  return o as unknown as OverlaySpec
}

const errorsOf = (o: OverlaySpec): string => validateOverlay(o, PAGES).join('\n')

describe('validateOverlay', () => {
  it('accepte une surcouche conforme', () => {
    expect(validateOverlay(base(), PAGES)).toEqual([])
  })

  it('refuse un identifiant hors de `<surface>/overlays/…`', () => {
    expect(errorsOf(broken(o => (o.id = 'app/test-delete')))).toMatch(/identifiant/)
    expect(errorsOf(broken(o => (o.id = 'dm/overlays/x')))).toMatch(/identifiant/)
  })

  it('refuse une famille inconnue', () => {
    expect(errorsOf(broken(o => (o.kind = 'modal')))).toMatch(/famille inconnue « modal »/)
  })

  it('refuse une page parente absente du registre, ou d’une autre surface, et un gabarit inconnu', () => {
    expect(errorsOf(broken(o => (o.parent = { page: 'app/nope' })))).toMatch(/page parente « app\/nope » absente/)
    expect(errorsOf(broken(o => (o.parent = { page: 'dm/users' })))).toMatch(/autre surface/)
    expect(errorsOf(broken(o => (o.parent = { template: 'carousel' })))).toMatch(/gabarit inconnu « carousel »/)
    expect(errorsOf(broken(o => (o.parent = { template: 'list' })))).toBe('')
  })

  it('destructif : le bouton primaire (le dernier) est `destructive` et porte un verbe explicite', () => {
    expect(
      errorsOf(broken(o => (o.actions = [{ label: 'Annuler' }, { label: 'Supprimer le compte', variant: 'default' }]))),
    ).toMatch(/primaire.*destructive/)
    expect(
      errorsOf(broken(o => (o.actions = [{ label: 'Annuler' }, { label: 'Confirmer', variant: 'destructive' }]))),
    ).toMatch(/verbe explicite/)
    expect(errorsOf(broken(o => (o.actions = [{ label: 'OK', variant: 'destructive' }])))).toMatch(/verbe explicite/)
  })

  it('une confirmation porte deux boutons : renoncer et confirmer', () => {
    expect(errorsOf(broken(o => (o.actions = [{ label: 'Supprimer', variant: 'destructive' }])))).toMatch(
      /deux boutons/,
    )
  })

  it('famille modale : une note d’UX dit le focus et Échap', () => {
    expect(errorsOf(broken(o => (o.uxNotes = [])))).toMatch(/focus.*Échap/)
    const popover = broken(o => {
      o.kind = 'popover'
      o.destructive = false
      o.actions = undefined
      o.body = [{ type: 'text', text: 'Détail', style: 'body' }]
      o.uxNotes = []
    })
    expect(validateOverlay(popover, PAGES)).toEqual([])
  })

  it('le backoffice (dm) se dessine aussi sur téléphone (Q7, 25/09/2026)', () => {
    const dm = broken(o => {
      o.id = 'dm/overlays/x'
      o.surface = 'dm'
      o.parent = { page: 'dm/users' }
    })
    expect(dm.viewports).toContain('mobile')
    expect(errorsOf(dm)).not.toMatch(/bureau seul/)
  })

  it('un menu porte ses entrées et son déclencheur ; les autres familles n’en ont pas', () => {
    const menu = broken(o => {
      o.kind = 'dropdown'
      o.destructive = false
      o.actions = undefined
      o.uxNotes = []
    })
    expect(errorsOf(menu)).toMatch(/entrées/)
    expect(errorsOf(broken(o => (o.items = ['Ouvrir'])))).toMatch(/que les menus/)
  })

  it('confirmation destructive : le focus initial va sur le bouton qui renonce (RUX-23)', () => {
    const onDestroy = broken(o => {
      o.uxNotes = [
        {
          kind: 'decision',
          text: 'Focus sur « Supprimer le compte » à l’ouverture ; Échap ferme.',
          source: 'packages/ui/src/components/dialog.tsx:23',
        },
      ]
    })
    expect(errorsOf(onDestroy)).toMatch(/focus initial va sur « Annuler »/)
    // Une confirmation qui ne détruit rien n'est pas tenue à ce focus-là.
    expect(
      errorsOf(
        broken(o => {
          o.destructive = false
          o.actions = [{ label: 'Annuler' }, { label: 'Restaurer la version', variant: 'default' }]
          o.uxNotes = [
            { kind: 'decision', text: 'Focus sur « Restaurer la version » ; Échap ferme.', source: 'a.tsx:1' },
          ]
        }),
      ),
    ).toBe('')
  })

  it('ce que le rendu ne dessinerait pas ne s’écrit pas : ni actions sur un toast, ni corps sur une confirmation', () => {
    const toast = broken(o => {
      o.kind = 'toast'
      o.destructive = false
      o.uxNotes = []
    })
    expect(errorsOf(toast)).toMatch(/toast ne porte pas d’actions/)
    expect(errorsOf(broken(o => (o.body = [{ type: 'text', text: 'x', style: 'body' }])))).toMatch(
      /confirm ne porte pas de corps/,
    )
  })

  it('valide les blocs du corps avec le catalogue', () => {
    const o = broken(x => {
      x.kind = 'dialog'
      x.body = [{ type: 'component', component: 'Carousel', props: {} }]
    })
    expect(errorsOf(o)).toMatch(/composant inconnu « Carousel »/)
  })

  it('refuse une source sans fichier:ligne', () => {
    expect(errorsOf(broken(o => (o.source = 'dialog.tsx')))).toMatch(/source/)
  })

  it('refuse deux surcouches de même identifiant', () => {
    expect(validateOverlays([base(), base()], PAGES).join('\n')).toMatch(/en double/)
  })
})
