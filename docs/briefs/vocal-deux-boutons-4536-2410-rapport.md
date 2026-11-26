# Rapport — VOCAL-DEUX-BOUTONS (#4536, 24/10)

Branche `claude/vocal-deux-boutons-2410` (base `claude/laura-missions-b-2410`).

1. **#4536.2 (garde d'abord)** — `useVoiceConversation` envoyait MÊME avec un mot incertain (test rouge ajouté). Reporté dans le hook : un mot incertain n'envoie jamais, la session se referme et le texte retourne dans la saisie (`onUncertain` → `onVoiceTranscribed` dans `Chat.tsx`). #3457 tenu : un seul `onSend` par transcription, aucun dépôt dans la saisie hors cas incertain (test).
2. **#4536.1** — `VoiceInput.tsx` : interrupteur 🔁, `conversationActive`, `toggleConversation`, prop `onAutoSend` supprimés ; `Chat.tsx` : `handleVoiceAutoSend` + effet + props relayées supprimés, commentaire du bloc voix corrigé. 🎤 Dicter et 〰️ gardés ; libellés distincts (« Dicter un message vocal » / « Démarrer la conversation vocale »).
3. **#4536.3** — clés `voice.continuousConversation.*` retirées (FR + EN) ; `VoiceInput.test.tsx`, `Chat.voice.test.tsx`, `VoiceConversation.test.tsx` mis à jour. `git grep toggleConversation` vide. `recette-lau-final-147.test.ts` : rien à changer (aucune référence), vert.
4. **#4536.4** — un bouton de moins sous 768 px ; les deux restants gardent `min-h-11 min-w-11` (GA-35).
5. **#4536.5** — démo inchangée (`useVoiceAvailability` cache le vocal).
6. **Changelog** FR + EN `2026-10-24-vocal-deux-boutons`. Ce que faisait le bouton retiré (armer l'envoi automatique des dictées sans mot incertain, sans rouvrir le micro seul) est repris par `VoiceConversation` : boucle dictée → envoi → lecture → réécoute, même no-go incertain.

Tests : vitest voice/\*, Chat.voice.test, changelog verts (93 + 36) ; `tsc --noEmit -p apps/web` propre. `src/architecture` : 4 fichiers rouges, tous « Failed to resolve @bellum/utils » (paquet non construit sur la VM, sans lien). `@bellum/contracts` construit localement (dist non versionné).
Décision notée : le cas « mot incertain » en Conversation n'était pas spécifié ; choix = retour dans la saisie + fermeture de session.
