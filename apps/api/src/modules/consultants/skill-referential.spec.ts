import { SKILLS } from '@bellum/contracts'
import {
  canonicalSkill,
  extractSkills,
  familySkill,
  normaliseSkillText,
  relatedSkill,
  sameSkill,
  skillReferential,
  splitSkillEntries,
  strictSameSkill,
} from './skill-referential'

/**
 * Le référentiel de compétences (addendum final p62).
 *
 * Le défaut qu'il corrige était invisible : un besoin « Kubernetes » ne trouvait
 * pas le consultant qui avait écrit « K8s » sur sa fiche. Un faux négatif ne
 * lève aucune alerte, n'apparaît dans aucun journal, et fait simplement passer
 * une mission à côté du bon profil.
 *
 * Ce qui se teste aussi — et qui compte autant — c'est ce que le référentiel ne
 * fait PAS : aucune inférence, aucun terme trop générique, et rien d'inventé sur
 * une ligne qu'il ne reconnaît pas.
 */

describe('normalisation typographique', () => {
  it('retire accents et casse', () => {
    expect(normaliseSkillText('Cybersécurité')).toBe('cybersecurite')
  })

  it('préserve les caractères qui DISTINGUENT une compétence', () => {
    // Écraser `#` et `.` confondrait C et C#, et ferait de « .NET » un « net ».
    expect(normaliseSkillText('C#')).toBe('c#')
    expect(normaliseSkillText('.NET')).toBe('.net')
    expect(normaliseSkillText('Node.js')).toBe('node.js')
  })
})

describe('résolution canonique', () => {
  it('rapproche les écritures d’une même compétence', () => {
    expect(canonicalSkill('K8s')).toBe('kubernetes')
    expect(canonicalSkill('kube')).toBe('kubernetes')
    expect(canonicalSkill('OpenShift')).toBe('kubernetes')
    expect(canonicalSkill('Kubernetes')).toBe('kubernetes')
  })

  it('reconnaît une compétence dans une entrée composée', () => {
    // Un CV écrit « Kubernetes / Docker » sur une seule ligne.
    expect(canonicalSkill('Kubernetes / Docker')).toBe('kubernetes')
    expect(canonicalSkill('React & TypeScript')).toBe('react')
  })

  it('ne scinde pas un alias multi-mots', () => {
    expect(canonicalSkill('machine learning')).toBe('machine learning')
  })

  it('rend null sur ce qu’il ne connaît pas — sans rien inventer', () => {
    // La plupart des lignes d'un CV ne sont pas des compétences. Inventer une
    // canonique pour chacune polluerait le référentiel.
    expect(canonicalSkill('Master 2 informatique')).toBeNull()
    expect(canonicalSkill('Permis B')).toBeNull()
    expect(canonicalSkill('')).toBeNull()
  })
})

describe('équivalence de deux écritures', () => {
  it('dit oui quand les deux résolvent la même compétence', () => {
    expect(sameSkill('k8s', 'Kubernetes')).toBe(true)
    expect(sameSkill('JS', 'javascript')).toBe(true)
  })

  it('dit non entre deux compétences distinctes', () => {
    expect(sameSkill('kubernetes', 'terraform')).toBe(false)
  })

  it('compare littéralement ce qu’il ne connaît pas — sans prétendre trancher', () => {
    expect(sameSkill('Outil maison XYZ', 'outil maison xyz')).toBe(true)
    expect(sameSkill('Outil maison XYZ', 'autre chose')).toBe(false)
  })

  it('ne déduit JAMAIS une compétence d’une autre', () => {
    // « connaît AWS » n'implique pas « connaît Terraform ». Une compétence non
    // écrite reste absente : c'est la règle produit, et le module de preuve
    // s'appuie dessus.
    expect(sameSkill('aws', 'terraform')).toBe(false)
    expect(sameSkill('docker', 'kubernetes')).toBe(false)
  })
})

