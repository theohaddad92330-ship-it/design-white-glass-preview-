import { buildLocateCommands } from './locate-code'

describe('buildLocateCommands', () => {
  it('cherche la route telle que TanStack l’écrit, segments variables remis en $', () => {
    const commands = buildLocateCommands({
      route: '/accounts/9d359267-f7ee-430f-a614-2044a2e77ab5/plan',
      componentStack: [],
      grepTokens: [],
    })
    // Chercher l'uuid réel ne rendrait jamais rien — et c'est le genre de
    // commande qui fait conclure « le code n'existe pas ».
    expect(commands).toEqual([`rg -n "createFileRoute('/accounts/$/plan')" apps/web/src/routes`])
  })

  it('met les composants AVANT les textes', () => {
    const commands = buildLocateCommands({
      route: null,
      componentStack: ['OAuthProviderCard', 'IntegrationCenterPage'],
      grepTokens: ['Reconnecter'],
    })
    expect(commands[0]).toContain('function OAuthProviderCard')
    expect(commands.at(-1)).toContain('"Reconnecter"')
  })

  it('écarte ce qui n’est pas un nom de composant', () => {
    const commands = buildLocateCommands({
      route: null,
      componentStack: ['div', 'Box2', 'a'],
      grepTokens: [],
    })
    expect(commands).toEqual(['rg -n "function Box2" apps/web/src packages/ui/src'])
  })

  it('échappe un libellé qui contient une apostrophe', () => {
    const [command] = buildLocateCommands({
      route: null,
      componentStack: [],
      grepTokens: ["Voir l'organigramme"],
    })
    expect(command).toBe(`rg -n "Voir l'organigramme" apps/web/src packages/ui/src`)
  })

  // Un bloc de commandes qui ne cherchent rien fait perdre plus de temps qu'il
  // n'en gagne : on préfère ne rien rendre.
  it('ne rend rien quand on ne sait rien de l’élément', () => {
    expect(buildLocateCommands({ route: null, componentStack: [], grepTokens: [] })).toEqual([])
  })
})

/**
 * ⚠️ D'OÙ VIENT LE RETOUR DÉCIDE OÙ CHERCHER.
 *
 * Les commandes visaient `apps/web/src` en dur. Un retour d'opérateur envoyait
 * donc chercher dans l'application CLIENTE le composant d'un écran du
 * back-office : trois commandes qui ne rendent jamais rien, et le genre de
 * silence qui fait conclure « le code n'existe pas ».
 */
describe('l’origine du retour', () => {
  it('cherche dans l’app cliente par défaut', () => {
    const commands = buildLocateCommands({
      route: '/accounts',
      componentStack: ['AccountCard'],
      grepTokens: ['Relancer'],
    })

    expect(commands.join('\n')).toContain('apps/web/src')
    expect(commands.join('\n')).not.toContain('dashboard-manager')
  })

  it('cherche dans le back-office quand le retour en vient', () => {
    const commands = buildLocateCommands({
      route: '/clients',
      componentStack: ['ClientsTable'],
      grepTokens: ['Incarner'],
      origin: 'backoffice',
    })

    const joined = commands.join('\n')
    expect(joined).toContain('apps/dashboard-manager/src')
    // ⚠️ Aucune commande ne doit renvoyer vers l'app cliente : c'est tout le
    // point, et une seule qui reste ferait perdre le temps qu'on veut gagner.
    expect(joined).not.toContain('apps/web/src')
    expect(joined).not.toContain('packages/ui/src')
  })

  /**
   * Une route Next est un DOSSIER, pas un `createFileRoute`. Chercher un appel
   * de fonction qui n'existe nulle part dans cette app est une commande vide de
   * plus — exactement ce que ce fichier existe pour éviter.
   */
  it('ne cherche pas un `createFileRoute` dans une app Next', () => {
    const commands = buildLocateCommands({
      route: '/clients',
      componentStack: [],
      grepTokens: [],
      origin: 'backoffice',
    })

    expect(commands[0]).toBe('ls apps/dashboard-manager/src/app/clients')
    expect(commands.join('\n')).not.toContain('createFileRoute')
  })
})
