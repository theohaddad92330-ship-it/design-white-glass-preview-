import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Théo B c5-fiche-contact (maquette appliquée, `.contact-layout`) — TROIS colonnes : propriétés à gauche
 * (informations clés, rôle & périmètre), le travail au centre (pourquoi → résumé → prochaines actions →
 * historique & notes → données & protections), les dossiers associés à droite (compte & affaires, travail en
 * cours, relations, parcours). Le bandeau « Avant d'agir » est au-dessus, pleine largeur. Mobile : le travail
 * d'abord. Garde de SOURCE : elle lit le vrai fichier et nomme ce qui a bougé.
 *
 * #4596 (ENG-2540) change UNE chose de la décision Théo B c5 / #3687 : l'ÉTAT INITIAL du bandeau — replié, le pli
 * annonce ce qu'il cache, une carte neuve l'ouvre. La POSITION (au-dessus, pleine largeur) ne change pas : la garde
 * « précède la grille » ci-dessous la tient toujours, et une seconde garde tient le nouvel état initial.
 * Elle est mise à jour avec sa raison, pas désarmée.
 */
const source = readFileSync(join(__dirname, 'ContactDetail.tsx'), 'utf8')
const band = readFileSync(join(__dirname, 'alerts', 'ContactAlertsBand.tsx'), 'utf8')
const body = source.slice(source.indexOf('return ('))
const at = (needle: string) => body.indexOf(needle)

