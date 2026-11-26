import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORRECTION_SURFACE_TRACES, CORRECTION_IMPACTED_SURFACES, type CorrectionSurfaceTrace } from '@bellum/contracts'

/**
 * GA-364 — une surface ne se dit « atteinte » que si un fichier le prouve.
 *
 * #2318.7 — LAU-FINAL-059, section PROPAGATION : « une correction validée doit
 * mettre à jour Laura, dossier Compte, Contacts, carte d'influence, couverture,
 * score, plan, rendez-vous, futures recherches workspace ».
 *
 * CE QU'IL Y AVAIT AVANT, et pourquoi c'était la faute que la doctrine interdit :
 * `CORRECTION_IMPACTED_SURFACES` était une liste FIXE de neuf noms, renvoyée
 * telle quelle par `buildFieldCorrectionView`. Neuf noms qui ne mesuraient rien.
 * Le code le disait lui-même — « la PROMESSE du produit… pas une mesure » — et
 * personne ne les affichait, ce qui était la seule chose honnête qu'on en
 * faisait. Une liste de neuf promesses présentée comme une propagation, c'est un
 * silence qui se lit comme une mesure : l'exact symétrique du « 0 » affiché à la
 * place d'un « non mesuré » (GA-18 / GA-19).
 *
 * CE QUE CETTE GARDE TIENT. Chaque surface porte un statut — `reached`,
 * `not_reached`, `not_measurable` — et, pour le justifier, un FICHIER et un
 * ANCRAGE : le texte exact du code qui relit la correction (ou du code qui lit
 * un instantané figé, et donc ne la relit pas). Cette garde ouvre ces fichiers
 * et cherche cet ancrage. Elle ne croit aucun commentaire.
 *
 * ⚠️ La leçon qui a produit ce paragraphe : « une classification affirme, la
 * garde ne vérifie pas ». Deux semis de démonstration ont pu être retirés sans
 * qu'un seul des cent quarante-sept tests rougisse, parce que la garde lisait
 * une déclaration au lieu de la source. Ici, retirer la lecture vivante d'une
 * surface `reached` fait rougir la garde, et il faut REMESURER pour la rendre
 * verte — pas réécrire un commentaire.
 *
 * ⚠️ Un ancrage, pas un numéro de ligne. Une ligne se décale au premier ajout
 * au-dessus ; une garde qui rougit pour un décalage devient une nuisance, et une
 * nuisance finit supprimée. L'ancrage est le texte du code lui-même : il ne
 * survit pas à la disparition du comportement, ce qui est précisément le seul
 * changement dont on veut être averti.
 *
 * ⚠️ Elle ne DÉCIDE pas du statut — elle vérifie qu'il est adossé à du code. Le
 * jour où une surface devient vraiment atteinte, c'est une mesure humaine qui
 * change le registre, pas cette garde.
 */

const REPO = join(__dirname, '..', '..', '..', '..')

/**
 * Le verdict de la garde sur UNE entrée, extrait pour que la garde puisse être
 * mise à l'épreuve : un test ci-dessous lui soumet des entrées fabriquées et
 * exige qu'elle dise NON. Une garde qu'on n'a jamais vue rouge n'est pas une
 * garde.
 */
