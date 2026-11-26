import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveContactTab, revealContactAnchor, revealContactAnchorWhenMounted } from './contactDetailTabs'

// #3720.2/.3 — les anciens onglets Contact retrouvent l'objet, jamais l'accueil ;
// les ancres ouvrent leur emplacement ou le disent (un scroll vers id absent = échec).
// Depuis #3687 la fiche est en ZONES : un ancien onglet retombe sur un pli ou une ancre.
describe('resolveContactTab', () => {
  it('les anciens onglets (avant #3644) retombent sur le pli ou l’ancre qui porte leur contenu', () => {
    expect(resolveContactTab('role')).toEqual({ fold: null, anchor: 'contact-role' })
    expect(resolveContactTab('score')).toEqual({ fold: null, anchor: 'contact-score-breakdown' })
    expect(resolveContactTab('relations')).toEqual({ fold: null, anchor: 'contact-relations' })
    expect(resolveContactTab('influence')).toEqual({ fold: null, anchor: 'contact-relations' })
    expect(resolveContactTab('signaux')).toEqual({ fold: null, anchor: 'contact-signals' })
    expect(resolveContactTab('activite')).toEqual({ fold: 'journal', anchor: null })
    expect(resolveContactTab('historique')).toEqual({ fold: 'journal', anchor: null })
    expect(resolveContactTab('notes')).toEqual({ fold: null, anchor: 'crm-notes-composer' })
    for (const old of ['introduction', 'sequences']) {
      // #3700 — la carte Séquences n'est plus rangée dans un pli (replié, elle n'était jamais montée).
      expect(resolveContactTab(old)).toEqual({ fold: null, anchor: 'contact-outreach' })
    }
  })
  it('les cinq onglets de #3644 aussi (messages, informations, intelligence)', () => {
    expect(resolveContactTab('messages')).toEqual({ fold: null, anchor: 'contact-timeline' })
    expect(resolveContactTab('informations')).toEqual({ fold: 'proofs', anchor: null })
    expect(resolveContactTab('intelligence')).toEqual({ fold: null, anchor: 'contact-signals' })
  })
  it('valeur inconnue ou absente → haut de la fiche, sans boucle', () => {
    expect(resolveContactTab('zzz')).toEqual({ fold: null, anchor: null })
    expect(resolveContactTab(undefined)).toEqual({ fold: null, anchor: null })
    expect(resolveContactTab('RESUME')).toEqual({ fold: null, anchor: null })
  })
})

describe('revealContactAnchor', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })
  it('amène l’élément à l’écran et le focalise quand il existe', () => {
    document.body.innerHTML = '<textarea id="x"></textarea>'
    const el = document.getElementById('x') as HTMLElement
    el.scrollIntoView = vi.fn()
    const focus = vi.spyOn(el, 'focus')
    expect(revealContactAnchor('x')).toBe(true)
    expect(el.scrollIntoView).toHaveBeenCalled()
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it('#3640/#3641 — une ancre non focalisable (bloc) passe le focus à son champ, sans défiler', () => {
    document.body.innerHTML = '<div id="b"><textarea id="t"></textarea></div>'
    const block = document.getElementById('b') as HTMLElement
    block.scrollIntoView = vi.fn()
    const t = document.getElementById('t') as HTMLElement
    const focus = vi.spyOn(t, 'focus')
    revealContactAnchor('b')
    expect(block.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })
  it('id absent → false (l’appelant se replie), jamais un échec silencieux', () => {
    expect(revealContactAnchor('absent')).toBe(false)
  })
})

// #3641 / #3640 (R2 07/10) — la recette prod a trouvé l'ancre à 1803 px d'une fenêtre de 706 :
// un montage tardif, puis un défilement coupé après coup.
describe('revealContactAnchorWhenMounted (#3641)', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('attend un bloc monté APRÈS plusieurs secondes d’images, puis défile vers lui', () => {
    vi.useFakeTimers()
    const onMissing = vi.fn()
    revealContactAnchorWhenMounted('late', onMissing)
    vi.advanceTimersByTime(500)
    expect(onMissing).not.toHaveBeenCalled()
    document.body.innerHTML = '<div id="late"></div>'
    const el = document.getElementById('late') as HTMLElement
    el.scrollIntoView = vi.fn()
    vi.advanceTimersByTime(100)
    expect(el.scrollIntoView).toHaveBeenCalled()
  })

  it('recommence quand l’ancre est encore hors de la fenêtre après le premier défilement', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="sig"></div>'
    const el = document.getElementById('sig') as HTMLElement
    el.scrollIntoView = vi.fn()
    // Hors fenêtre (top 1803 pour une fenêtre de 706), comme mesuré en prod.
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ top: 1803, bottom: 1923 } as DOMRect)
    revealContactAnchorWhenMounted('sig', vi.fn())
    vi.advanceTimersByTime(20)
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(600)
    expect((el.scrollIntoView as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(2)
  })

  it('#3640 — repose le focus dans le champ quand il est resté sur le body', () => {
    vi.useFakeTimers()
    document.body.innerHTML = '<div id="n"><textarea id="t"></textarea></div>'
    const block = document.getElementById('n') as HTMLElement
    block.scrollIntoView = vi.fn()
    const t = document.getElementById('t') as HTMLTextAreaElement
    revealContactAnchorWhenMounted('n', vi.fn())
    vi.advanceTimersByTime(20)
    t.blur()
    vi.advanceTimersByTime(300)
    expect(document.activeElement).toBe(t)
  })
})
