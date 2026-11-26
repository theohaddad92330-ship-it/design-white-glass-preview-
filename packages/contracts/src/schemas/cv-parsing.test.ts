import { describe, expect, it } from 'vitest'
import {
  CV_DETECTIONS,
  IDENTITY_NAME_REFUSALS,
  canAutoAccept,
  latestCvParseDecisions,
  parsedFieldSchema,
  provenanceForDecision,
  readAvailabilityFromDetection,
  readEmailFromIdentity,
  readLanguagesFromDetection,
  readLocationFromIdentity,
  readPersonNameFromIdentity,
  readPhoneFromIdentity,
  readProfileUrlFromIdentity,
  type ParsedField,
} from './cv-parsing.js'
import type { RecordFieldAudit } from './crm-record.js'

function auditRow(over: Partial<RecordFieldAudit> = {}): RecordFieldAudit {
  return {
    id: 'a4e6e9f0-0000-4000-8000-000000000001',
    entityType: 'consultant',
    entityId: 'a4e6e9f0-0000-4000-8000-00000000000c',
    field: 'cv_parse.identity',
    oldValue: null,
    newValue: 'human',
    source: 'human',
    actorId: 'a4e6e9f0-0000-4000-8000-0000000000aa',
    actorName: 'Jeanne Martin',
    createdAt: '2026-09-20T10:00:00.000Z',
    rule: 'cv_parse.review',
    ...over,
  }
}

function field(over: Partial<ParsedField> = {}): ParsedField {
  return {
    detection: 'skills',
    value: ['Kubernetes'],
    confidence: 0.9,
    sourceExcerpt: 'Kubernetes, Prometheus, Go',
    excerptOffset: 12,
    ...over,
  } as ParsedField
}

describe('le contrat du parsing de CV', () => {
  it('REFUSE un champ détecté sans extrait — un champ sans preuve est indistinguable d’une invention', () => {
    const parsed = parsedFieldSchema.safeParse(field({ sourceExcerpt: '   ' }))
    expect(parsed.success).toBe(false)
  })

  it('accepte un champ NON TROUVÉ sans extrait — « ce CV ne le dit pas » est une lecture juste', () => {
    const parsed = parsedFieldSchema.safeParse(
      field({ detection: 'mobility', value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 }),
    )
    expect(parsed.success).toBe(true)
  })

  it('couvre les quatorze blocs du §4 (#2183.26 formations, #3935 TJM lu — ajoutés aux douze d’origine)', () => {
    expect(CV_DETECTIONS).toHaveLength(14)
    expect(CV_DETECTIONS).toContain('daily_rate')
    expect(CV_DETECTIONS).toContain('experiences')
    expect(CV_DETECTIONS).toContain('availability')
    expect(CV_DETECTIONS).toContain('education')
  })
})

describe('canAutoAccept', () => {
  it('refuse dès qu’un champ CRITIQUE est incertain', () => {
    // L'identité désigne la personne : une erreur là se propage partout.
    expect(canAutoAccept([field(), field({ detection: 'identity', confidence: 0.4 })])).toBe(false)
    expect(canAutoAccept([field(), field({ detection: 'job_title', confidence: 0.5 })])).toBe(false)
  })

  it('refuse dès qu’UN SEUL champ lu est incertain, même secondaire', () => {
    // Le PDF se contredit (§4.2 « aucune confiance faible » vs §14 « plus de
    // 50 % »). On prend le strict : c'est le dernier écran avant qu'un profil
    // parte chez un client, et le coût du strict est un clic de plus.
    const surs = [
      field({ detection: 'languages', confidence: 0.95 }),
      field({ detection: 'environments', confidence: 0.95 }),
    ]
    expect(canAutoAccept(surs)).toBe(true)
    expect(canAutoAccept([...surs, field({ detection: 'sectors', confidence: 0.45 })])).toBe(false)
  })

  it('ne compte PAS un champ non trouvé comme un doute', () => {
    const lus = [
      field({ confidence: 0.95 }),
      field({ detection: 'mobility', value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 }),
      field({ detection: 'availability', value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 }),
    ]
    expect(canAutoAccept(lus)).toBe(true)
  })

  it('refuse quand RIEN n’a été lu', () => {
    // Un CV dont on n'a rien tiré ne se valide pas d'un clic : il n'y a rien à
    // valider, et laisser passer créerait une fiche vide.
    expect(canAutoAccept([])).toBe(false)
    expect(canAutoAccept([field({ value: null, sourceExcerpt: '', excerptOffset: null, confidence: 0 })])).toBe(false)
  })
})

