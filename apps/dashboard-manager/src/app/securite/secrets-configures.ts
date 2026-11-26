/**
 * #1671.4 — le bloc « secrets configurés » de `/securite`.
 *
 * ⚠️ PRÉSENCE, JAMAIS VALEUR — la garde `aucun-secret-affiche.test.ts` le
 * vérifie côté écran, et elle a raison de le vérifier : ce module ne rend
 * jamais la VALEUR d'un secret, seulement s'il est POSÉ. Il ne rend pas non
 * plus le NOM BRUT de la variable d'environnement — même principe que le
 * registre des kill-switches (`common/kill-switches.ts`) : ce qui s'affiche
 * est ce que la capacité EST, pas comment on la configure.
 *
 * Fonction PURE (prend l'environnement en paramètre) pour rester testable
 * sans mock de `process.env` — le point d'entrée qui LIT l'environnement
 * (`secretsConfiguresDepuisEnvironnement`) est la seule partie qui ne l'est
 * pas, et elle ne fait qu'appeler la fonction pure avec `process.env`.
 */

type SecretConfigure = { capacite: string; configure: boolean }

const CAPACITES_SUIVIES: ReadonlyArray<{ capacite: string; vars: readonly string[] }> = [
  { capacite: 'Identité des opérateurs (DM_ALLOWED_EMAILS)', vars: ['DM_ALLOWED_EMAILS'] },
  { capacite: 'Basic Auth (compte + mot de passe)', vars: ['DM_BASIC_AUTH_USER', 'DM_BASIC_AUTH_PASSWORD'] },
  { capacite: 'Secret interne vers l’API', vars: ['INTERNAL_API_SECRET'] },
  { capacite: 'Adresse de l’API', vars: ['API_BASE_URL'] },
  { capacite: 'Projet Supabase (URL + clé anonyme)', vars: ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] },
]

/** Toutes les variables d'une capacité doivent être posées pour la dire « configurée ». */
export function secretsConfigures(env: Readonly<Record<string, string | undefined>>): SecretConfigure[] {
  return CAPACITES_SUIVIES.map(({ capacite, vars }) => ({
    capacite,
    configure: vars.every(nom => Boolean(env[nom])),
  }))
}

/** Le point d'entrée qui lit RÉELLEMENT l'environnement — jamais dans un `.tsx`. */
export function secretsConfiguresDepuisEnvironnement(): SecretConfigure[] {
  return secretsConfigures(process.env)
}
