import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Le copilote doit AMENER la vue sur sa réponse. C'est le troisième correctif
 * sur ce même symptôme, et le seul qui repose sur une mesure plutôt que sur une
 * lecture du code.
 *
 * Relevé dans la page en production le 04/08, sur le conteneur des messages :
 *
 *   scrollIntoView({ behavior: 'smooth' })    → scrollTop reste à 0
 *   scrollIntoView({ behavior: 'auto' })      → scrollTop passe à 1015 / 1014
 *   box.scrollTo({ top, behavior: 'smooth' }) → reste à 0
 *   box.scrollTop = box.scrollHeight          → 1015 / 1014
 *
 * Le défilement DOUX est abandonné sur ce conteneur — sans erreur, sans
 * `prefers-reduced-motion`, donc sans rien qui puisse alerter. C'est ce silence
 * qui rend la garde nécessaire : quelqu'un rétablira `behavior: 'smooth'` un
 * jour pour « adoucir », les tests passeront, et le copilote redeviendra muet à
 * l'écran.
 *
 * La garde est SOURCE et non DOM : jsdom n'a pas de mise en page, `scrollHeight`
 * y vaut toujours 0, et un test qui affirmerait le contraire prouverait le
 * contraire de ce qu'il annonce.
 */
const CHAT_SOURCE = readFileSync(join(__dirname, 'Chat.tsx'), 'utf8')

/**
 * Le CODE, sans les commentaires. Le fichier EXPLIQUE la mesure ci-dessus, donc
 * il cite forcément les appels bannis : chercher dans le texte brut ferait
 * échouer la garde sur sa propre justification.
 */
const CHAT_CODE = CHAT_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

describe('défilement du copilote', () => {
  it('ne défile pas en douceur — c’est un no-op mesuré sur ce conteneur', () => {
    expect(CHAT_CODE).not.toMatch(/behavior:\s*'smooth'/)
    // #2429.4 — un `scrollIntoView({ behavior: 'auto' })` existe désormais, mais
    // pour un fil DIFFÉRENT (le saut vers un artefact désigné par un lien copié,
    // sur `target`, jamais sur `messagesBoxRef`) : la mesure ci-dessus dit qu'`auto`
    // fonctionne, seul `smooth` reproduit le silence — déjà banni ci-dessus, sans
    // exception d'aucune sorte.
    expect(CHAT_CODE).not.toMatch(/messagesBoxRef\.current\??\.scrollIntoView\s*\(/)
  })

  it('affecte scrollTop sur la zone scrollable — le seul geste qui agit', () => {
    expect(CHAT_SOURCE).toMatch(/box\.scrollTop\s*=\s*box\.scrollHeight/)
  })

  it('la zone scrollable porte bien la ref, sinon rien ne défile', () => {
    // Le piège de la première tentative : la ref existait, mais posée sur un
    // élément HORS de la zone scrollable.
    // #3050 a étalé les attributs de cette balise sur plusieurs lignes
    // (commentaires, `data-testid`) : `[^>]*` traverse jusqu'à la fermeture
    // du tag SANS déborder sur l'élément suivant.
    expect(CHAT_SOURCE).toMatch(/<div\s+ref=\{messagesBoxRef\}[^>]*className="[^"]*overflow-y-auto/)
  })
})
