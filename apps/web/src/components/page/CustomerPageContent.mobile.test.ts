import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #2117.84 — RECETTE IPHONE DU 25/09 : LE BOUTON FLOTTANT DE SIGNALEMENT
 * RECOUVRE LES DERNIÈRES LIGNES D'UNE LISTE, EN BAS D'ÉCRAN.
 *
 * `FeedbackWidget.tsx` est `fixed`, hors du flux — la seule façon fiable de ne
 * JAMAIS finir sous lui en fin de page est de réserver, dans le conteneur qui
 * défile RÉELLEMENT (`CustomerPageContent.tsx`, le seul choke point commun à
 * tous les écrans de la coque — GA-26), une bande vide après le contenu :
 * défiler « jusqu'au bout » laisse alors le dernier élément RÉEL au-dessus du
 * bouton plutôt que dessous.
 *
 * ⚠️ Test qui LIT LA SOURCE plutôt qu'un montage complet : `CustomerPageContent`
 * tire `useSession`, `useOnboardingStatus`, `useCurrentRouteAccess`,
 * `SectionTabs`, `PageHeader` — un montage réel demanderait de doubler cinq
 * dépendances pour vérifier une seule ligne de balisage. Même patron que
 * `panel-primary-action-clears-the-widget.test.ts` (GA-205) : un test qui SAIT
 * DIRE NON (retirer la ligne le fait échouer, vérifié à la main en écrivant
 * cette garde) plutôt qu'un montage qui ne prouverait rien de plus.
 */
const SOURCE_PATH = join(__dirname, 'CustomerPageContent.tsx')

function readSource(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
}

describe('#2117.84 — le contenu qui défile réserve une marge basse sous 768px', () => {
  it('importe useIsMobile', () => {
    const source = readSource()
    expect(source).toMatch(/import\s*\{[^}]*\buseIsMobile\b[^}]*\}\s*from\s*['"]@\/features\/mobile\/useIsMobile['"]/)
  })

  it('rend une marge basse réservée, seulement sous 768px, APRÈS le contenu de l’écran', () => {
    const source = readSource()
    const childrenIndex = source.indexOf('{access.state === ')
    expect(childrenIndex).toBeGreaterThan(-1)
    const after = source.slice(childrenIndex)
    // Le marqueur : un `<div>` `aria-hidden` conditionné par `isMobile`, situé
    // APRÈS le rendu des enfants — jamais avant, sinon la réserve précéderait
    // le contenu au lieu de le suivre.
    expect(after).toMatch(/isMobile\s*&&[\s\S]{0,200}aria-hidden/)
  })
})

/**
 * #3050 (27/09/2026) — LA MÊME MARGE, MAIS PAS SUR /chat MOBILE.
 *
 * `FeedbackWidget` s'y tait déjà (le bouton flottant recouvrait « Envoyer »,
 * voir son propre docblock) : réserver 64px pour un bouton absent mangeait le
 * budget de hauteur du fil, mesuré à 38% au lieu des ≈ 100% - en-tête -
 * composeur - navigation visés (recette du 27/09, fenêtre 500px). Le prédicat
 * qui dit « ce bouton se tait ici » vient d'UN seul endroit
 * (`isFeedbackWidgetHiddenOnMobilePath`), jamais recopié.
 */
