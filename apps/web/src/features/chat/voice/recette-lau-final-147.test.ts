import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { chatVoiceTranscribeSchema } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * #2434 — LA RECETTE de LAU-FINAL-147 (voix), douze scénarios, écrits.
 *
 * L'issue (section RECETTE) en énumère douze : dictée · correction · accents ·
 * bruit · jargon · français/anglais · interruption · permission refusée ·
 * action sensible · écran verrouillé · audio supprimé · lecteur d'écran.
 *
 * Même discipline que `apps/api/src/modules/analysis/recette-lau-final-059.spec.ts`
 * et `apps/api/src/modules/analytics/recette-lau-final-156.spec.ts` : la
 * plupart sont des RAPPELS PLUTÔT QUE DES DOUBLONS d'une preuve déjà écrite
 * ailleurs (GA-26 — un réglage/une preuve vit à un seul endroit, les réécrire
 * ici les ferait dériver un jour l'une de l'autre).
 *
 * #2434.74/.75/.77 (27/09/2026) — accents, bruit ambiant, mélange
 * français/anglais : LA RECONNAISSANCE elle-même reste hors de portée (aucune
 * ligne de ce dépôt ne peut juger un accent ou un niveau de bruit — délégué au
 * fournisseur), mais le GESTE, lui, est désormais construit : `language`
 * accepte `'auto'` (Whisper détecte seul plutôt que de forcer une langue
 * erronée) et la langue détectée revient à l'écran. Les trois scénarios
 * pointent maintenant vers cette construction plutôt que vers une impossibilité.
 */

const WEB_SRC = join(__dirname, '..', '..', '..')
const API_SRC = join(__dirname, '..', '..', '..', '..', '..', 'api', 'src')

function fileContains(path: string, needle: string): boolean {
  return readFileSync(path, 'utf8').includes(needle)
}