describe('fiche contact — trois colonnes (Théo B c5)', () => {
  it('lit le vrai fichier', () => {
    expect(at('<ContactKeyInfo')).toBeGreaterThan(0)
    expect(at('<ContactAssociations')).toBeGreaterThan(0)
  })

  it('la grille a trois colonnes sur grand écran, deux en tablette, une au téléphone', () => {
    expect(body).toContain('lg:grid-cols-[15rem_minmax(0,1fr)_16.25rem]')
    expect(body).toContain('md:grid-cols-[14.0625rem_minmax(0,1fr)]')
    expect(body).not.toContain('lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]')
  })

  /**
   * #4523 (recette 25/10, `f3b199c180`) — « le haut est encore en trois colonnes : l'aligner sur C5 ». La maquette
   * LUE ici : sa zone haute (`.contact-layout`) EST en trois colonnes à côtés fixes — 240 / 1fr / 260 px, puis
   * 260 / 1fr / 290 px sur grand écran, 225 / 1fr en tablette, gouttière 22 px. Les fractions `1.1fr 1.5fr 1fr`
   * et `1fr 1.4fr` de la maquette appartiennent au panneau guide (`.v18-guide-body`), pas à la fiche : les poser
   * en haut éloignerait la fiche de C5. La garde lit la maquette ET le code, et nomme l'écart.
   */
  describe('#4523 — la zone haute porte EXACTEMENT les colonnes de `.contact-layout` (maquette C5)', () => {
    const maquette = readFileSync(
      join(__dirname, '../../../../../../../docs/maquettes/theo-v22/_appliquees/b/c5-fiche-contact.html'),
      'utf8',
    )
    const layouts = [
      ...maquette.matchAll(/\.contact-layout \{\s*(?:display: grid;\s*)?grid-template-columns: ([^;]+);/g),
    ].map(match => match[1])
    const rem = (px: string) => `${Number(px.replace('px', '')) / 16}rem`
    const tailwind = (columns: string) =>
      columns
        .split(/ (?![^(]*\))/)
        .map(part => (part.endsWith('px') ? rem(part) : part.replace('0px', '0').replace(/ /g, '')))
        .join('_')
    const layout = body.slice(at('data-testid="contact-layout"'), at("aria-label={t('zones.info')}"))

    it('lit la vraie maquette : quatre définitions de `.contact-layout` (grand écran, très grand, tablette, mobile)', () => {
      expect(layouts).toEqual([
        '240px minmax(0px, 1fr) 260px',
        '260px minmax(0px, 1fr) 290px',
        '225px minmax(0px, 1fr)',
        'minmax(0px, 1fr)',
      ])
    })

    it('grand écran = 240 / 1fr / 260, très grand = 260 / 1fr / 290, tablette = 225 / 1fr, mobile = 1 — au pixel', () => {
      const [large, wide, tablet] = layouts.map(tailwind)
      expect(layout).toMatch(/className="grid grid-cols-1 /)
      expect(layout).toContain(`lg:grid-cols-[${large}]`)
      expect(layout).toContain(`xl:grid-cols-[${wide}]`)
      expect(layout).toContain(`md:grid-cols-[${tablet}]`)
    })

    it('la gouttière est celle de C5 (22 px) dès la tablette', () => {
      expect(maquette).toMatch(/\.contact-layout \{[^}]*gap: 22px;/)
      expect(layout).toContain('md:gap-[1.375rem]')
    })

    it('sait dire NON : les fractions du panneau guide ne sont jamais la grille du haut', () => {
      expect(layout).not.toContain('1.1fr')
      expect(layout).not.toContain('1.4fr')
      expect(layout).not.toContain('16.25rem_minmax(0,1fr)_18rem]')
    })
  })

  /**
   * #4523 (mesure prod 27/10, `8b6d99fc3d`, 1512 px) — la fiche déroulait 2 548 px pour 837 visibles, avec DEUX TROUS
   * (~160 × 210 px) sous « Informations clés » et sous « Où en est la relation » : la colonne de droite, plus haute,
   * fixait la hauteur de la PREMIÈRE rangée, et les rangées pleine largeur ne commençaient qu'après elle. La fiche
   * passe en DEUX FLUX sur grand écran : le flux principal (gauche + centre, puis les rangées sous eux) et le flux
   * des dossiers (droite, toute la hauteur). Les colonnes de C5 ne bougent pas — la grille imbriquée reprend au
   * pixel les deux premières (240 | 1fr, 260 | 1fr) et la gouttière de 22 px ; sous 1024 px elle s'efface
   * (`contents`) : tablette et mobile restent placés comme avant.
   */
  describe('#4523 — deux flux : la colonne de droite ne fixe plus la hauteur du haut', () => {
    const maquette = readFileSync(
      join(__dirname, '../../../../../../../docs/maquettes/theo-v22/_appliquees/b/c5-fiche-contact.html'),
      'utf8',
    )
    const [large, wide] = [
      ...maquette.matchAll(/\.contact-layout \{\s*(?:display: grid;\s*)?grid-template-columns: ([^;]+);/g),
    ].map(match => match[1].split(' ')[0])
    const rem = (px: string) => `${Number(px.replace('px', '')) / 16}rem`
    const main = body.slice(at('data-testid="contact-main"'), at("aria-label={t('zones.files')}"))
    const mainClass = /data-testid="contact-main"\s+className="([^"]+)"/.exec(body)?.[1] ?? ''

    it('le flux principal porte informations, travail et rangées — jamais les dossiers', () => {
      expect(at('data-testid="contact-main"')).toBeGreaterThan(at('data-testid="contact-layout"'))
      expect(at('data-testid="contact-main"')).toBeLessThan(at("aria-label={t('zones.info')}"))
      for (const needle of [
        "aria-label={t('zones.info')}",
        "aria-label={t('zones.work')}",
        'data-testid="contact-rows"',
      ]) {
        expect(main.includes(needle), needle).toBe(true)
      }
      expect(main).not.toContain('<ContactAssociations')
    })

    it('grand écran : il occupe les deux premières colonnes de C5, au pixel, avec la gouttière de C5', () => {
      expect(mainClass).toMatch(/(^| )contents( |$)/)
      expect(mainClass).toContain('lg:grid')
      expect(mainClass).toContain('lg:col-span-2')
      expect(mainClass).toContain('lg:row-start-1')
      expect(mainClass).toContain(`lg:grid-cols-[${rem(large)}_minmax(0,1fr)]`)
      expect(mainClass).toContain(`xl:grid-cols-[${rem(wide)}_minmax(0,1fr)]`)
      expect(mainClass).toContain('lg:gap-[1.375rem]')
      expect(mainClass).toContain('lg:items-start')
    })

    it('les dossiers restent à droite, sur la première rangée, à côté du flux principal', () => {
      expect(body).toMatch(/aria-label=\{t\('zones.files'\)\}[\s\S]{0,200}lg:col-start-3 lg:row-start-1/)
    })

    it('sait dire NON : les rangées ne repartent pas sous les trois colonnes', () => {
      const rows = /data-testid="contact-rows"\s+className="([^"]+)"/.exec(body)?.[1] ?? ''
      expect(rows).not.toContain('lg:col-span-3')
      expect(rows).not.toContain('lg:row-start-3')
    })
  })

  // #4585 — « Comment est-elle calculée ? » AMÈNE au détail du bloc « Rôle & périmètre ». Sans détail calculé, la
  // carte du détail ne se monte pas (`ContactScoreBreakdown` rend `null`) : le lien n'est pas proposé, plutôt qu'un
  // clic qui finit en haut de la fiche.
  it('#4585 — le lien vers le détail du score n’existe que si le détail existe', () => {
    expect(body).toMatch(/onExplainScore=\{hasScoreBreakdown \? goToScore : undefined\}/)
    expect(source).toMatch(/const hasScoreBreakdown = contactScoreView\(contact\)\.breakdown !== null/)
  })

  it('le bandeau « Avant d’agir » précède la grille, pleine largeur', () => {
    expect(at('<ContactPreflight')).toBeLessThan(at('data-testid="contact-layout"'))
    expect(at('<DuplicateCandidatesCard')).toBeLessThan(at('data-testid="contact-layout"'))
  })

  // #4596 — la position ne change pas ; l'état initial, si : replié, et il s'ouvre quand une carte est neuve.
  it('#4596 — le bandeau reste au-dessus et pleine largeur, mais REPLIÉ par défaut, et une carte neuve l’ouvre', () => {
    expect(at('<ContactAlertsBand')).toBeGreaterThan(0)
    expect(at('<ContactAlertsBand')).toBeLessThan(at('data-testid="contact-layout"'))
    expect(band).toContain('useState(false)')
    expect(band).toMatch(/if \(hasNew\) setOpen\(true\)/)
    expect(band).toContain("t('avantDagir.summary'")
    expect(band).toMatch(/entries\.length === 0 && 'hidden'/)
  })

  it('#4596 — chaque carte du bandeau passe par l’enveloppe : aucune n’est retirée', () => {
    const inBand = body.slice(at('<ContactAlertsBand'), at('data-testid="contact-layout"'))
    for (const tag of [
      '<ContactPreflight',
      '<HistoricalContactStillUseful',
      '<DetectedNewEmployer',
      '<ContactAmbiguousIdentityAlert',
      '<ContactSolicitationCollisionAlert',
      '<ColleagueActivityBanner',
      '<DuplicateCandidatesCard',
    ]) {
      expect(inBand.includes(tag), tag).toBe(true)
    }
  })

  it('gauche : informations clés — avant le centre', () => {
    const order = ['<ContactKeyInfo', "aria-label={t('zones.work')}"].map(at)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  // #4585 (Louis 26/10) + #2610 — « Rôle & périmètre » : UN bloc pleine largeur (rangées), plus une carte ET un pli
  // du même titre dans la colonne étroite de gauche (GA-26, valeurs coupées). Raison de la mise à jour : la garde
  // « gauche : informations clés puis rôle & périmètre » attendait le pli ; elle attend désormais son absence.
  it('#4585 — rôle & périmètre est un seul bloc, dans les rangées pleine largeur, plus dans la colonne de gauche', () => {
    expect(body).not.toContain('id="contact-fold-role"')
    expect(body).not.toContain('<ContactRoleScope')
    expect(body).not.toContain("t('folds.role')")
    const info = body.slice(at("aria-label={t('zones.info')}"), at("aria-label={t('zones.work')}"))
    expect(info).not.toContain('<ContactRoleBlock')
    expect(at('<ContactRoleBlock')).toBeGreaterThan(at('data-testid="contact-rows"'))
    expect(at('<ContactRoleBlock')).toBeLessThan(at("t('sections.nextActions')"))
  })

  it('centre : pourquoi → résumé → prochaines actions → historique & notes → données & protections', () => {
    const order = [
      '<ContactWhyKey',
      '<ContactRelationSummary',
      "t('sections.nextActions')",
      '<TaskList',
      "t('sections.history')",
      '<ContactWorkBar',
      '<ContactTimelineCard',
      "t('sections.data')",
      'id="contact-fold-proofs"',
      'id="contact-fold-journal"',
      'id="contact-fold-protections"',
    ].map(at)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(Math.min(...order)).toBeGreaterThan(0)
  })

  // #4523 — les sections du bas quittent la colonne étroite du centre pour des RANGÉES pleine largeur (grilles de la
  // maquette C5 : 1.1fr 1.5fr 1fr · 1fr 1.4fr · 1fr 1fr). Aucune section perdue : seul l'emplacement change.
  it('#4523 — le bas de page est en rangées pleine largeur, sous les trois colonnes', () => {
    const rows = at('data-testid="contact-rows"')
    expect(rows).toBeGreaterThan(at("aria-label={t('zones.work')}"))
    expect(body).toMatch(/data-testid="contact-rows"[\s\S]{0,200}md:col-span-full/)
    expect(body).toContain('lg:grid-cols-[1.1fr_1.5fr_1fr]')
    expect(body).toContain('lg:grid-cols-[1fr_1.4fr]')
    expect(body).toContain('lg:grid-cols-[1fr_1fr]')
  })

  it('#4523 — Tâches, Appel et Rendez-vous sont côte à côte, plus empilés dans la colonne du centre', () => {
    const center = body.slice(at("aria-label={t('zones.work')}"), at('data-testid="contact-rows"'))
    for (const tag of [
      '<TaskList',
      '<ContactCallTaskCard',
      '<ContactMeetingPlanCard',
      '<ContactNotesCard',
      '<ContactRecordCard',
    ]) {
      expect(center.includes(tag), tag).toBe(false)
    }
    const row = body.slice(at("t('sections.nextActions')"), at("t('sections.history')"))
    expect(row).toContain('lg:grid-cols-[1.1fr_1.5fr_1fr]')
  })

  it('#4523 — mobile : même ordre qu’avant (travail et rangées, puis informations, puis dossiers)', () => {
    expect(body).toMatch(/data-testid="contact-rows"[\s\S]{0,200}order-1/)
    expect(body).toMatch(/aria-label=\{t\('zones.info'\)\}[\s\S]{0,120}order-2/)
    expect(body).toMatch(/aria-label=\{t\('zones.files'\)\}[\s\S]{0,120}order-3/)
  })

  it('droite : compte & affaires, travail en cours, relations, parcours — après le centre', () => {
    const center = at('id="contact-fold-protections"')
    const side = [
      '<ContactAssociations',
      '<ContactOutreachMessagesCard',
      '<ContactOutreachCard',
      '<ContactRelations',
      '<ContactCareerDetail',
      '<ContactSignals',
    ].map(at)
    expect(side).toEqual([...side].sort((a, b) => a - b))
    expect(Math.min(...side)).toBeGreaterThan(center)
  })

  it('le geste contextuel vit DANS « Pourquoi préparer cet échange »', () => {
    const why = at('<ContactWhyKey')
    const cta = at('<ContactRelationalCtaBanner')
    expect(cta).toBeGreaterThan(why)
    expect(cta).toBeLessThan(at('<ContactRelationSummary'))
  })

  it('rien ne se perd : toutes les cartes de la fiche restent rendues', () => {
    for (const tag of [
      '<ContactPreflight',
      '<ContactRoleBlock',
      '<ContactRelations',
      '<ContactIntroductionRelay',
      '<ContactOutreachCard',
      '<ContactSignals',
      '<ContactCareerDetail',
      '<ContactCallTaskCard',
      '<ContactMeetingPlanCard',
      '<ContactPlanBlock',
      '<ContactRecordCard',
      '<ContactLifecycleTimeline',
      '<ContactCrmExport',
      '<ContactLemlist',
      '<ContactCorrectionsCard',
      '<ContactExclusion',
      '<ContactErasureCard',
      '<ContactCorrectionsHistory',
      '<ContactActionHistory',
      '<TaskList',
    ]) {
      expect(at(tag), tag).toBeGreaterThan(0)
    }
  })
})

/**
 * #4523.1 (recette prod 31/10, 1512 px) — la colonne de droite s'arrêtait à y≈1088 sur une page de 2632 px : ~1 500 px
 * VIDES. jsdom ne met rien en page : cette garde lit la STRUCTURE (classes), pas des pixels. La colonne de droite est
 * COLLANTE sur grand écran (elle suit la lecture le long du flux principal), bornée à la hauteur de la fenêtre
 * (`dvh`) et défilante pour que rien ne soit hors d'atteinte ; sous 1024 px, aucune classe ne s'applique.
 */
describe('#4523.1 — la colonne de droite ne laisse pas un trou (collante sur grand écran)', () => {
  const aside = body.slice(at("aria-label={t('zones.files')}"), at('<ContactAssociations'))
  const classes = aside.slice(aside.indexOf('className="'), aside.indexOf('">'))

  it('est collante au-dessus de 1024 px et bornée par dvh (jamais vh)', () => {
    expect(classes).toContain('lg:sticky')
    expect(classes).toContain('lg:top-4')
    expect(classes).toContain('lg:max-h-[calc(100dvh-2rem)]')
    expect(classes).not.toMatch(/\bvh\b|\[calc\(100vh/)
  })

  it('défile en elle-même ET se tabule (région défilante focalisable)', () => {
    expect(classes).toContain('lg:overflow-y-auto')
    expect(aside).toContain('tabIndex={0}')
  })

  // #4523.1 — la colonne collante est un ENFANT DIRECT de la grille `items-start`, posée en haut (rangée 1) et
  // alignée au début explicitement : jamais étirée, jamais placée sous un bloc haut (mesure prod 31/10 : top 1432 px
  // à scrollTop 0). jsdom ne met rien en page : on tient la STRUCTURE.
  it('est un enfant direct de la grille items-start, rangée 1, alignée au début (jamais étirée)', () => {
    expect(classes).toContain('lg:row-start-1')
    expect(classes).toContain('lg:col-start-3')
    expect(classes).toContain('lg:self-start')
    const layoutOpen = body.slice(at('data-testid="contact-layout"'))
    expect(layoutOpen.slice(0, layoutOpen.indexOf('>'))).toContain('items-start')
  })

  it('sait dire NON : tablette et mobile inchangés — aucune règle collante sans préfixe lg:', () => {
    expect(classes).not.toMatch(/(^|\s)sticky\b/)
    expect(classes).toContain('order-3 min-w-0 space-y-5 md:order-none md:col-start-1 md:row-start-2')
  })
})
