"""Prompt de PARSING d'un CV (PDF 3 §4).

Ce prompt lit un CV et rend treize blocs, chacun avec la phrase du CV qui le
porte. Il ne juge personne : il recopie et structure.

`education` (#2183.26) est le treizième, ajouté après le lot d'origine :
aucun bloc « formations »/diplômes ne figurait parmi les douze premiers —
absent du prompt ET du contrat, pas seulement non affiché à l'écran.

Deux familles d'interdits, et elles n'ont pas la même raison d'être :

1. **Les interdits d'INVENTION** (§4.1). Déduire un niveau de maîtrise d'un
   mot-clé, une séniorité d'un intitulé, un TJM d'une moyenne de marché : ce
   sont trois façons d'écrire une chose que le CV ne dit pas, et elles se
   propagent ensuite dans un dossier envoyé à un client.
2. **Les interdits LÉGAUX**. Genre, âge, origine, nationalité, situation
   familiale, photo : ces informations ne doivent être ni extraites ni
   stockées. L'interdit ne s'adosse à AUCUNE échéance réglementaire, et c'est
   délibéré : le droit des données personnelles s'applique déjà à un CV, et la
   garde d'architecture du dépôt (`protected-criteria.spec.ts`) est de toute
   façon plus stricte — elle refuse ces champs dans tout ce qui classe des
   personnes, sans condition de date. Une règle datée finit par se relire comme
   une règle expirée ; celle-ci ne peut pas l'être.

La contrainte qui rend le reste vérifiable : **chaque champ cite le CV**. Un
champ sans citation est rejeté côté serveur et non affiché — c'est ce qui
distingue une lecture d'une invention.
"""

from __future__ import annotations

DETECTIONS = [
    # #3935.2 — le profil public (LinkedIn, Malt…) rejoint le bloc le 08/10/2026 :
    # mesuré sur le vivier de production, l'information est souvent écrite à côté
    # du nom/e-mail/téléphone (même ligne de coordonnées) mais le prompt ne la
    # demandait jamais — le modèle ne la cite donc quasiment jamais, pas parce
    # qu'elle est absente du CV. Le bloc reste un agrégat, et l'URL se lit avec
    # la même garantie de FORME que l'e-mail/le téléphone (`readProfileUrlFromIdentity`,
    # `@bellum/contracts`) : jamais composée depuis un nom, jamais devinée.
    ("identity", "nom complet, e-mail, téléphone, ville, profil professionnel (LinkedIn, Malt…) — TELS QU'ÉCRITS"),
    ("job_title", "l'intitulé de poste courant, jamais inventé s'il est absent"),
    ("skills", "compétences techniques et fonctionnelles, une liste de termes"),
    ("seniority", "nombre d'années d'expérience : celui que le CV écrit (« 8 ans d'expérience »), sinon CALCULÉ sur les dates écrites"),
    # #5017.1 — secteurs CITÉS, jamais DÉDUITS : un secteur n'est rendu que si le CV
    # nomme une expérience chez un client de ce secteur. Un secteur « probable » à
    # partir d'un intitulé ou d'une techno serait une opinion affichée comme un fait.
    (
        "sectors",
        "secteurs d'activité CITÉS : uniquement ceux d'un client que le CV nomme "
        "(une expérience chez ce client) — un secteur jamais deviné d'après un "
        "intitulé, une technologie ou un nom de client non explicite",
    ),
    ("environments", "environnements techniques : cloud, base de données, CI/CD, méthode"),
    ("tools", "outils : Jira, Git, Power BI, SAP…"),
    (
        "languages",
        "langues, avec leur niveau UNIQUEMENT s'il est écrit — rends chaque langue sous la "
        "forme « Nom (niveau) » si un niveau CECRL (A1 à C2) ou « natif »/« langue maternelle » "
        "est explicitement écrit, sinon juste « Nom » ; ne traduis jamais un qualificatif flou "
        "(« courant », « bon niveau ») en niveau CECRL, ce serait une évaluation que personne "
        "n'a faite",
    ),
    ("certifications", "certifications : intitulé et organisme"),
    ("mobility", "zone géographique, télétravail, déplacements"),
    ("availability", "date ou mention de disponibilité"),
    # #3935.2b (lot M07, 09/10) — format FERMÉ : chaque ligne est découpée par
    # `readExperiencesFromDetection` (@bellum/contracts) puis écrite dans
    # `consultant_experiences`, arbitrée champ par champ. Une ligne hors format
    # est ignorée côté API, jamais devinée.
    # #3935 (lot P03, décision Louis 09/10) — une date écrite à l'ANNÉE seule
    # (« 2019 – 2021 ») est GARDÉE à l'année : l'API stocke l'année et une
    # précision `year`, l'écran affiche « 2019 », jamais un mois inventé.
    (
        "experiences",
        "expériences : une liste, UNE LIGNE PAR EXPÉRIENCE, au format exact "
        "« rôle | entreprise ou client | début | fin | réalisations » ; début et fin au format AAAA ou "
        "AAAA-MM : AAAA-MM quand le mois est écrit, AAAA quand seule l'année l'est (« 2019 – 2021 » "
        "donne 2019 et 2021, jamais un mois ajouté), « en cours » si c'est écrit ; "
        "un élément que le CV n'écrit pas reste VIDE entre ses barres, jamais deviné ni complété",
    ),
    ("education", "formations, diplômes : intitulé, établissement, année — jamais inventés s'ils sont absents"),
    # #3935 (décision Louis 15/10/2026) — le TJM est LU quand le CV l'écrit, recopié tel quel
    # avec sa phrase ; il n'est jamais estimé (voir « CE QUE TU NE FAIS JAMAIS »).
    ("daily_rate", "TJM (tarif journalier) UNIQUEMENT s'il est écrit dans le CV, recopié tel qu'écrit (ex. « 550 €/jour »)"),
]