describe('provenanceForDecision', () => {
  it('distingue « corrigé » de « accepté »', () => {
    // Accepter n'est pas écrire. Les confondre ferait croire, six mois plus
    // tard, que quelqu'un a saisi une valeur que personne n'a jamais tapée.
    expect(provenanceForDecision('correct')).toBe('human')
    expect(provenanceForDecision('accept')).toBe('model')
    expect(provenanceForDecision('reject')).toBeNull()
  })
})

// #2184.37 / #2184.38 — traçabilité d'une revue passée : auteur et date.
describe('latestCvParseDecisions', () => {
  it('garde, par détection, la ligne la plus RÉCENTE du journal (trié DESC)', () => {
    const entries: RecordFieldAudit[] = [
      auditRow({ field: 'cv_parse.identity', actorName: 'Jeanne Martin', createdAt: '2026-09-20T10:00:00.000Z' }),
      auditRow({ field: 'cv_parse.identity', actorName: 'Ancien relecteur', createdAt: '2026-09-01T10:00:00.000Z' }),
      // Une ligne de colonne écrite (`full_name`), pas une ligne de décision :
      // elle ne doit pas se substituer à `cv_parse.identity`.
      auditRow({ field: 'full_name', actorName: 'Jeanne Martin', createdAt: '2026-09-20T10:00:00.000Z' }),
    ]

    const decisions = latestCvParseDecisions(entries)

    expect(decisions.identity?.actorName).toBe('Jeanne Martin')
    expect(Object.keys(decisions)).toEqual(['identity'])
  })

  it('ignore une ligne dont le suffixe n’est pas une détection connue', () => {
    expect(latestCvParseDecisions([auditRow({ field: 'cv_parse.not_a_real_block' })])).toEqual({})
  })

  it('rend un objet vide sur un journal vide — une détection jamais revue n’apparaît PAS (GA-18/GA-19)', () => {
    expect(latestCvParseDecisions([])).toEqual({})
  })
})

/**
 * Le bloc `identity` → le NOM d'une personne, ou rien (D367).
 *
 * La mesure qui a produit ces tests (30/08/2026) : le prompt demande « nom
 * complet, e-mail, téléphone, ville — TELS QU'ÉCRITS » dans UN seul `value`
 * dont le type contractuel est `string | string[] | number | null`. Six formes
 * de réponse sont donc légitimes, et le validateur serveur (`_validate_fields`,
 * `apps/ia/app/routers/cv.py`) les accepte TOUTES LES SIX sur les 8 CV du
 * dépôt — il ne vérifie que la CITATION, jamais la valeur.
 *
 * Écrire `value` telle quelle dans `full_name` remplacerait donc un remplissage
 * (le nom du fichier) par un autre (un agrégat nom + e-mail + téléphone +
 * ville). D'où cette lecture : elle accepte ce qui est SANS AMBIGUÏTÉ un nom de
 * personne, et refuse tout le reste EN DISANT POURQUOI.
 */
