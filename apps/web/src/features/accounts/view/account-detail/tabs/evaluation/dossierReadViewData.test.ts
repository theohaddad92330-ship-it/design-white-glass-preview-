/**
 * #2118.4 / .6 / .30-.37 / .39-.40 / .44-.47 / .52 — la lecture du dossier,
 * côté ÉCRAN.
 *
 * Ce que cette suite garde, et que le contrat ne peut pas garder tout seul :
 * `dossierReadSchema` refuse un axe incohérent AU PARSE, mais `raw_analysis`
 * n'est pas parsé strictement côté web (des milliers de lignes écrites avant ce
 * lot le feraient échouer en bloc). Une ligne peut donc arriver ici avec un axe
 * `unknown` PORTANT une note — exactement le zéro qui ment. La normalisation
 * ci-dessous est ce qui l'empêche d'atteindre l'écran.
 */
import { describe, expect, it } from 'vitest'
import { readDossierRead } from './dossierReadViewData'

describe('readDossierRead — ce qui arrive de la base, normalisé', () => {
  it('rend null quand le dossier ne porte pas la lecture (analyse d’avant ce lot)', () => {
    expect(readDossierRead(undefined)).toBeNull()
    expect(readDossierRead(null)).toBeNull()
    expect(readDossierRead('texte')).toBeNull()
    // Un objet vide n'est pas une lecture : il n'a ni axe ni bloc à montrer.
    expect(readDossierRead({})).toBeNull()
  })

  it('rend TOUJOURS les sept axes, les absents en « inconnu » — un axe omis ne disparaît pas', () => {
    const view = readDossierRead({ axes: [{ key: 'adequation_offre', state: 'measured', value: 4 }] })

    expect(view?.axes).toHaveLength(7)
    expect(view?.axes.map(a => a.key)).toEqual([
      'adequation_offre',
      'potentiel_commercial',
      'fraicheur',
      'accessibilite',
      'capacite_achat_externe',
      'concurrence',
      'qualite_preuves',
    ])
    expect(view?.axes[1]).toMatchObject({ state: 'unknown', value: null })
  })

  it('⚠️ SAIT DIRE NON — un axe « inconnu » qui porte une note perd sa note (GA-18/GA-19)', () => {
    const view = readDossierRead({
      axes: [
        { key: 'adequation_offre', state: 'measured', value: 4 },
        { key: 'potentiel_commercial', state: 'measured', value: 4 },
        { key: 'fraicheur', state: 'measured', value: 4 },
        // La ligne fautive : « on ne sait pas », et pourtant un 5.
        { key: 'accessibilite', state: 'unknown', value: 5 },
      ],
    })

    const axe = view?.axes.find(a => a.key === 'accessibilite')
    expect(axe).toMatchObject({ state: 'unknown', value: null })
    // 12 sur trois axes notés, jamais 17 sur quatre : la note fantôme ne se
    // somme pas et son axe reste hors du dénominateur.
    expect(view?.score).toMatchObject({ kind: 'score', value: 12, outOf: 15 })
    expect(view?.score.unknownAxes).toContain('accessibilite')
  })

  it('un axe déclaré mesuré SANS note redevient inconnu — un état sans chiffre ne décompose rien', () => {
    const view = readDossierRead({ axes: [{ key: 'concurrence', state: 'measured' }] })

    expect(view?.axes.find(a => a.key === 'concurrence')).toMatchObject({ state: 'unknown', value: null })
  })

  // #4016.L9.a revient sur le seuil de trois axes, délibérément — Louis 13/10/2026 :
  // un score de compte s'affiche dès DEUX axes évaluables.
  it('⚠️ sous DEUX axes notés, il n’y a PAS de score (doctrine « un score n’est jamais nu »)', () => {
    const view = readDossierRead({ axes: [{ key: 'adequation_offre', state: 'measured', value: 5 }] })

    expect(view?.score.kind).toBe('insufficient')
    expect(view?.score).not.toHaveProperty('value', 5)
    expect(view?.score.scoredAxes).toBe(1)
    expect(view?.score.unknownAxes).toHaveLength(6)
  })

  it('#4016.L9.a — deux axes notés font un score, et il dit sur combien d’axes il repose', () => {
    const view = readDossierRead({
      axes: [
        { key: 'adequation_offre', state: 'measured', value: 5 },
        { key: 'concurrence', state: 'partial', value: 5 },
      ],
    })

    expect(view?.score).toMatchObject({ kind: 'score', value: 10, outOf: 10, scoredAxes: 2 })
    expect(view?.score.unknownAxes).toHaveLength(5)
  })

  it('cinq axes notés sur sept : 15/25, jamais 15/35 (#2118.52)', () => {
    const view = readDossierRead({
      axes: [
        { key: 'adequation_offre', state: 'measured', value: 4 },
        { key: 'potentiel_commercial', state: 'measured', value: 4 },
        { key: 'fraicheur', state: 'partial', value: 3 },
        { key: 'accessibilite', state: 'measured', value: 2 },
        { key: 'concurrence', state: 'measured', value: 2 },
        { key: 'capacite_achat_externe', state: 'unknown' },
        { key: 'qualite_preuves', state: 'unknown' },
      ],
    })

    expect(view?.score).toMatchObject({ kind: 'score', value: 15, outOf: 25, scoredAxes: 5, partialAxes: 1 })
    expect(view?.score.unknownAxes).toEqual(['capacite_achat_externe', 'qualite_preuves'])
  })

  it('une clé d’axe inconnue est JETÉE, elle n’invente pas un huitième axe', () => {
    const view = readDossierRead({
      axes: [
        { key: 'adequation_offre', state: 'measured', value: 4 },
        { key: 'sympathie_du_dirigeant', state: 'measured', value: 5 },
      ],
    })

    expect(view?.axes).toHaveLength(7)
    expect(view?.axes.map(a => a.key)).not.toContain('sympathie_du_dirigeant')
    // Et sa note ne se somme nulle part : un seul axe reste noté.
    expect(view?.score).toMatchObject({ kind: 'insufficient', scoredAxes: 1 })
  })

  it('les blocs rédigés arrivent tels quels — le web AFFICHE le texte du modèle, il ne le reformule pas (#2118.19)', () => {
    const view = readDossierRead({
      why_for_your_esn: 'Tes trois domaines répondent au programme publié.',
      recommended_scope: 'Une entité, pas le groupe.',
      best_entry_point: { label: 'Le responsable du programme', target_profile: 'N-1', why: 'Il porte le budget.' },
      access_path: 'Le programme Cloud Souverain est déjà en cours de sourcing.',
      obstacles: [{ label: 'Aucune référence citable', why: 'Elle est demandée avant la réunion.' }],
      anti_advice: { what: 'Ne commence pas par le groupe.', why: 'Il n’arbitre pas ce budget.' },
      next_action: { label: 'Vérifier l’accord-cadre', tab: 'evaluation' },
      missing: [{ label: 'Les titulaires en place', why: 'Aucune source datée.' }],
    })

    expect(view?.whyForYourEsn).toBe('Tes trois domaines répondent au programme publié.')
    expect(view?.recommendedScope).toBe('Une entité, pas le groupe.')
    expect(view?.bestEntryPoint).toMatchObject({ label: 'Le responsable du programme', targetProfile: 'N-1' })
    // #2304.7 (épopée #2932) — Q6, distincte de bestEntryPoint (QUI) : PAR OÙ
    // entrer commercialement.
    expect(view?.accessPath).toBe('Le programme Cloud Souverain est déjà en cours de sourcing.')
    expect(view?.obstacles).toHaveLength(1)
    expect(view?.antiAdvice).toMatchObject({ what: 'Ne commence pas par le groupe.' })
    expect(view?.nextAction).toMatchObject({ label: 'Vérifier l’accord-cadre', tab: 'evaluation', route: null })
    expect(view?.missing[0]).toMatchObject({ label: 'Les titulaires en place' })
  })

  it('une dimension de fiabilité « inconnue » perd son chiffre (#2118.44)', () => {
    const view = readDossierRead({
      reliability: {
        quality: { state: 'partial', value: 61, note: 'Sources publiques solides.' },
        freshness: { state: 'unknown', value: 0, note: 'Rien de daté.' },
      },
    })

    expect(view?.reliability?.quality).toMatchObject({ state: 'partial', value: 61 })
    expect(view?.reliability?.freshness).toMatchObject({ state: 'unknown', value: null })
    expect(view?.reliability?.coverage).toBeNull()
  })

  it('un no-go est TEMPORAIRE par construction, avec son contexte et son déclencheur (#2118.45/.47)', () => {
    const view = readDossierRead({
      no_go: { temporary: true, context: 'Marché notifié en mars.', trigger: 'La fin du marché en 2028.' },
    })

    expect(view?.noGo).toMatchObject({ context: 'Marché notifié en mars.', trigger: 'La fin du marché en 2028.' })
  })

  it('le profil incomplet arrive avec les champs qui manquent (#2118.20)', () => {
    const view = readDossierRead({
      profile_incomplete: true,
      profile_incomplete_fields: ['secteurs cibles', 'taille d’équipe', 42],
    })

    expect(view?.profileIncomplete).toBe(true)
    expect(view?.profileIncompleteFields).toEqual(['secteurs cibles', 'taille d’équipe'])
  })

  it('les chaînes vides ne deviennent pas des blocs vides', () => {
    expect(readDossierRead({ why_for_your_esn: '   ', recommended_scope: '' })).toBeNull()
  })
})