def build_system_prompt() -> str:
    blocs = "\n".join(f"- `{key}` : {description}" for key, description in DETECTIONS)
    return f"""Tu lis un CV et tu en extrais quatorze blocs d'information.

Tu ne juges pas la personne, tu ne la classes pas, tu ne la compares à rien.
Tu recopies ce qui est écrit, et tu dis d'où tu le tiens.

LES QUATORZE BLOCS
{blocs}

LA RÈGLE QUI COMMANDE TOUT
Chaque bloc que tu remplis DOIT citer la phrase exacte du CV qui le porte, dans
`source_excerpt`. Une citation approximative, reformulée ou reconstituée est un
échec : elle sera rejetée. Si tu ne peux pas citer, mets `value` à `null`.

LE BLOC `skills` EN DÉTAIL (#3811.6)
Une compétence est une TECHNOLOGIE, un LANGAGE, un CADRE, une MÉTHODE ou un
SAVOIR-FAIRE NOMMÉ — un terme qu'on pourrait chercher tel quel dans une offre
de mission. Deux choses ne sont JAMAIS une compétence, même quand elles
apparaissent dans la même zone du CV que la liste de compétences :
- un INTITULÉ DE RUBRIQUE ou de colonne d'un tableau de compétences
  (« Développement », « Qualité », « Base de données », « Devops », « Langues »,
  « Outils », « Frameworks », « Compétences »…) — c'est un TITRE, pas un terme ;
- une PHRASE DE MISSION, qui décrit ce que la personne a FAIT plutôt qu'un
  terme qu'elle maîtrise (« Création d'une gateway de paiement »,
  « Développement des features du back-office », « Correction des anomalies
  de production ») — cette phrase appartient au bloc `experiences`, jamais à
  `skills`.

Exemples :
- positifs : « Spring », « VueJS », « NestJS », « PostgreSQL », « Docker »,
  « Kubernetes », « gestion de projet », « Code review ».
- négatifs (à exclure de `skills`) : « Développement » (rubrique), « Qualité »
  (rubrique), « Base de données » (rubrique), « Création d'une gateway »
  (mission), « Développement des features » (mission), « Correction des
  anomalies » (mission).

Un tableau de compétences exporté d'un autre outil mélange souvent les trois
dans le même bloc de texte (rubrique, terme, parfois une mission qui traîne
juste à côté) : à toi de ne garder que les TERMES, dans l'ordre où ils
apparaissent.

CE QUE TU NE FAIS JAMAIS
- Déduire un NIVEAU DE MAÎTRISE d'un mot-clé. « Spark » dans un CV ne fait pas
  un expert Spark. Tu listes le terme, tu ne le notes pas.
- Déduire une SÉNIORITÉ d'un intitulé. « Lead » ne vaut pas huit ans. La
  séniorité se calcule sur les dates écrites ; sans dates, c'est `null`.
- Estimer un TJM, un salaire, ou n'importe quel prix. Un TJM n'est rendu que
  s'il est ÉCRIT dans le CV (bloc `daily_rate`, recopié avec sa phrase) ; sinon
  `null`. Jamais d'ordre d'idée, jamais de fourchette déduite d'un poste ou
  d'une séniorité. Un salaire n'est jamais lu.
- Extraire ou deviner un GENRE, un ÂGE, une DATE DE NAISSANCE, une ORIGINE, une
  NATIONALITÉ, une SITUATION FAMILIALE, une PHOTO. Ces informations ne
  t'intéressent pas et ne doivent apparaître nulle part dans ta réponse, même
  si le CV les contient.
- Compléter une date manquante par une approximation. Une date absente reste
  absente.
- Inventer une compétence, un client, un diplôme ou une certification que le CV
  ne nomme pas.
- Déduire un ÉTABLISSEMENT ou une ANNÉE d'obtention que le CV ne donne pas. Une
  formation sans année reste une formation SANS année, jamais complétée.

LA CONFIANCE
Chaque bloc porte une `confidence` entre 0 et 1. Elle dit à quel point la
LECTURE est sûre, pas à quel point la personne est bonne :
- 0.9 et plus : c'est écrit noir sur blanc, sans ambiguïté ;
- 0.6 à 0.9 : c'est écrit mais l'interprétation demande un choix ;
- moins de 0.6 : tu as dû interpréter, et un humain doit relire.

FORMAT DE SORTIE
Un objet JSON, rien d'autre, aucun texte autour :
{{
  "fields": [
    {{
      "detection": "<un des douze noms ci-dessus>",
      "value": <chaîne, liste de chaînes, nombre, ou null>,
      "confidence": <0 à 1>,
      "source_excerpt": "<la phrase exacte du CV, ou une chaîne vide si value est null>"
    }}
  ]
}}

Les treize blocs figurent TOUS dans `fields`, y compris ceux dont la valeur est
`null` : « ce CV ne dit pas où la personne habite » est une information, et la
taire ferait croire à un oubli."""


def build_user_prompt(cv_text: str) -> str:
    # La langue est détectée en CODE, pas demandée au modèle : un modèle rend
    # parfois « anglais » sur un CV français truffé d'anglicismes techniques, et
    # l'erreur déplacerait tout le parsing sans que rien ne le signale.
    #
    # Sur un CV français — ou de langue indéterminée — la consigne est VIDE et
    # le prompt reste byte-identique à ce qu'il était.
    from app.services.cv_language import translation_directive

    directive = translation_directive(cv_text)
    return f"""Voici le CV à lire, tel qu'il a été déposé.
{directive}
--- DÉBUT DU CV ---
{cv_text}
--- FIN DU CV ---

Rends les treize blocs. Chaque bloc rempli cite le CV."""
