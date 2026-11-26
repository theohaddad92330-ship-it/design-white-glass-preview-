import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #4520.2 — l'avatar du compte vit dans la barre du haut, et la barre du haut est une
 * affaire de BUREAU. La rangée d'identité du pied de barre latérale ayant disparu, la
 * question est : que voit-on sous 768 px ?
 *
 * Réponse mesurée dans le code : rien ne change. L'avatar est rendu sous 768 px par l'écran Aujourd'hui (`BriefingHero`). La coque mobile (`MobileShell`) ne monte
 * NI la barre latérale NI la barre du haut — la rangée du pied n'a donc jamais été rendue
 * sous 768 px non plus. Retirer la rangée ne retire rien au mobile, et la garder « sur
 * mobile seulement » ne ferait rien rendre. Ce test fige les deux largeurs sur la source
 * (même patron que `CustomerPageContent.mobile.test.ts`) : un montage réel demanderait de
 * doubler cinq dépendances pour vérifier une condition.
 */
const read = (relative: string): string => readFileSync(join(__dirname, relative), 'utf8')

describe('#4520.2 — l’avatar du haut selon la largeur', () => {
  it('≥ 768 px : la barre du haut (donc l’avatar) est montée', () => {
    expect(read('../page/CustomerPageContent.tsx')).toMatch(/!skipBanners && !isMobile \? <ShellTopbar/)
  })

  it('< 768 px : la coque mobile ne monte ni la barre du haut ni la barre latérale', () => {
    const shell = read('../../features/mobile/MobileShell.tsx')
    expect(shell).not.toMatch(/ShellTopbar|AppSidebar|CustomerNavbarBody|NavIdentity/)
  })

  it('< 768 px : l’avatar du compte reste atteignable depuis l’écran Aujourd’hui (BriefingHero)', () => {
    expect(read('../../features/briefing/view/BriefingHero.tsx')).toMatch(/<UserDropdownMenu/)
  })

  it('la barre du haut monte l’avatar (`NavIdentity`)', () => {
    expect(read('./ShellTopbar.tsx')).toMatch(/<NavIdentity \/>/)
  })

  it('le pied de barre latérale ne monte plus la rangée d’identité, à aucune largeur', () => {
    expect(read('../sidebar/CustomerNavbarBody.tsx')).not.toMatch(/identity=\{/)
  })
})