describe('extraction depuis un texte libre', () => {
  it('trouve les compétences d’une phrase de CV', () => {
    const found = extractSkills('Migration K8s et mise en place de pipelines CI CD sur AWS')
    expect(found).toContain('kubernetes')
    expect(found).toContain('devops')
    expect(found).toContain('aws')
  })

  it('ne matche pas un alias court à l’intérieur d’un autre mot', () => {
    // « ml » dans « html », « bi » dans « ambition » : la borne de mot ne suffit
    // pas pour des alias de deux lettres, d'où la comparaison sur mots entiers.
    const found = extractSkills('Intégration HTML avec beaucoup d’ambition')
    expect(found).not.toContain('machine learning')
    expect(found).not.toContain('powerbi')
  })

  it('dédoublonne : deux écritures de la même compétence ne comptent qu’une fois', () => {
    const found = extractSkills('Kubernetes, k8s, openshift')
    expect(found.filter(skill => skill === 'kubernetes')).toHaveLength(1)
  })

  it('rend une liste stable — deux appels donnent le même ordre', () => {
    const text = 'React, TypeScript, Node, Kubernetes'
    expect(extractSkills(text)).toEqual(extractSkills(text))
  })

  it('rend [] sur un texte sans compétence', () => {
    expect(extractSkills('Titulaire du permis B, anglais courant')).toEqual([])
  })
})