describe('readPersonNameFromIdentity', () => {
  it('accepte ce qui est sans ambiguïté un nom de personne', () => {
    expect(readPersonNameFromIdentity('Camille Roussel')).toEqual({ name: 'Camille Roussel' })
    expect(readPersonNameFromIdentity('  CAMILLE ROUSSEL  ')).toEqual({ name: 'CAMILLE ROUSSEL' })
    // Le trait d'union d'un prénom composé n'est PAS un séparateur de bloc :
    // confondre `-` (U+002D) et `—` (U+2014) refuserait un nom sur deux.
    expect(readPersonNameFromIdentity('Anne-Marie Le Guen')).toEqual({ name: 'Anne-Marie Le Guen' })
    expect(readPersonNameFromIdentity('Marc Ouedraogo')).toEqual({ name: 'Marc Ouedraogo' })
  })

  /**
   * #3734 (06/10/2026) — RENVERSEMENT ASSUMÉ de la règle « un agrégat est
   * refusé » (D367). Mesuré en prod sur l'import ZIP : 464 fiches sur 484 SANS
   * NOM après lecture, alors que le nom est la première ligne de chaque CV. Le
   * prompt demande nom + e-mail + téléphone + ville dans CE bloc : l'agrégat
   * est la forme NORMALE, pas l'exception. On garde le PREMIER morceau qui est
   * sans ambiguïté un nom de personne (au moins deux mots, que des lettres) —
   * le prompt place le nom en tête.
   */
  it('lit le nom en tête d’un agrégat nom + coordonnées + ville', () => {
    expect(readPersonNameFromIdentity('Busra ABUR, busra.abur@example.com, 06 41 98 19 46, Paris')).toEqual({
      name: 'Busra ABUR',
    })
    expect(readPersonNameFromIdentity('CAMILLE ROUSSEL — Architecte de plateforme (9 ans)')).toEqual({
      name: 'CAMILLE ROUSSEL',
    })
    expect(readPersonNameFromIdentity('Camille Roussel | Lyon')).toEqual({ name: 'Camille Roussel' })
    expect(readPersonNameFromIdentity('Anne-Marie Le Guen\nanne@example.fr')).toEqual({ name: 'Anne-Marie Le Guen' })
  })

  it('lit le nom dans une LISTE, en sautant ce qui n’est pas un nom', () => {
    expect(readPersonNameFromIdentity(['Camille Roussel', 'c@x.fr', '0612345678', 'Lyon'])).toEqual({
      name: 'Camille Roussel',
    })
    // Un seul mot (une ville) n'est jamais pris pour un nom.
    expect(readPersonNameFromIdentity(['Lyon', 'Camille Roussel'])).toEqual({ name: 'Camille Roussel' })
    expect(readPersonNameFromIdentity(42)).toEqual({ name: null, refusal: 'not_text' })
  })

  it('refuse une valeur qui ne transporte QU’UNE coordonnée, sans nom lisible', () => {
    expect(readPersonNameFromIdentity('Camille Roussel camille@exemple.fr')).toEqual({
      name: null,
      refusal: 'carries_contact',
    })
    expect(readPersonNameFromIdentity('camille@exemple.fr, 06 12 34 56 78, Lyon')).toEqual({
      name: null,
      refusal: 'carries_contact',
    })
  })

  it('refuse un agrégat dont aucun morceau n’est un nom de personne', () => {
    expect(readPersonNameFromIdentity('Lyon | Paris')).toEqual({ name: null, refusal: 'joins_several_items' })
    // Un INTITULÉ n'est jamais un nom : casse de phrase, ou mot de métier.
    expect(readPersonNameFromIdentity('Ingénieur plateforme — Lyon')).toEqual({
      name: null,
      refusal: 'joins_several_items',
    })
    expect(readPersonNameFromIdentity('Senior Business Unit Manager | Belgique')).toEqual({
      name: null,
      refusal: 'joins_several_items',
    })
    expect(readPersonNameFromIdentity('IT Security Auditor, Barcelona')).toEqual({
      name: null,
      refusal: 'joins_several_items',
    })
  })

  it('garde les particules d’un nom, en minuscules ou non', () => {
    expect(readPersonNameFromIdentity('Jean de La Fontaine, jean@example.fr')).toEqual({ name: 'Jean de La Fontaine' })
    expect(readPersonNameFromIdentity('Ludwig van Beethoven | Bonn')).toEqual({ name: 'Ludwig van Beethoven' })
    expect(readPersonNameFromIdentity('Ingénieur (9 ans), Lyon')).toEqual({
      name: null,
      refusal: 'joins_several_items',
    })
  })

  it('refuse un champ ÉTIQUETÉ recopié depuis le CV', () => {
    expect(readPersonNameFromIdentity('Nom : Camille Roussel')).toEqual({
      name: null,
      refusal: 'is_a_labelled_field',
    })
  })

  it('refuse un NOM DE FICHIER — c’est le défaut que ce lot répare', () => {
    // Le nom du fichier n'a jamais été un nom de personne. Il reste écrit dans
    // `consultant_documents.filename`, là où il DIT ce qu'il est.
    expect(readPersonNameFromIdentity('CV_2024_v3')).toEqual({ name: null, refusal: 'looks_like_a_file' })
    expect(readPersonNameFromIdentity('Camille Roussel.pdf')).toEqual({ name: null, refusal: 'looks_like_a_file' })
    expect(readPersonNameFromIdentity('Profil_Roussel_VF.docx')).toEqual({
      name: null,
      refusal: 'looks_like_a_file',
    })
  })

  it('refuse l’absence, et ne la confond pas avec un refus de forme', () => {
    // « Ce CV ne dit pas comment la personne s'appelle » et « la valeur lue
    // n'est pas un nom » sont deux informations différentes, et l'écran doit
    // pouvoir les dire différemment.
    expect(readPersonNameFromIdentity(null)).toEqual({ name: null, refusal: 'absent' })
    expect(readPersonNameFromIdentity('   ')).toEqual({ name: null, refusal: 'absent' })
  })

  it('refuse un paragraphe', () => {
    expect(readPersonNameFromIdentity('a'.repeat(101))).toEqual({ name: null, refusal: 'too_long' })
  })

  it('ne rend JAMAIS de valeur de remplissage', () => {
    // L'invariant du lot, posé sur toutes les formes refusées d'un coup : une
    // lecture qui échoue rend `null`, jamais `''`, jamais « Inconnu », jamais
    // le nom du fichier.
    const refusees: ParsedField['value'][] = [
      null,
      '',
      '   ',
      42,
      ['c@x.fr', '0612345678'],
      'CV_2024_v3.pdf',
      'Nom : Camille Roussel',
      'Architecte — Lyon',
      'Camille Roussel c@x.fr',
    ]
    for (const value of refusees) {
      const lu = readPersonNameFromIdentity(value)
      expect(lu.name).toBeNull()
      expect(IDENTITY_NAME_REFUSALS).toContain((lu as { refusal: string }).refusal)
    }
  })
})

