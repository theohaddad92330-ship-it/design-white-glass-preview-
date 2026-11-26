import { describe, expect, it } from 'vitest'
import briefingEn from '@/i18n/locales/en/briefing.json'
import briefingFr from '@/i18n/locales/fr/briefing.json'
import dashboardEn from '@/i18n/locales/en/dashboard.json'
import dashboardFr from '@/i18n/locales/fr/dashboard.json'
import mailboxEn from '@/i18n/locales/en/mailbox.json'
import mailboxFr from '@/i18n/locales/fr/mailbox.json'
import navEn from '@/i18n/locales/en/nav.json'
import navFr from '@/i18n/locales/fr/nav.json'

/**
 * #2112.54 — « Un novice comprend la différence des trois pages », en FR+EN.
 *
 * `SectionTabs.destinationRole.test.tsx` prouve déjà le MÉCANISME (l'aide au
 * survol de #2112.13-16), en français, depuis l'intérieur du composant. Ce
 * test-ci lit les DEUX phrases que #2112.54 demande, dans les DEUX langues :
 *
 *  - le SOUS-TITRE de chaque page : « à quoi elle sert » (`page.subtitle` de
 *    briefing/mailbox, `personal.headerSubtitle` de dashboard — rendus en
 *    permanence par `BriefingHero`, `MailboxPage`, `PersonalCockpitHeader`) ;
 *  - l'AIDE au survol de son onglet : « en quoi elle diffère » des deux
 *    autres (`nav.tabHints`, déjà recetté en FR par #2112.13-15).
 *
 * Aucune des deux n'était lue en anglais avant ce test — une régression sur
 * `en/*.json` (texte vide, recopié du libellé, ou identique entre deux pages)
 * passait la CI.
 */
describe('#2112.54 — chaque page dit à quoi elle sert et en quoi elle diffère, en FR et en EN', () => {
  const SOUS_TITRES_FR = {
    today: briefingFr.page.subtitle,
    mailbox: mailboxFr.page.subtitle,
    dashboard: dashboardFr.personal.headerSubtitle,
  }
  const SOUS_TITRES_EN = {
    today: briefingEn.page.subtitle,
    mailbox: mailboxEn.page.subtitle,
    dashboard: dashboardEn.personal.headerSubtitle,
  }
  const AIDES_FR = navFr.tabHints
  const AIDES_EN = navEn.tabHints

  it('porte le sous-titre exact des trois pages, en français', () => {
    expect(SOUS_TITRES_FR.today).toBe(
      'Voilà ce qui a changé, ce qui est urgent et ce que {{brand}} te recommande de faire ensuite.',
    )
    // Théo B m1.R1 — la phrase d'usage de la page appliquée remplace l'ancien sous-titre.
    expect(SOUS_TITRES_FR.mailbox).toBe('Répondre, relire, suivre. Chaque échange reste lié au bon dossier.')
    expect(SOUS_TITRES_FR.dashboard).toBe(
      'Prends du recul sur ton portefeuille, tes relations et les dossiers que tu laisses dormir.',
    )
  })

  it('porte le sous-titre exact des trois pages, en anglais', () => {
    expect(SOUS_TITRES_EN.today).toBe('Here is what changed, what is urgent, and what {{brand}} suggests you do next.')
    expect(SOUS_TITRES_EN.mailbox).toBe('Reply, review, follow up. Every thread stays linked to the right file.')
    expect(SOUS_TITRES_EN.dashboard).toBe(
      "Take a step back on your portfolio, your relationships and the deals you're letting go quiet.",
    )
  })

  it.each(Object.entries({ français: SOUS_TITRES_FR, anglais: SOUS_TITRES_EN }))(
    'les trois sous-titres sont de vraies phrases, pas des libellés recopiés (%s)',
    (_langue, subtitles) => {
      for (const [page, text] of Object.entries(subtitles)) {
        // Un libellé d'onglet fait quelques mots ; une phrase qui explique le
        // rôle de la page en fait davantage — le plancher écarte un sous-titre
        // vidé à « Aujourd'hui » ou « Messagerie ».
        expect(text.length, `sous-titre de « ${page} » trop court : « ${text} »`).toBeGreaterThan(30)
        expect(text.trim().length, `sous-titre de « ${page} » vide ou blanc`).toBeGreaterThan(0)
      }
    },
  )

  it.each(Object.entries({ français: SOUS_TITRES_FR, anglais: SOUS_TITRES_EN }))(
    'les trois sous-titres sont uniques entre eux — aucune page ne recopie le rôle d’une autre (%s)',
    (_langue, subtitles) => {
      const values = Object.values(subtitles)
      expect(new Set(values).size, values.join('\n')).toBe(3)
    },
  )

  it('porte l’aide au survol exacte des trois onglets, en français (recoupe #2112.13-15)', () => {
    expect(AIDES_FR.today).toBe('Décider et agir.')
    expect(AIDES_FR.mailbox).toBe('Traiter tes échanges.')
    expect(AIDES_FR.dashboard).toBe('Prendre du recul.')
  })

  it('porte l’aide au survol exacte des trois onglets, en anglais', () => {
    expect(AIDES_EN.today).toBe('Decide and act.')
    expect(AIDES_EN.mailbox).toBe('Handle your exchanges.')
    expect(AIDES_EN.dashboard).toBe('Step back.')
  })

  it.each(Object.entries({ français: AIDES_FR, anglais: AIDES_EN }))(
    'les trois aides sont uniques entre elles — le différenciateur ne peut pas se confondre (%s)',
    (_langue, hints) => {
      const values = [hints.today, hints.mailbox, hints.dashboard]
      expect(new Set(values).size, values.join('\n')).toBe(3)
    },
  )
})