describe('hygiène du référentiel', () => {
  it('n’enregistre aucun alias trop court ou trop générique', () => {
    // « dev », « data », « cloud » seuls matchent tout et n'apprennent rien :
    // les ajouter ferait remonter tout le vivier sur n'importe quel besoin.
    const banned = new Set(['dev', 'data', 'cloud', 'web', 'app', 'it', 'si'])
    for (const { aliases } of skillReferential()) {
      for (const alias of aliases) {
        expect(banned.has(normaliseSkillText(alias))).toBe(false)
        expect(normaliseSkillText(alias).length).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('n’a pas deux canoniques qui se disputent le même alias', () => {
    // Un alias ambigu rendrait le matching dépendant de l'ordre des clés d'un
    // objet — donc silencieusement instable.
    const seen = new Map<string, string>()
    for (const { canonical, aliases } of skillReferential()) {
      for (const alias of aliases) {
        const key = normaliseSkillText(alias)
        const previous = seen.get(key)
        expect(previous ?? canonical).toBe(canonical)
        seen.set(key, canonical)
      }
    }
  })

  it('résout chaque canonique vers elle-même', () => {
    for (const { canonical } of skillReferential()) {
      expect(canonicalSkill(canonical)).toBe(canonical)
    }
  })
})

describe('strictSameSkill / relatedSkill — alias contre famille', () => {
  it('rapproche deux écritures de la MÊME compétence', () => {
    expect(strictSameSkill('K8s', 'Kubernetes')).toBe(true)
    expect(strictSameSkill('PySpark', 'Spark')).toBe(true)
  })

  it('refuse de confondre deux produits distincts d’une même famille', () => {
    // C'est l'exemple de la maquette du PDF 4 : « ✓ Spark » et « ✗ Databricks ».
    expect(strictSameSkill('Databricks', 'Spark')).toBe(false)
    expect(strictSameSkill('Oracle', 'PostgreSQL')).toBe(false)
    expect(strictSameSkill('Tableau', 'Power BI')).toBe(false)
  })

  it('les déclare ADJACENTES plutôt que de les perdre', () => {
    expect(relatedSkill('Databricks', 'Spark')).toBe(true)
    expect(relatedSkill('Oracle', 'PostgreSQL')).toBe(true)
    expect(relatedSkill('Kubernetes', 'K8s')).toBe(false)
    expect(relatedSkill('COBOL', 'React')).toBe(false)
  })

  it('laisse la RECHERCHE inchangée — sameSkill continue de regrouper la famille', () => {
    // L'écran Vivier doit toujours sortir un profil PostgreSQL sur « SQL ».
    expect(sameSkill('PostgreSQL', 'SQL')).toBe(true)
  })
})

describe('une compétence précise ne s’élargit jamais en famille — #2328.19/.20/.21', () => {
  it('C# ne prouve pas ".NET expert" — #2328.19', () => {
    // C# est un langage ; ".NET" est la plate-forme entière (ASP.NET, EF, WPF…).
    // Écrire "C#" sur un CV ne prouve pas l'expertise de toute la plate-forme.
    expect(strictSameSkill('C#', '.NET')).toBe(false)
    // La RECHERCHE continue de regrouper la famille (même logique que Spark/Databricks).
    expect(relatedSkill('C#', '.NET')).toBe(true)
    expect(sameSkill('C#', '.NET')).toBe(true)
  })

  it('HSE reste sa propre compétence, jamais « réglementaire complet » — #2328.20', () => {
    // Un consultant HSE (santé-sécurité-environnement) n'est pas reconnu du tout
    // aujourd'hui : sans entrée canonique, il ne matche jamais un besoin HSE.
    expect(canonicalSkill('HSE')).toBe('hse')
    expect(canonicalSkill('QHSE')).not.toBe('hse')
  })

  it('AUTOSAR reste sa propre compétence, jamais « auto embarquée complète » — #2328.21', () => {
    // Même défaut que HSE : AUTOSAR (norme logicielle auto embarquée précise)
    // n'est reconnu par aucune entrée canonique aujourd'hui.
    expect(canonicalSkill('AUTOSAR')).toBe('autosar')
    expect(strictSameSkill('AUTOSAR', 'embarque')).toBe(false)
  })
})

// KEVIN-FIX K.2 — « java spring vue » tapé d'un trait n'est PAS une compétence : trois, sans doublon.
describe('splitSkillEntries', () => {
  it('découpe espaces, virgules et slash quand chaque morceau est une compétence connue', () => {
    expect(splitSkillEntries(['java spring vue'])).toEqual(['java', 'spring', 'vue'])
    expect(splitSkillEntries(['Java/Spring/Vue'])).toEqual(['Java', 'Spring', 'Vue'])
    expect(splitSkillEntries(['Java, Spring ; Vue'])).toEqual(['Java', 'Spring', 'Vue'])
  })

  it('garde les composés connus d’une pièce (Spring Boot, Vue.js, Machine Learning)', () => {
    expect(splitSkillEntries(['Spring Boot Vue.js'])).toEqual(['Spring Boot', 'Vue.js'])
    expect(splitSkillEntries(['Java, Machine Learning'])).toEqual(['Java', 'Machine Learning'])
  })

  it('dédoublonne sans tenir compte de la casse, première écriture gardée', () => {
    expect(splitSkillEntries(['java spring vue', 'Spring', 'VUE'])).toEqual(['java', 'spring', 'vue'])
  })

  it('NE découpe PAS ce qui n’est pas une liste de compétences connues', () => {
    expect(splitSkillEntries(['Outil maison Zephyr'])).toEqual(['Outil maison Zephyr'])
    expect(splitSkillEntries(['Chef de projet'])).toEqual(['Chef de projet'])
    expect(splitSkillEntries(['CI/CD'])).toEqual(['CI/CD'])
    expect(splitSkillEntries(['Expert Java'])).toEqual(['Expert Java'])
  })

  it('une virgule sépare toujours, même quand un morceau est inconnu', () => {
    expect(splitSkillEntries(['Snowflake, Outil maison Zephyr'])).toEqual(['Snowflake', 'Outil maison Zephyr'])
  })

  it('ignore le vide et les valeurs qui ne sont pas du texte', () => {
    expect(splitSkillEntries(['', '  ', 42 as unknown as string, 'Java'])).toEqual(['Java'])
  })
})

// #4434 (épopée #4433) — le dictionnaire du vivier LIT le référentiel partagé (`@bellum/contracts`) : une
// compétence ajoutée là-bas est reconnue ici, sans seconde liste.
describe('#4434 — le vivier consomme le référentiel partagé des critères', () => {
  it('reconnaît une compétence que seul le référentiel partagé déclare', () => {
    expect(canonicalSkill('Flutter')).toBe('flutter')
    expect(canonicalSkill('dart')).toBe('flutter')
    expect(sameSkill('C++', 'cpp')).toBe(true)
  })

  it('expose les mêmes canoniques que le référentiel partagé', () => {
    const shared = Object.keys(SKILLS).sort()
    expect(
      skillReferential()
        .map(entry => entry.canonical)
        .sort(),
    ).toEqual(shared)
  })

  it('deux compétences de la même FAMILLE sont voisines (React ↔ Angular), pas deux domaines différents', () => {
    expect(familySkill('React', 'Angular')).toBe(true)
    expect(familySkill('React', 'JavaScript')).toBe(true)
    expect(familySkill('React', 'reactjs')).toBe(false)
    expect(familySkill('React', 'SAP')).toBe(false)
    expect(familySkill('React', 'Java')).toBe(false)
  })
})