describe('#3050 — la marge basse ne se pose pas là où le bouton flottant est déjà tu', () => {
  it('importe le même prédicat que `FeedbackWidget`', () => {
    const source = readSource()
    expect(source).toMatch(
      /import\s*\{\s*isFeedbackWidgetHiddenOnMobilePath\s*\}\s*from\s*['"]@\/features\/feedback\/feedback-widget-visibility['"]/,
    )
  })

  it('la réserve ne se pose PAS quand ce prédicat est vrai', () => {
    const source = readSource()
    const childrenIndex = source.indexOf('{access.state === ')
    expect(childrenIndex).toBeGreaterThan(-1)
    const after = source.slice(childrenIndex)
    expect(after).toMatch(
      /isMobile\s*&&[\s\S]{0,200}!isFeedbackWidgetHiddenOnMobilePath\([\s\S]{0,80}\)[\s\S]{0,120}aria-hidden/,
    )
  })
})

/**
 * #3480 — LA BULLE DE LAURA RECOUVRAIT LA DERNIÈRE LIGNE (bureau).
 *
 * `LauraDock` est `fixed` dès 768 px ; la marge mobile ci-dessus ne couvrait
 * que le bouton de signalement sous 768 px. Même patron : on lit la source du
 * choke point, et la bande bureau doit exister, APRÈS les enfants.
 */
describe('#3480 — le contenu qui défile réserve la place de la bulle de Laura dès 768px', () => {
  it('réserve la place en PADDING BAS du conteneur qui défile (md:pb-20), pas en bande enfant', () => {
    const source = readSource()
    expect(source).toMatch(/lauraDockClearance && 'md:pb-20'/)
    expect(source).toMatch(/overflow-y-auto'[\s\S]{0,900}data-testid="laura-dock-clearance"/)
    expect(source).not.toMatch(/h-20 shrink-0 md:block/)
  })

  it('#3480 — l’enveloppe ne se comprime pas sous son contenu (md:min-h-fit), sinon le padding du scroller se perd', () => {
    const source = readSource()
    expect(source).toMatch(/cn\(pageContentClassName\(contentClassName\), lauraDockClearance && 'md:min-h-fit'\)/)
    // Le test sait dire NON : l'enveloppe nue (min-h-0 de CONTENT_BASE) ne passe pas.
    expect(source).not.toMatch(/<div className=\{pageContentClassName\(contentClassName\)\}>/)
  })

  it('la bande fait au moins la hauteur de la bulle (bottom-4 + 48 px = 64 px)', () => {
    const dock = readFileSync(join(__dirname, '../../features/laura/bubble/LauraDock.tsx'), 'utf8')
    expect(dock).toMatch(/bottom-\[calc\(1rem\+/)
    // Maquette Théo (MAQ-LAURA E135) : la porte est une pastille nommée, toujours 48 px de haut (h-12).
    expect(dock).toMatch(/size-12|h-12/)
    expect(readSource()).toMatch(/md:pb-20/)
  })

  it('ne se pose pas sur /chat, qui gère son propre défilement', () => {
    expect(readSource()).toMatch(/startsWith\('\/chat'\)/)
  })
})

describe('#3480 — jumeau : les réglages réservent la même bande', () => {
  it('SettingsPage pose la bande `md:block` de 80 px sous le contenu', () => {
    const source = readFileSync(join(__dirname, 'SettingsPage.tsx'), 'utf8')
    expect(source).toMatch(/hidden h-20 shrink-0 md:block/)
  })
})

/**
 * #3480 (recette prod 01/10, RÉFUTÉ) — LA RÉSERVE EXISTAIT, MAIS AU MAUVAIS ENDROIT.
 *
 * `/actions` posait `h-full` sur l'enveloppe du contenu : elle valait la hauteur
 * VISIBLE (852 px) alors que le journal en faisait 13 677. La bande
 * `laura-dock-clearance`, dernier enfant de cette enveloppe, se calait donc à
 * 852 px — 12 000 px au-dessus de la vraie fin — et le bas de page n'avait
 * aucun dégagement. `min-h-full` laisse l'enveloppe GRANDIR avec son contenu :
 * la bande retombe après la dernière carte. Seul un écran qui gère son propre
 * défilement (`skipHeader`, comme /search ou /chat) a le droit de fixer `h-full`.
 */
describe('#3480 — une page qui défile ne fige pas son enveloppe à la hauteur visible', () => {
  it('/actions utilise min-h-full, pas h-full, sur l’enveloppe qui précède la bande de dégagement', () => {
    const route = readFileSync(join(__dirname, '../../routes/actions/index.tsx'), 'utf8')
    const match = route.match(/<CustomerPage[^>]*contentClassName="([^"]*)"/)
    expect(match).not.toBeNull()
    const classes = (match?.[1] ?? '').split(/\s+/)
    expect(classes).not.toContain('h-full')
    expect(classes).toContain('min-h-full')
  })
})
