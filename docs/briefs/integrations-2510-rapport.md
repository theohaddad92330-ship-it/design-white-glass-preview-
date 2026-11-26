# Lot INTEGRATIONS 25/10 — rapport

Branche `claude/integrations-2510` (base origin/main f3b199c1), pas de PR.

- **#4380 Zoho** — le code envoyait déjà la bonne URL (hôte de la région, `redirect_uri` exact encodé) : figé par test. Cause = config Zoho (client sans Multi-DC / région US). Corrigé : le callback lit `?error=` de Zoho et rebondit avec une raison LISIBLE (centre de données + URI attendus, jamais la clé). `zoho-config.ts`, `zoho.controller.ts`, env-reference. À faire par Louis : cocher Multi-DC sur le client.
- **#4427 Lemlist** — DÉJÀ LIVRÉ sur main (clé par espace, campagnes, poussée par la porte, statuts, carte, no-op sans clé). Rien recodé. Démo : « vide à dessein » (connexion refusée en démo) conservé, arbitrage antérieur. NON fait : lecture des DESTINATAIRES d'une campagne — contrat d'API non vérifié, pas deviné. Question : quel endpoint Lemlist (export de campagne ?) pour lister les leads ?
- **#4406 Beeper** — DÉJÀ LIVRÉ (carte, OAuth PKCE, lecture en direct sans stockage, envoi par la porte, c96 étendu, démo seedée, état injoignable). Rien recodé. Arbitrage nommé : famille « Canaux d'équipe » gardée (reco de la recette). L'état « injoignable » reste à recetter avec un vrai Desktop.
- **#4426 Import** — zone « Dépose tes documents » déjà sur onboarding + /settings/import, grille go/no-go incluse. Trou comblé : un type non reconnu (.zip, sans extension) était annoncé « rangé dans les connaissances » puis tentait l'import ; il est maintenant NOMMÉ avec les formats acceptés et jamais importé (`ContextPackDropzone.tsx`, test rouge → vert).
  Tests lancés : jest zoho (55 ✓), lemlist+beeper (44 ✓), vitest ContextPackDropzone (8 ✓). tsc web --noEmit ✓.