// ⚠️ Le bloc `looksLikeAFileName` qui vivait ici a DÉMÉNAGÉ dans
// `file-name.test.ts` avec la définition (D372) : la question ne vit plus dans
// ce fichier, ses cas non plus. `readPersonNameFromIdentity` ci-dessus continue
// de l'exercer là où elle compte — à travers le refus `looks_like_a_file`.

/**
 * Lot 19 (#1789) — le défaut mesuré en production le 10/09 : un CV réel dont
 * l'identité s'écrit « Camille Recette — camille.recette@example.invalid —
 * 06 00 00 00 00 — Paris (75) » perdait l'e-mail ET le téléphone, alors que le
 * nom refuse LÉGITIMEMENT (D367, `carries_contact`) — c'est ce même agrégat qui
 * cause les deux. `readEmailFromIdentity`/`readPhoneFromIdentity` extraient
 * l'un et l'autre INDÉPENDAMMENT du sort du nom.
 */
describe('readEmailFromIdentity — le CV réel du 10/09', () => {
  const AGGREGATE = 'Camille Recette — camille.recette@example.invalid — 06 00 00 00 00 — Paris (75)'

  it('cite l’adresse, et le nom en tête de l’agrégat se lit aussi (#3734)', () => {
    expect(readPersonNameFromIdentity(AGGREGATE)).toEqual({ name: 'Camille Recette' })
    expect(readEmailFromIdentity(AGGREGATE)).toBe('camille.recette@example.invalid')
  })

  it('rend `null` — jamais un refus — quand il n’y a aucune adresse', () => {
    // L'absence n'est pas un défaut de forme : un bloc identity qui ne porte
    // qu'un nom est un CV normal.
    expect(readEmailFromIdentity('Camille Roussel')).toBeNull()
    expect(readEmailFromIdentity(null)).toBeNull()
    expect(readEmailFromIdentity(42)).toBeNull()
  })

  it('cherche aussi dans la forme LISTE — la forme B du prompt', () => {
    expect(readEmailFromIdentity(['Camille Roussel', 'c@x.fr', '0612345678', 'Lyon'])).toBe('c@x.fr')
  })
})