export function auditSurfaceTrace(entry: CorrectionSurfaceTrace): string[] {
  const faults: string[] = []
  const path = join(REPO, entry.evidenceFile)

  if (!existsSync(path)) {
    faults.push(`${entry.surface} : le fichier de preuve n'existe pas — ${entry.evidenceFile}`)
    return faults
  }

  const source = readFileSync(path, 'utf8')
  if (!source.includes(entry.evidenceAnchor)) {
    faults.push(
      `${entry.surface} : l'ancrage a disparu de ${entry.evidenceFile} — ` +
        `« ${entry.evidenceAnchor} ». Le comportement a changé : REMESURER, ne pas réécrire l'ancrage.`,
    )
    return faults
  }

  // Une surface ATTEINTE ne peut pas être prouvée par une lecture d'instantané
  // figé. C'est la porte que cette garde ferme : `raw_analysis` est le blob
  // écrit une fois par l'analyse, jamais par une correction (`RecordEditService`
  // ne le touche pas). Prétendre « atteinte » en pointant dessus serait
  // recommencer la promesse, avec une preuve en plus pour la maquiller.
  if (entry.status === 'reached') {
    const line = source.split('\n').find(candidate => candidate.includes(entry.evidenceAnchor)) ?? ''
    if (line.includes('raw_analysis')) {
      faults.push(
        `${entry.surface} : déclarée « atteinte », mais sa preuve lit l'instantané figé ` +
          `(\`raw_analysis\`) dans ${entry.evidenceFile}. Un blob d'analyse ne relit aucune correction.`,
      )
    }
  }

  return faults
}

describe('GA-364 — le traçage des surfaces d’une correction est MESURÉ, jamais promis', () => {
  it('couvre les NEUF surfaces de LAU-FINAL-059, aucune retirée parce qu’elle était difficile', () => {
    expect(CORRECTION_SURFACE_TRACES.map(entry => entry.surface)).toEqual([...CORRECTION_IMPACTED_SURFACES])
  })

  it('ne nomme aucune surface deux fois', () => {
    const names = CORRECTION_SURFACE_TRACES.map(entry => entry.surface)
    expect(new Set(names).size).toBe(names.length)
  })

  it('LIT la source de chaque preuve — le fichier existe, et l’ancrage y est', () => {
    const faults = CORRECTION_SURFACE_TRACES.flatMap(entry => auditSurfaceTrace(entry))
    // Le tableau rend le défaut LISIBLE : la surface fautive est nommée dans la
    // sortie, plutôt qu'un « false n'est pas true » sur la sixième itération.
    expect(faults).toEqual([])
  })

  it('exige une raison écrite pour toute surface NON atteinte ou NON mesurable', () => {
    const silent = CORRECTION_SURFACE_TRACES.filter(
      entry => entry.status !== 'reached' && entry.reasonKey.trim() === '',
    ).map(entry => entry.surface)
    expect(silent).toEqual([])
  })

  // ── La garde sait dire NON ─────────────────────────────────────────────────
  // Trois coupables fabriqués. Si l'un d'eux passait, la garde ne prouverait
  // rien de ce qu'elle affirme au-dessus.
  describe('mise à l’épreuve : elle refuse ce qui n’est pas adossé à du code', () => {
    it('refuse un fichier de preuve qui n’existe pas', () => {
      const faults = auditSurfaceTrace({
        surface: 'plan',
        status: 'reached',
        evidenceFile: 'apps/api/src/modules/nulle-part/invente.ts',
        evidenceAnchor: 'peu importe',
        reasonKey: '',
      })
      expect(faults).toHaveLength(1)
      expect(faults[0]).toContain("le fichier de preuve n'existe pas")
    })

    it('refuse un ancrage absent d’un fichier pourtant réel', () => {
      const faults = auditSurfaceTrace({
        surface: 'plan',
        status: 'reached',
        evidenceFile: 'apps/api/src/modules/crm-core/record-edit.service.ts',
        evidenceAnchor: 'cetteFonctionNExistePas(' as string,
        reasonKey: '',
      })
      expect(faults).toHaveLength(1)
      expect(faults[0]).toContain("l'ancrage a disparu")
    })

    it('refuse une surface « atteinte » dont la preuve lit le blob figé', () => {
      const faults = auditSurfaceTrace({
        surface: 'plan',
        status: 'reached',
        evidenceFile: 'apps/web/src/features/accounts/view/account-detail/tabs/TabPlan.tsx',
        evidenceAnchor: 'buildPlanViewData((account.raw_analysis',
        reasonKey: '',
      })
      expect(faults).toHaveLength(1)
      expect(faults[0]).toContain("lit l'instantané figé")
    })
  })
})
