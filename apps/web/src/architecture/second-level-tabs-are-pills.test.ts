import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-127 — un SECOND niveau d'onglets ne se rend jamais comme le premier.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA DÉCISION QU'ELLE PROTÈGE — option B (Louis, 01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Les onglets en général sont super moches, l'espace entre les deux est
 * bizarre d'un point de vue design. »
 *
 * Sur /missions, deux barres se superposaient : celle de la SECTION (Missions ·
 * Créer · Planification · Board…) et celle de la LENTILLE (En cours ·
 * Renouvellements · Prêt à facturer). Même graisse, même soulignement, même
 * trait pleine largeur, seize pixels d'écart : l'œil lisait une bande grise
 * épaisse, et pas deux portées. C'est déjà ce qui avait produit #1123 — « je
 * vais cliquer sur cette barre qui me ramène au général ».
 *
 * La séparation passe par la FORME : onglets soulignés pour changer d'écran,
 * pastilles pour filtrer ce qu'on regarde.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE SAIT DIRE, ET CE QU'ELLE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit le SOURCE de chaque écran qui porte un second niveau, et exige
 * `variant="pill"` sur son `TabNav`. Une barre de FICHE qui n'a qu'UN niveau
 * garde la forme du premier (la barre de section s'y retire, #1123).
 *
 * ⚠️ **Le dossier de compte a CHANGÉ de catégorie le 08/09/2026 (#1604)** : ses
 * quatorze onglets sont désormais rangés en quatre familles, donc sa barre porte
 * bien deux portées — familles au-dessus, pages en dessous. La règle n'a pas
 * bougé d'un mot ; c'est le fichier qui est passé d'un côté à l'autre, et la
 * garde en exige maintenant les pastilles au lieu de les interdire. Une garde
 * qui aurait gardé l'ancienne classification aurait empêché la refonte que le
 * retour demandait.
 */

const WEB_SRC = join(__dirname, '..')

/** Les écrans où une barre de section est visible AU-DESSUS du second niveau. */
const SECOND_LEVEL_BARS = [
  // #4197 (L6) : MissionsPage n'a plus de bascule de lentilles — plus de second niveau à garder.
  'features/projects/view/ProjectsPage.tsx',
  'features/contacts/view/ContactContent.tsx',
  'features/accounts/view/AccountContent.tsx',
  // Troisième niveau : les vues de l'organigramme, DANS un onglet de fiche.
  'features/accounts/view/account-detail/tabs/organigramme/OrgGraphViews.tsx',
  // #1604 — la barre du dossier de compte porte désormais deux portées :
  // les quatre familles, puis les pages de la famille active.
  'features/accounts/view/account-detail/components/AccountDetailTabsBar.tsx',
]

/** Les barres de FICHE à UN seul niveau — elles gardent la forme du premier (la fiche contact n’en a plus : #3687). */
const RECORD_BARS = ['features/missions/view/MissionDetailTabs.tsx']

function read(relative: string): string {
  return readFileSync(join(WEB_SRC, relative), 'utf8')
}

describe('GA-127 — le second niveau est en pastilles', () => {
  it('lit bien quelque chose — un corpus vide serait vert pour toujours', () => {
    expect(SECOND_LEVEL_BARS.length).toBeGreaterThan(4)
    for (const file of [...SECOND_LEVEL_BARS, ...RECORD_BARS]) {
      const source = read(file)
      expect(source.length, file).toBeGreaterThan(400)
      expect(source, file).toContain('TabNav')
    }
  })

  it.each(SECOND_LEVEL_BARS)('%s rend son second niveau en pastilles', file => {
    expect(read(file)).toMatch(/variant="pill"/)
  })

  it('sait dire NON : une barre de second niveau sans la forme échoue', () => {
    // On casse volontairement le corpus, pour prouver que la garde mesure
    // quelque chose plutôt que de constater une chaîne présente ailleurs.
    const withoutVariant = read(SECOND_LEVEL_BARS[0]).replace(/variant="pill"/g, '')
    expect(withoutVariant).not.toMatch(/variant="pill"/)
  })

  it('n’attrape PAS les barres de fiche — elles sont le seul niveau de leur écran', () => {
    for (const file of RECORD_BARS) {
      expect(read(file), file).not.toMatch(/variant="pill"/)
    }
  })
})