describe('readPhoneFromIdentity — le CV réel du 10/09', () => {
  const AGGREGATE = 'Camille Recette — camille.recette@example.invalid — 06 00 00 00 00 — Paris (75)'

  it('cite le numéro même quand le nom, lui, refuse l’agrégat', () => {
    expect(readPhoneFromIdentity(AGGREGATE)).toBe('06 00 00 00 00')
  })

  it('accepte les formes courantes : compact, pointée, +33', () => {
    expect(readPhoneFromIdentity('Camille Roussel 0612345678')).toBe('0612345678')
    expect(readPhoneFromIdentity('Camille Roussel 06.12.34.56.78')).toBe('06.12.34.56.78')
    expect(readPhoneFromIdentity('Camille Roussel +33 6 12 34 56 78')).toBe('+33 6 12 34 56 78')
  })

  it('rend `null` — jamais un refus — quand il n’y a aucun numéro', () => {
    expect(readPhoneFromIdentity('Camille Roussel')).toBeNull()
    expect(readPhoneFromIdentity(null)).toBeNull()
  })

  it('ne prend pas un code postal entre parenthèses pour un numéro', () => {
    expect(readPhoneFromIdentity('Camille Roussel — Paris (75)')).toBeNull()
  })
})

/**
 * #2183.21 — la ville, packée dans le même agrégat `identity` que le nom,
 * l'e-mail et le téléphone, mais SANS extracteur : contrairement à l'e-mail et
 * au téléphone, une ville nue (« Lyon ») n'a aucune forme qui la distingue
 * d'un prénom ou d'un mot quelconque — on ne la devine pas. Ce qui A une
 * forme reconnaissable, c'est une ville accolée à un code : « Paris (75) »
 * (le CV réel du 10/09) ou « 75000 Paris ». Sans ce marqueur, `null` — jamais
 * une ville inventée depuis un segment ambigu.
 */
describe('readLocationFromIdentity', () => {
  const AGGREGATE = 'Camille Recette — camille.recette@example.invalid — 06 00 00 00 00 — Paris (75)'

  it('cite la ville, et le nom en tête de l’agrégat se lit aussi (#3734)', () => {
    expect(readPersonNameFromIdentity(AGGREGATE)).toEqual({ name: 'Camille Recette' })
    expect(readLocationFromIdentity(AGGREGATE)).toBe('Paris (75)')
  })

  it('reconnaît aussi la forme « code postal, ville »', () => {
    expect(readLocationFromIdentity('Camille Roussel — 75000 Paris')).toBe('75000 Paris')
  })

  it('cherche aussi dans la forme LISTE — la forme B du prompt', () => {
    expect(readLocationFromIdentity(['Camille Roussel', 'c@x.fr', '0612345678', 'Lyon (69)'])).toBe('Lyon (69)')
  })

  it('rend `null` — jamais une devinette — sur une ville nue, sans code', () => {
    // « Lyon » seul n'a pas plus de forme qu'un prénom : rien ne le distingue.
    expect(readLocationFromIdentity('Camille Roussel — Lyon')).toBeNull()
  })

  it('rend `null` quand il n’y a aucune ville', () => {
    expect(readLocationFromIdentity('Camille Roussel')).toBeNull()
    expect(readLocationFromIdentity(null)).toBeNull()
    expect(readLocationFromIdentity(42)).toBeNull()
  })
})

