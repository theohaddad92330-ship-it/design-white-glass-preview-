import { OUTREACH_SEQUENCE_TEMPLATES, outreachTemplateKeySchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'
import frOutreach from '@/i18n/locales/fr/outreach.json'
import enOutreach from '@/i18n/locales/en/outreach.json'

/**
 * CE QUE CHAQUE TOUCHE APPORTE, DANS LES DEUX LANGUES (#1510).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CETTE GARDE EXISTE POUR EMPÊCHER
 * ─────────────────────────────────────────────────────────────────────────────
 * L'aperçu des échéances rendait `step.label` TEL QUEL — une chaîne écrite en
 * français dans le contrat, parce que c'est le libellé enregistré EN BASE à la
 * création. Un utilisateur anglophone lisait donc « Relance valeur (J+4) », et
 * rien ne pouvait le signaler : ce n'est pas une clé manquante, c'est une
 * chaîne présente et fausse.
 *
 * Le nom du gabarit avait le même défaut, un cran plus visible : la liste des
 * six cadences s'affichait en français quelle que soit la langue.
 *
 * ⚠️ Cette garde LIT les deux listes — la table du contrat et les catalogues.
 * Recopier les vingt-deux clés ici la ferait se comparer à elle-même, et elle
 * resterait verte le jour où un gabarit gagne une septième touche.
 */
type Catalogue = { templates?: { purpose?: Record<string, string>; name?: Record<string, string> } }

const CATALOGUES: [string, Catalogue][] = [
  ['fr', frOutreach as Catalogue],
  ['en', enOutreach as Catalogue],
]

const ALL_STEPS = outreachTemplateKeySchema.options.flatMap(key =>
  OUTREACH_SEQUENCE_TEMPLATES[key].steps.map(step => step.purposeKey),
)

describe('les gabarits de séquence', () => {
  /**
   * ⚠️ LA PREUVE QUE CETTE GARDE LIT QUELQUE CHOSE. Une table vide ou un
   * catalogue vide rendraient les tests suivants verts sans rien vérifier.
   */
  // #2202.39/#2202.40 — deux gabarits de plus, en fin de liste : Recommandation
  // (`referred_contact`) et Réactivation (`dormant_connection`), chacun tiré d'un
  // SCÉNARIO qui existait déjà (`outreach-scenarios.ts`) sans gabarit dédié dans
  // le sélecteur, en plus des cinq gabarits de #2202.1/.2/.3/.4/.6/.8.
  // #2202.44 — un quatorzième, EN FIN (GA-08) : les treize précédents couvrent
  // tous des CONTACTS (prospect, client, lien recommandé ou dormant), aucun ne
  // couvre un PARTENAIRE ESN (apporteur d'affaires / sous-traitance) — une
  // relation d'affaires entre deux entreprises, pas une prospection.
  it('lit un corpus réel — quatorze gabarits (#2202.1/.2/.3/.4/.6/.8/.39/.40/.44), une quarantaine de touches, deux catalogues', () => {
    expect(outreachTemplateKeySchema.options.length).toBe(14)
    expect(ALL_STEPS.length).toBeGreaterThanOrEqual(38)
    for (const [lang, catalogue] of CATALOGUES) {
      expect(Object.keys(catalogue.templates?.purpose ?? {}).length, lang).toBeGreaterThanOrEqual(38)
    }
  })

  it('chaque touche dit ce qu’elle apporte, en français ET en anglais', () => {
    const missing: string[] = []
    for (const [lang, catalogue] of CATALOGUES) {
      const purposes = catalogue.templates?.purpose ?? {}
      for (const key of ALL_STEPS) if (!purposes[key]) missing.push(`${lang}:${key}`)
    }
    expect(missing, 'touches sans texte').toEqual([])
  })

  it('chaque gabarit a son NOM dans les deux langues', () => {
    const missing: string[] = []
    for (const [lang, catalogue] of CATALOGUES) {
      const names = catalogue.templates?.name ?? {}
      for (const key of outreachTemplateKeySchema.options) if (!names[key]) missing.push(`${lang}:${key}`)
    }
    expect(missing, 'gabarits sans nom traduit').toEqual([])
  })

  /**
   * L'autre sens : un texte qui ne correspond à aucune touche est du code mort
   * qui rassure — et il survit à la suppression de sa touche sans bruit.
   */
  it('aucun texte ne vise une touche qui n’existe pas', () => {
    const known = new Set(ALL_STEPS)
    const orphans: string[] = []
    for (const [lang, catalogue] of CATALOGUES) {
      for (const key of Object.keys(catalogue.templates?.purpose ?? {})) {
        if (!known.has(key)) orphans.push(`${lang}:${key}`)
      }
    }
    expect(orphans, 'textes sans touche').toEqual([])
  })

  /**
   * ⚠️ Le retour dit : *« Ne pas afficher uniquement J0 / J+4 / J+10 sans
   * expliquer ce que chaque message apporte. »* Un texte qui se contente de
   * nommer le canal (« Email préparé », « Rappel ») ne l'explique pas — c'était
   * le cas des trois touches de `prospection_3_touches`, les seules du corpus.
   */
  it('chaque texte EXPLIQUE, il ne nomme pas seulement le canal', () => {
    const purposes = frOutreach.templates.purpose as Record<string, string>
    const tooShort = Object.entries(purposes)
      .filter(([, text]) => !text.includes('—'))
      .map(([key]) => key)
    expect(tooShort, 'touches qui nomment sans expliquer').toEqual([])
  })
})
