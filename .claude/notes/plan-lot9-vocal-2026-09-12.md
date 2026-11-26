# Plan — lot 9 : mode vocal V1, audio conservé 30 jours (#1939, #1912.9)

Source : éclaireur lecture seule du 12/09. Décision de Louis : audio CONSERVÉ 30 jours (contre la reco « jamais »).
⚠️ Constats d'éclaireur = affirmations : chaque écrivain les RE-VÉRIFIE.

## Réutilisable (preuves de l'éclaireur)
- Client de transcription générique : `meeting-notes/transcription.client.ts:35-43` (`readTranscriptionConfig`), `:50-84` (`transcribeAudio`, whisper-1, 24 Mo max) ; appelant `meeting-notes.service.ts:238-275` (refus en démo `:256-260`, message sans clé `:262-266`) ; front `features/meeting-notes/api.ts` `useTranscriptionStatus`. → à DÉPLACER vers un module `transcription` neutre.
- ⚠️ `TRANSCRIPTION_API_KEY` figure encore dans `agent_docs/cles-a-poser.md:64-66` : vérifier qu'elle est active en prod avant d'annoncer le bouton.
- Stockage privé : `storage/storage.client.ts` (put / signedUrl / remove), `storage.service.ts` (cloisonnement, quota, `retention_until`, `purgeExpired` `:250-263`), cron `storage-retention.scheduler.ts` 03:41, interrupteur `storage.retention_purge` (`kill-switches.ts:341-352`).
- Table `storage_objects` : CHECK `domain IN ('expense_receipt','need_document')` (`1790990000001-StorageObjects.ts:77`).
- Rétention calculée en ANNÉES entières (`storage.ts:152-155`, `expense-report.ts:423-438`) → 30 jours demande une table en JOURS, additive.
- `STORED_FILE_TYPES`/`STORED_FILE_ACCEPT` partagés avec notes de frais et besoins → types audio SÉPARÉS.
- Écriture des messages : `chat-messages.service.ts:112-138` (`create`), `ia-proxy.controller.ts:641-654`, front `agentChatApi.ts:51-63`. Le tour reste `laura-turn.ts` (GA-237) : le texte transcrit part comme un message ordinaire.
- Aucune capture audio dans le dépôt (`MediaRecorder`/`getUserMedia` : 0).

## ⚠️ Défaut EXISTANT trouvé en passant
`privacy/privacy-deletion.service.ts:105-155` (`deleteAccount`) anonymise profil / contacts / consultants / RAG / activités mais **ne touche ni `chat_messages` ni `storage_objects`**. → question à Louis (effacement de compte).

## Découpage
| Lot | Contenu | Recette |
| --- | ------- | ------- |
| 9.1 serveur | migration additive (CHECK élargi en FIN de liste `chat_voice_message` ; `chat_messages.voice_object_id uuid NULL`), rétention en jours, module transcription déplacé, endpoint transcrire + stocker (refus démo, sans clé = absent, plafond de durée), `create()` accepte `voiceObjectId`, effacement de compte | test de purge atteignable sans nouveau cron (modèle `retention-purge-reachability.spec.ts`) |
| 9.2 écran | bouton micro (seulement si capacité dispo), `useVoiceMode` (`isTypeSupported` : webm/opus Chrome, mp4 Safari), écoute / annuler / chrono, transcription dans la zone de saisie, envoi volontaire, lecture vocale facultative (`SpeechSynthesis`), FR+EN, 44 px | compte réel : micro → texte modifiable → envoi → réponse ; refus micro et iOS : **téléphone réel seulement** |
| 9.3 démo + réécoute | `demo-coverage.ts` : vide à dessein (aucun service payant en démo) ; réécoute par URL signée sur `voice_object_id` avec la garde d'accès du message | — |

## Pièces RGPD dues par Louis (ne se codent pas)
1. Base légale du traitement de la voix. 2. Entrée au registre des traitements (catégorie voix, finalité, 30 j, sous-traitant de transcription). 3. Paragraphe de politique de confidentialité (conservation 30 j, purge, effacement).

## Défauts retenus sans Louis
- Durée max d'un message vocal : 90 s, « Annuler » toujours disponible.
- Chaque message vocal compte dans `CHAT_DAILY_MESSAGE_LIMIT` comme un message tapé (pas de second compteur).