/**
 * #3952.3 (retour bêta 08/10) — « faut que l'ocr voit le linkedin » : mesuré en
 * production, un consultant importé par CV n'a JAMAIS `public_profile_url`
 * (aucun extracteur ne le lisait dans l'agrégat `identity`), et
 * `POST /consultants/:id/enrich` 400 dessus (`no_match_key` : « sans profil
 * LinkedIn, la recherche ne peut pas identifier la bonne personne »). Même
 * principe que l'e-mail et le téléphone : une adresse LinkedIn a une FORME
 * reconnaissable sans deviner — elle se cite, indépendamment du sort du nom.
 */
describe('readProfileUrlFromIdentity — cas LinkedIn du retour bêta (#3952.3)', () => {
  const AGGREGATE =
    'Camille Recette — camille.recette@example.invalid — 06 00 00 00 00 — Paris (75) — linkedin.com/in/camille-recette'

  // Bug prod 31/10/2026 : l'adresse citée SANS protocole était écrite telle quelle en base, puis refusée par
  // `consultantUpsertSchema` à chaque enregistrement de la fiche. Elle sort désormais avec `https://`.
  it('cite l’adresse LinkedIn, même packée avec le reste de l’agrégat, avec son protocole', () => {
    expect(readProfileUrlFromIdentity(AGGREGATE)).toBe('https://linkedin.com/in/camille-recette')
  })

  it('reconnaît la forme complète, avec schéma et sous-domaine', () => {
    expect(readProfileUrlFromIdentity('Camille Roussel — https://www.linkedin.com/in/camille-roussel/')).toBe(
      'https://www.linkedin.com/in/camille-roussel/',
    )
  })

  it('cherche aussi dans la forme LISTE — la forme B du prompt', () => {
    expect(readProfileUrlFromIdentity(['Camille Roussel', 'c@x.fr', '0612345678', 'linkedin.com/in/c-roussel'])).toBe(
      'https://linkedin.com/in/c-roussel',
    )
  })

  it('rend `null` — jamais une devinette — quand il n’y a aucun lien LinkedIn', () => {
    expect(readProfileUrlFromIdentity('Camille Roussel')).toBeNull()
    expect(readProfileUrlFromIdentity(null)).toBeNull()
    expect(readProfileUrlFromIdentity(42)).toBeNull()
  })
})

/**
 * #3935.2 (08/10/2026) — l'URL de profil professionnel, packée dans le même
 * agrégat `identity`, même principe que l'e-mail/le téléphone : une FORME
 * reconnaissable sans deviner.
 */
describe('readProfileUrlFromIdentity', () => {
  it('cite une URL LinkedIn complète', () => {
    expect(readProfileUrlFromIdentity('Alex MARTIN — https://www.linkedin.com/in/alex-martin')).toBe(
      'https://www.linkedin.com/in/alex-martin',
    )
  })

  it('reconnaît aussi une URL SANS schéma (« linkedin.com/in/… », le CV réel du #3734)', () => {
    expect(readProfileUrlFromIdentity('LinkedIn :linkedin.com/in/alex-martin | Paris')).toBe(
      'https://linkedin.com/in/alex-martin',
    )
  })

  it('reconnaît un profil Malt', () => {
    expect(readProfileUrlFromIdentity('Camille Roussel — malt.fr/profile/camille-roussel')).toBe(
      'https://malt.fr/profile/camille-roussel',
    )
  })

  it('cherche aussi dans la forme LISTE', () => {
    expect(readProfileUrlFromIdentity(['Camille Roussel', 'c@x.fr', 'https://www.linkedin.com/in/camille'])).toBe(
      'https://www.linkedin.com/in/camille',
    )
  })

  it('retire la ponctuation de fin collée par un séparateur', () => {
    expect(readProfileUrlFromIdentity('Alex MARTIN, https://www.linkedin.com/in/alex-martin, Paris')).toBe(
      'https://www.linkedin.com/in/alex-martin',
    )
  })

  it('rend `null` — jamais composée depuis un nom — quand il n’y a aucune URL', () => {
    expect(readProfileUrlFromIdentity('Camille Roussel — Lyon')).toBeNull()
    expect(readProfileUrlFromIdentity(null)).toBeNull()
    expect(readProfileUrlFromIdentity(42)).toBeNull()
  })
})

