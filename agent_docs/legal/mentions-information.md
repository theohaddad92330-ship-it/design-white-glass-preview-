# Mentions d'information — enregistrement d'appel, destinataires de prospection

> **Rédigé le 11/10/2026, non relu par un juriste — décision de Louis** (épopée #4016, lots L5, L12 et L14).
>
> **Reste à compléter** : par l'ESN cliente, les champs ⟦entre crochets⟧ (c'est elle qui appelle et qui prospecte,
> donc elle qui informe) ; par Louis, la décision de câbler la mention § 2 comme pied de message par défaut des
> envois sous mandat, et l'adresse d'une page publique d'opposition pour les prospects (aujourd'hui : relais par
> l'ESN ou `dpo@bellum-it.com`).

Ces mentions sont des MODÈLES que BellumAI met à disposition de ses clients. Les textes destinés au produit
(gabarit de séquence, bandeau d'appel) se rédigent en reprenant ceux-ci ; ils ne doivent nommer aucun de nos
fournisseurs (c19, c66) et ne promettre aucune certification ni hébergement (GA-388).

---

## 1. Enregistrement et analyse d'un appel — consentement annoncé (L12)

**Règle non négociable** : jamais d'enregistrement sans consentement (art. 226-1 du Code pénal). L'annonce est faite
**au début** de l'appel, **avant** que l'enregistrement commence ou avant que la conversation porte sur le fond ; un
refus met fin à l'enregistrement, pas à l'appel. Le commercial note le consentement (ou l'outil de téléphonie le
consigne) ; sans consentement noté, l'appel n'est pas transmis à l'analyse.

### 1.a Annonce orale (à lire par le commercial)

> **FR** — « Avant de commencer : je souhaite enregistrer notre échange pour en garder un compte rendu fidèle. Il
> sera transcrit et résumé automatiquement, utilisé uniquement par ⟦nom de l'ESN⟧ pour le suivi de notre
> discussion, et vous pouvez demander à tout moment qu'il soit supprimé. Êtes-vous d'accord ? »
>
> **EN** — "Before we start: I'd like to record our call so I keep an accurate summary. It will be transcribed and
> summarised automatically, used only by ⟦ESN name⟧ to follow up on our discussion, and you can ask for it to be
> deleted at any time. Is that all right with you?"

### 1.b Mention écrite (invitation au rendez-vous ou message de confirmation)

> **FR** — Avec votre accord, annoncé en début d'appel, ⟦nom de l'ESN⟧ peut enregistrer cet échange afin d'en
> produire une transcription et un résumé automatiques, utilisés pour le suivi commercial de notre relation. Base
> légale : votre consentement, que vous pouvez refuser ou retirer à tout moment sans conséquence sur l'échange.
> L'enregistrement est traité par ⟦nom de l'ESN⟧ et par l'éditeur de son outil commercial, en qualité de
> sous-traitant, avec des prestataires techniques (transcription, modèle d'IA) dont certains sont établis hors de
> l'Union européenne, sous garanties appropriées. ⟦Durée de conservation de la transcription et du résumé⟧.
> Vous disposez des droits d'accès, de rectification, d'effacement et d'opposition : ⟦contact RGPD de l'ESN⟧ ;
> réclamation possible auprès de la CNIL.
>
> **EN** — With your agreement, given at the start of the call, ⟦ESN name⟧ may record this conversation to produce
> an automatic transcript and summary, used to follow up on our business relationship. Legal basis: your consent,
> which you may refuse or withdraw at any time without any effect on the call. The recording is processed by
> ⟦ESN name⟧ and by the publisher of its sales tool, acting as processor, with technical providers (transcription,
> AI model), some of them established outside the European Union, under appropriate safeguards. ⟦Retention period
> of the transcript and summary⟧. You have the rights of access, rectification, erasure and objection:
> ⟦ESN data-protection contact⟧; you may lodge a complaint with the CNIL.

### 1.c Ce que l'outil garde

- Compte rendu de rendez-vous : l'audio déposé n'est **jamais conservé** (GA-399) — seul le texte reste.
- Téléphonie : BellumAI lit la transcription produite par l'outil d'appel du client, seulement si l'espace l'a
  autorisé (`transcripts_enabled`, défaut non). La conservation de l'audio relève de l'outil d'appel du client.

---

## 2. Destinataires de prospection — information et opposition (art. 14 RGPD, L34-5 CPCE)

**Cadre CNIL de la prospection B2B par e-mail** : sans consentement préalable, à deux conditions — le message est
**en rapport avec la profession** de la personne (sa fonction dans l'entreprise), et elle peut **s'opposer
simplement et gratuitement**, à chaque message. Les données n'ayant pas été collectées auprès d'elle, l'art. 14
impose de l'informer au plus tard lors de la **première communication** (et dans le mois de la collecte au plus
tard) : d'où une mention courte dans le premier message, renvoyant à une information complète.

### 2.a Pied de premier message (court)

> **FR** — Vous recevez ce message en raison de votre fonction chez ⟦entreprise du destinataire⟧. Vos coordonnées
> professionnelles proviennent de sources publiques ou de fournisseurs de données professionnelles. Pour ne plus
> être contacté·e, répondez « STOP » ou cliquez ici : ⟦lien de désinscription⟧. En savoir plus sur vos données :
> ⟦lien vers l'information complète 2.b⟧.
>
> **EN** — You are receiving this message because of your role at ⟦recipient's company⟧. Your business contact
> details come from public sources or professional data providers. To stop receiving messages, reply "STOP" or
> click here: ⟦unsubscribe link⟧. More about your data: ⟦link to full notice 2.b⟧.

Le lien de désinscription existe dans le code (`apps/api/src/modules/mailer/unsubscribe-token.ts`) et toute
opposition est vérifiée avant chaque envoi, y compris sous mandat (`suppression.service.ts`, `delegationVerdict`) :
une réponse ou une opposition arrête la séquence.

### 2.b Information complète (page ou réponse à une demande)

> **FR — Pourquoi vous avez reçu un message de ⟦nom de l'ESN⟧**
>
> **Responsable du traitement** : ⟦raison sociale, adresse de l'ESN⟧ — ⟦contact RGPD⟧.
> **Finalité** : prospection commerciale entre professionnels, en rapport avec votre fonction.
> **Base légale** : intérêt légitime de ⟦nom de l'ESN⟧ à présenter ses services aux entreprises (art. 6-1-f RGPD).
> **Données** : nom, prénom, fonction, entreprise, coordonnées professionnelles, et éventuellement des informations
> professionnelles publiques (actualité de votre entreprise, changement de poste). Certaines coordonnées peuvent
> être **estimées** (par exemple une adresse construite selon le format de votre entreprise puis vérifiée
> techniquement) : elles sont signalées comme telles et corrigées dès que vous le demandez.
> **Sources** : registres et publications officielles, sites et publications des entreprises, informations
> professionnelles que vous avez rendues publiques, fournisseurs de données professionnelles sous contrat.
> **Destinataires** : les équipes commerciales de ⟦nom de l'ESN⟧ ; l'éditeur de son outil commercial et ses
> prestataires techniques (hébergeur, fournisseur de modèle d'IA, envoi d'e-mails), en qualité de sous-traitants,
> dont certains hors de l'Union européenne sous garanties appropriées. Vos données ne sont ni vendues ni louées.
> **Durée** : vos coordonnées professionnelles cessent d'être utilisées trois ans après le dernier échange.
> **Vos droits** : accès, rectification, effacement, limitation et **opposition à tout moment, sans motif**, à la
> prospection. Après un effacement, une empreinte technique non réversible est conservée pour empêcher que vos
> données soient collectées à nouveau. Écrivez à ⟦contact RGPD de l'ESN⟧. Réclamation possible auprès de la CNIL
> (3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07 — www.cnil.fr).
>
> **EN — Why you received a message from ⟦ESN name⟧**
>
> **Controller**: ⟦ESN legal name and address⟧ — ⟦data-protection contact⟧.
> **Purpose**: business-to-business prospecting, related to your professional role.
> **Legal basis**: ⟦ESN name⟧'s legitimate interest in presenting its services to companies (Art. 6(1)(f) GDPR).
> **Data**: first and last name, job title, company, business contact details, and possibly public professional
> information (company news, job change). Some contact details may be **estimated** (for instance an address built
> from your company's format and then technically checked): they are flagged as such and corrected as soon as you
> ask.
> **Sources**: official registers and publications, company websites and publications, professional information
> you have made public, professional data providers under contract.
> **Recipients**: ⟦ESN name⟧'s sales teams; the publisher of its sales tool and its technical providers (hosting,
> AI model, e-mail delivery), acting as processors, some outside the European Union under appropriate safeguards.
> Your data is neither sold nor rented.
> **Retention**: your business contact details stop being used three years after the last exchange.
> **Your rights**: access, rectification, erasure, restriction and **objection at any time, without giving a
> reason**, to prospecting. After an erasure, a non-reversible technical fingerprint is kept so that your data is
> not collected again. Write to ⟦ESN data-protection contact⟧. You may lodge a complaint with the CNIL
> (www.cnil.fr) or with your local supervisory authority.

### 2.c Correspondants d'une boîte connectée (L3)

Quand un commercial connecte SA boîte, le copilote lit le corps des fils liés à ses contacts. Les correspondants
sont couverts par l'information 2.b complétée d'une phrase, à ajouter à la rubrique « Données » :

> **FR** — Les échanges que vous avez avec nos commerciaux peuvent être résumés automatiquement pour leur seul
> usage ; ils ne sont pas partagés avec d'autres personnes de ⟦nom de l'ESN⟧ que votre interlocuteur.
>
> **EN** — Your exchanges with our sales people may be summarised automatically for their sole use; they are not
> shared with anyone at ⟦ESN name⟧ other than your contact person.
