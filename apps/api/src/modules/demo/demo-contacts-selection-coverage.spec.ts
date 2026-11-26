import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #3701 — « parité démo » de la sélection multiple : ≥ 50 contacts dont des
 * homonymes, un exclu, un sans e-mail. Le lien de démonstration est ce qu'un
 * prospect voit : la revue de sélection (« Revoir la sélection », « Tous les
 * résultats ») doit y avoir de quoi nommer chaque cas.
 *
 * La garde recompte sur le JEU construit (`DEMO_DOSSIERS`, post-densification
 * — ce que `DemoSeedService` écrit) ; elle sait dire NON sur un jeu vidé.
 */
const normalized = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')

const all = DEMO_DOSSIERS.flatMap(dossier => dossier.contacts)

describe('couverture démo — sélection multiple de contacts (#3701)', () => {
  it('lit un corpus d’au moins 50 contacts (volume de recette)', () => {
    expect(all.length).toBeGreaterThanOrEqual(50)
  })

  it('porte au moins deux fiches homonymes (même nom, fiches distinctes)', () => {
    const byName = new Map<string, number>()
    for (const contact of all) {
      const key = normalized(contact.full_name)
      if (key) byName.set(key, (byName.get(key) ?? 0) + 1)
    }
    expect([...byName.values()].filter(n => n > 1).length).toBeGreaterThanOrEqual(1)
  })

  it('porte au moins un contact exclu (désinscrit)', () => {
    expect(all.some(contact => Boolean(contact.exclusion_reason))).toBe(true)
  })

  it('porte au moins un contact sans e-mail', () => {
    expect(all.some(contact => !contact.email)).toBe(true)
  })
})