/**
 * #3935.2 (08/10/2026) — le bloc `languages` → `{code, level}[]`, signalé
 * « chantier à part » au lot 19 (#1789) : la colonne existait, rien ne la
 * lisait.
 */
describe('readLanguagesFromDetection', () => {
  it('lit un nom de langue seul, niveau `null` — rien n’est deviné', () => {
    expect(readLanguagesFromDetection('Anglais')).toEqual([{ code: 'en', level: null }])
  })

  it('lit un niveau CECRL explicite', () => {
    expect(readLanguagesFromDetection('Anglais (B2), Espagnol (C1)')).toEqual([
      { code: 'en', level: 'b2' },
      { code: 'es', level: 'c1' },
    ])
  })

  it('reconnaît « natif »/« langue maternelle »', () => {
    expect(readLanguagesFromDetection('Français (langue maternelle), Anglais natif')).toEqual([
      { code: 'fr', level: 'natif' },
      { code: 'en', level: 'natif' },
    ])
  })

  it('n’invente JAMAIS un niveau depuis un qualificatif flou', () => {
    expect(readLanguagesFromDetection('Anglais courant, Espagnol bon niveau')).toEqual([
      { code: 'en', level: null },
      { code: 'es', level: null },
    ])
  })

  it('cherche aussi dans la forme LISTE', () => {
    expect(readLanguagesFromDetection(['Anglais (C1)', 'Allemand'])).toEqual([
      { code: 'en', level: 'c1' },
      { code: 'de', level: null },
    ])
  })

  it('garde la PREMIÈRE occurrence d’un code en double', () => {
    expect(readLanguagesFromDetection('Anglais (B2), Anglais (C1)')).toEqual([{ code: 'en', level: 'b2' }])
  })

  it('ignore un nom de langue non reconnu plutôt que de mal le coder', () => {
    expect(readLanguagesFromDetection('Espéranto, Anglais')).toEqual([{ code: 'en', level: null }])
  })

  it('rend `null` quand il n’y a aucune langue reconnue', () => {
    expect(readLanguagesFromDetection('Espéranto')).toBeNull()
    expect(readLanguagesFromDetection(null)).toBeNull()
    expect(readLanguagesFromDetection(42)).toBeNull()
  })
})

/**
 * Lot 19 (#1789) — la disponibilité, deuxième colonne perdue en production :
 * `availability` figure parmi les treize détections, la colonne SQL existe
 * (`CHECK (availability IN (...))`), et rien ne les reliait.
 */
describe('readAvailabilityFromDetection', () => {
  it('reconnaît les quatre mots que le produit utilise déjà pour ce vocabulaire', () => {
    expect(readAvailabilityFromDetection('Disponible : sous 1 mois')).toBe('sous_1_mois')
    expect(readAvailabilityFromDetection('Disponibilité : sous 3 mois')).toBe('sous_3_mois')
    expect(readAvailabilityFromDetection('Disponible immédiatement')).toBe('immediate')
    expect(readAvailabilityFromDetection('En mission jusqu’en décembre, indisponible')).toBe('indisponible')
  })

  it('reconnaît aussi la forme en toutes lettres', () => {
    expect(readAvailabilityFromDetection('Disponible dans un mois')).toBe('sous_1_mois')
    expect(readAvailabilityFromDetection('Disponible dans trois mois')).toBe('sous_3_mois')
  })

  it('ne DEVINE jamais une catégorie sur une mention ambiguë', () => {
    // « Disponible » seul, sans délai ni « immédiat », resterait une
    // interprétation : la fonction rend `null`, la colonne reste `inconnu`.
    expect(readAvailabilityFromDetection('Disponible')).toBeNull()
    expect(readAvailabilityFromDetection('Disponible sous 6 mois')).toBeNull()
    expect(readAvailabilityFromDetection(null)).toBeNull()
    expect(readAvailabilityFromDetection('')).toBeNull()
  })
})