describe('#2434 — recette LAU-FINAL-147 (voix)', () => {
  // ── 1. dictée ──────────────────────────────────────────────────────────────
  describe('1. dictée', () => {
    it('EST déjà recettée — Chat.voice.test.tsx : le texte dicté arrive dans la saisie, rien ne part sans le clic (GA-26)', () => {
      const path = join(WEB_SRC, 'features', 'chat', 'view', 'Chat.voice.test.tsx')
      expect(fileContains(path, "'texte transcrit dans la saisie, modifiable")).toBe(true)
      expect(fileContains(path, 'askLauraStreamingMock).not.toHaveBeenCalled()')).toBe(true)
    })
  })

  // ── 2. correction ──────────────────────────────────────────────────────────
  describe('2. correction', () => {
    it('EST déjà recettée — le MÊME test édite le transcript avant l’envoi (#1939.9, GA-26)', () => {
      const path = join(WEB_SRC, 'features', 'chat', 'view', 'Chat.voice.test.tsx')
      expect(fileContains(path, 'Quels signaux récents sur Airbus')).toBe(true)
    })
  })

  // ── 3. accents — RECONNAISSANCE non jouable, le GESTE l'est (#2434.74/.75) ──
  describe('3. accents', () => {
    it('la RECONNAISSANCE reste hors de portée (déléguée au fournisseur), mais `auto` évite de forcer une langue erronée', () => {
      const shape = chatVoiceTranscribeSchema.shape
      expect(Object.keys(shape).sort()).toEqual(['accountId', 'audioB64', 'durationMs', 'language'])
      // #2434.74/.75 — un accent marqué ne force plus la langue de l'interface :
      // `'auto'` laisse le fournisseur détecter seul.
      expect(shape.language.unwrap().options).toEqual(['fr', 'en', 'auto'])
    })
  })

  // ── 4. bruit ────────────────────────────────────────────────────────────────
  describe('4. bruit', () => {
    it('N’EST PAS jouable ici : aucun paramètre de niveau de bruit n’existe dans le contrat — hors de portée, sans variante web', () => {
      const shape = chatVoiceTranscribeSchema.shape
      expect(shape).not.toHaveProperty('noiseLevel')
      expect(shape).not.toHaveProperty('denoise')
      // À la différence de l'accent ou du mélange de langues, un niveau de
      // bruit n'a pas de geste web équivalent à proposer (ce n'est pas un
      // CHOIX de la personne) : la réduction de bruit reste entièrement
      // déléguée au fournisseur, sans paramètre à exposer côté produit.
    })
  })

  // ── 5. jargon ───────────────────────────────────────────────────────────────
  describe('5. jargon', () => {
    it('EST déjà recettée — le biais de vocabulaire ESN est transmis au service de transcription (#2434.34..38, GA-26)', () => {
      const path = join(API_SRC, 'modules', 'ia-proxy', 'chat-voice.controller.spec.ts')
      expect(fileContains(path, '#2434.34/.35/.36/.37/.38')).toBe(true)
    })
  })

  // ── 6. français/anglais — RECONNAISSANCE non jouable, le GESTE l'est ─────
  describe('6. français/anglais', () => {
    it('un énoncé mixte n’a toujours aucune représentation PAR MOT, mais `auto` laisse le fournisseur choisir plutôt que de forcer', () => {
      const language = chatVoiceTranscribeSchema.shape.language
      // #2434.77 — `'auto'` s'ajoute à `'fr'`/`'en'` : un mélange dans le même
      // enregistrement n'a toujours AUCUNE représentation mot à mot (le
      // contrat porte une langue par appel, jamais une liste), mais forcer
      // `'fr'` sur un énoncé mêlé anglais n'est plus la seule option.
      expect(language.unwrap().options).toEqual(['fr', 'en', 'auto'])
      // La preuve que `'auto'` part bien SANS langue forcée au fournisseur,
      // et que la langue détectée revient à l'écran : voir
      // `transcription.client.spec.ts` (« verbose_json ») et
      // `chat-voice.controller.spec.ts` (« auto ne se transmet PAS »).
      const apiSpec = join(API_SRC, 'modules', 'ia-proxy', 'chat-voice.controller.spec.ts')
      expect(fileContains(apiSpec, '#2434.74/.75/.77')).toBe(true)
    })
  })

  // ── 7. interruption ─────────────────────────────────────────────────────────
  describe('7. interruption', () => {
    // #2434.78 — distinct de #2434.27 : celui-ci interrompt UNE lecture hors
    // session, celui-là interrompt Laura EN SESSION (mode conversation,
    // `useVoiceConversation`) sans la refermer — le barge-in de l'issue.
    it('EST déjà recettée — en SESSION, interrompre coupe la lecture sans fermer la conversation (#2434.78, GA-26)', () => {
      const path = join(WEB_SRC, 'features', 'chat', 'voice', 'useVoiceConversation.test.ts')
      expect(fileContains(path, 'coupe SEULEMENT la lecture — la session continue')).toBe(true)
    })
  })

  // ── 8. permission refusée ────────────────────────────────────────────────────
  describe('8. permission refusée', () => {
    it('EST déjà recettée — raison nommée, aucun enregistreur, retour au repos (useVoiceMode.test.tsx, GA-26)', () => {
      const path = join(WEB_SRC, 'features', 'chat', 'voice', 'useVoiceMode.test.tsx')
      expect(fileContains(path, 'permission refusée : raison nommée, aucun enregistreur, retour au repos')).toBe(true)
    })

    // Même scénario, EN SESSION (mode conversation) : un micro refusé referme
    // la session plutôt que de la laisser bloquée sur « écoute ».
    it('EST déjà recettée — en SESSION, un micro refusé referme la conversation plutôt que de rester bloquée (#2434.79, GA-26)', () => {
      const path = join(WEB_SRC, 'features', 'chat', 'voice', 'useVoiceConversation.test.ts')
      expect(fileContains(path, 'referme la session plutôt que de rester bloquée')).toBe(true)
    })
  })

  // ── 9. action sensible ───────────────────────────────────────────────────────
  describe('9. action sensible', () => {
    it('EST déjà recettée — la confirmation d’une carte est un geste, jamais un effet de bord (GA-387, GA-26)', () => {
      const webGuard = join(
        WEB_SRC,
        'architecture',
        'la-confirmation-dune-carte-est-un-geste-jamais-automatique.test.ts',
      )
      expect(fileContains(webGuard, 'GA-387')).toBe(true)
      expect(fileContains(webGuard, '#2434.52')).toBe(true)
      // Côté API, la transcription elle-même n'écrit jamais de message ni
      // n'appelle le modèle (même garde GA-387) : la voix ne peut agir que par
      // la carte de confirmation ci-dessus, jamais en direct.
      const apiGuard = join(API_SRC, 'architecture', 'la-transcription-vocale-necrit-jamais-de-message.spec.ts')
      expect(fileContains(apiGuard, 'GA-387')).toBe(true)
      expect(fileContains(apiGuard, 'transcribeVoiceMessage')).toBe(true)
    })
  })

  // ── 10. écran verrouillé ─────────────────────────────────────────────────────
  describe('10. écran verrouillé', () => {
    it('EST déjà recettée — la page en arrière-plan (onglet quitté, téléphone verrouillé) arrête l’écoute (useVoiceMode.test.tsx, GA-26)', () => {
      const path = join(WEB_SRC, 'features', 'chat', 'voice', 'useVoiceMode.test.tsx')
      expect(fileContains(path, 'la page passe en arrière-plan')).toBe(true)
    })
  })

  // ── 11. audio supprimé ───────────────────────────────────────────────────────
  describe('11. audio supprimé', () => {
    it('EST déjà recettée — la purge des 30 jours atteint les messages vocaux, garde de bout en bout (GA-26)', () => {
      const path = join(API_SRC, 'modules', 'storage', 'voice-retention-reachability.spec.ts')
      expect(fileContains(path, 'chat_voice_message')).toBe(true)
      expect(fileContains(path, "@Cron('41 3 * * *')")).toBe(true)
    })
  })

  // ── 12. lecteur d'écran ──────────────────────────────────────────────────────
  describe('12. lecteur d’écran', () => {
    /**
     * #2434.83 (27/09/2026) — LE PROTOCOLE ÉCRIT (ici, dans le fichier de
     * test — pas seulement dans le doc externe). Ce que la charpente ARIA
     * DOIT porter, et ce qu'un humain doit ensuite vérifier À L'OREILLE :
     *
     *  1. `VoiceInput.tsx` — chaque état (repos, permission, écoute,
     *     transcription, erreur persistante) porte `role="status"` (annoncé
     *     SANS focus dessus) ou `role="group"` (annoncé quand on l'atteint) ;
     *     « J'écoute » porte désormais `role="status"` sur le TEXTE, pas
     *     seulement sur le groupe qui le contient.
     *  2. `VoiceConversation.tsx` — la phase (« J'écoute », « Envoi… »,
     *     « Laura répond », l'échec) porte `role="status"` + `aria-live="polite"`
     *     explicite : une conversation qui enchaîne SEULE doit s'entendre
     *     SANS qu'on ait le focus dessus, contrairement à `VoiceInput` où
     *     chaque étape suit un clic.
     *  3. Humain (mémoire : « preuve ÉCRAN ne se remplace pas par un grep ») —
     *     lancer une conversation vocale complète (VoiceOver ou NVDA), sans
     *     regarder l'écran : démarrer, poser une question, entendre l'envoi
     *     PUIS la réponse PUIS la reprise d'écoute, interrompre la lecture,
     *     arrêter la conversation — chaque transition doit s'entendre.
     *
     * La session humaine elle-même n'est PAS consignée ici (#2436.17/.18) :
     * ce test PROUVE la charpente (1, 2), le protocole ci-dessus est ce que
     * `docs/accessibilite-recette-humaine.md` § 2, points 5 et 6, demandent
     * de suivre pour produire la preuve écran.
     */
    it('la charpente ARIA existe côté code (RAPPEL) pour la dictée ET la conversation ; le verdict reste HUMAIN et non consigné (#2436.17/.18)', () => {
      const voiceInput = join(WEB_SRC, 'features', 'chat', 'voice', 'VoiceInput.tsx')
      expect(fileContains(voiceInput, 'role="status"')).toBe(true)
      expect(fileContains(voiceInput, 'role="group"')).toBe(true)
      const voiceConversation = join(WEB_SRC, 'features', 'chat', 'voice', 'VoiceConversation.tsx')
      expect(fileContains(voiceConversation, 'role="status"')).toBe(true)
      expect(fileContains(voiceConversation, 'aria-live="polite"')).toBe(true)
      // Le protocole humain couvre explicitement #2434.83 — voir
      // `docs/accessibilite-recette-humaine.md` § 2 (VoiceOver), points 5 et 6.
      // Ce cas reste `retenu` tant qu'aucune session n'y est consignée.
      const protocol = join(WEB_SRC, '..', '..', '..', 'docs', 'accessibilite-recette-humaine.md')
      expect(fileContains(protocol, '#2434.83')).toBe(true)
      expect(fileContains(protocol, '#2434.8/.9/.10/.12/.24/.30')).toBe(true)
    })
  })
})
