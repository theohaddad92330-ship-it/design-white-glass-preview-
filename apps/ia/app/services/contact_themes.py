"""Thèmes de relance ciblée → scope Apollo (retour Thales 2026-07-07).

L'utilisateur relance une recherche contacts sur UN thème (cyber, achats, data /
MLOps, DSI France, cloud, BTP, énergie…) sans rejouer tout le compte.
``resolve_theme_scope`` mappe un thème (libre) vers un scope réutilisable par le
ré-run existant (``ContactScope`` + endpoint ``enrich-contacts``) : titres
Apollo, séniorités, géographies. Déterministe, pas de LLM. Un thème inconnu
(hors des 10 presets ci-dessous) retombe sur le thème brut PLUS sa variante
grammaticale masculin/féminin (#2532.2) comme mots-clés de titre — jamais un
échec, et jamais un seul mot-clé littéral sans expansion.

#2532.2 — REVIREMENT ASSUMÉ (décision de Louis, QCM du 21/09/2026, sur le
registre ``.claude/notes/registre-2026-09-18-BE-memoire-404-et-recherche.md``,
ligne 2532.2) : la décision du 18/09/2026 (voir plus bas, § « un preset par
métier serait une liste magique sans fin ») refusait explicitement un preset
par métier hors IT et ne posait QUE la règle grammaticale générique. Le retour
BOUYGUES CONSTRUCTION du 19/09/2026 (#2532.2 bis) a montré la limite de ce
choix : la règle générique élargit un mot-clé, mais ne sait pas qu'un
« Conducteur de Travaux » ou un « Directeur BTP » existent — elle ne peut
élargir QUE grammaticalement, jamais sémantiquement. Louis a tranché à
nouveau le 21/09 : « il faut que ça marche hors IT » se lit maintenant comme
« les familles qui comptent vraiment pour une ESN doivent avoir un preset »,
pas seulement « un mot doit trouver sa variante de genre ». Cinq familles hors
IT rejoignent donc les cinq presets IT ci-dessous — ingénierie/industrie, BTP
& construction, santé, énergie, finance/assurance métier — choisies sur ce
que les ESN vendent RÉELLEMENT hors informatique (raison + mots-clés détaillés
dans le registre cité ci-dessus). La règle grammaticale générique RESTE : elle
protège tout métier qui n'entre encore dans AUCUN des 10 presets (juridique,
éducation, agriculture…) — elle n'est plus la SEULE réponse, elle est le
FILET pour l'impensé.

#2290 (LAU-FINAL-031) — un commercial qui obtient une liste de contacts ne sait
pas PAR QUEL CHEMIN chacun a été trouvé (terme direct ? synonyme ? acronyme ?
famille entière ? association sectorielle ?), ni si une liste courte vient d'un
marché pauvre ou d'une recherche pauvre. Ce module ajoute donc :

* des dictionnaires par famille enrichis (synonymes, acronymes, associations
  sectorielles, faux amis à exclure) — 2290.1 ;
* une notion UNIQUE de provenance de correspondance (``ThemeMatch``), portée par
  chaque scope résolu, plutôt que cinq champs cousus à la main (GA-26) — 2290.4
  à 2290.8 ;
* un numéro de version de dictionnaire, porté par chaque provenance — 2290.9 ;
* une mesure de couverture des familles après une recherche GÉNÉRALE
  (``theme_coverage``) et la liste des familles à relancer spécifiquement
  (``theme_relaunch_candidates``) — 2290.2 et 2290.3.

``theme_coverage`` mesure ce qu'on A SU TROUVER dans les résultats déjà obtenus —
JAMAIS ce que le marché contient (garde GA-259). Une famille sans correspondance
est « non couverte PAR CETTE RECHERCHE », pas « absente chez ce client ». Une
recherche VIDE ne mesure RIEN : chaque famille reste ``non_mesure`` plutôt que
``non_couverte`` — un échec de recherche ne doit jamais se lire comme « 0 famille
couverte » (GA-18/GA-19).

Aucun champ de ce module ne pèse dans un CLASSEMENT de personnes : la provenance
est un fait descriptif attaché APRÈS coup à un résultat déjà trouvé par
``search_people`` (titres Apollo), jamais un critère d'entrée ou de tri.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, Literal

from app.services.text_norm import normalize_name

# Version du dictionnaire sectoriel (2290.9) — portée par chaque provenance de
# correspondance rendue au résultat, pour dater ce avec quoi il a été trouvé.
# Incrémenter à chaque changement de contenu (nouveau terme, nouvelle exclusion).
THEME_DICTIONARY_VERSION = "2026-10-30.1"

MatchVia = Literal["direct", "acronym", "synonym", "sector_association", "raw_fallback"]

# Each preset: canonical name → synonymes / acronymes / associations sectorielles
# / faux amis à exclure, + titres et séniorités Apollo.
#
# - ``synonyms`` : mots ou expressions équivalents au sens large (déterministe,
#   normalisés accent/case-insensible, un mot = un token).
# - ``acronyms`` : sous-ensemble ÉTIQUETÉ séparément des synonymes — un acronyme
#   reconnu (RSSI, DSI, SOC…) est un fait, pas une supposition ; le distinguer
#   permet à la provenance de dire "via l'acronyme X" plutôt qu'un "synonyme"
#   plus vague.
# - ``sector_associations`` : nom d'un corps professionnel du secteur (réel,
#   public) → son libellé complet. Rendu comme PROVENANCE (2290.7), jamais comme
#   confiance : ce n'est pas parce qu'un commercial tape "CIGREF" que la
#   recherche est plus fiable, seulement que le CHEMIN est différent.
# - ``exclusions`` : expressions (phrases, pas des mots isolés) qui NE DOIVENT
#   PAS faire matcher cette famille même si un de ses mots y apparaît — les faux
#   amis identifiés. Une famille sans exclusion connue reste avec un ensemble
#   vide : on ne devine pas un faux ami qu'on n'a pas identifié.
_PRESETS: list[dict[str, Any]] = [
    {
        "name": "cyber",
        "synonyms": {"cybersecurite", "cybersecurity", "securite"},
        "acronyms": {"soc", "ssi", "rssi", "ciso"},
        "sector_associations": {
            "cesin": "CESIN — Club des Experts de la Sécurité de l'Information et du Numérique",
            "clusif": "CLUSIF — Club de la Sécurité de l'Information Français",
        },
        # Faux amis : "sécurité" seule dérive souvent vers la sécurité physique /
        # sociale / routière (HSE), jamais la cybersécurité.
        "exclusions": {"securite sociale", "securite routiere", "agent de securite", "securite incendie"},
        "titles": [
            "RSSI",
            "CISO",
            "Responsable Cybersécurité",
            "Directeur Sécurité des SI",
            "Head of Security",
            "SOC Manager",
        ],
        "seniorities": ["director", "manager"],
    },
    {
        "name": "data",
        "synonyms": {"machine", "learning", "analytics", "datascience", "cortaix"},
        "acronyms": {"mlops", "ia", "ai"},
        "sector_associations": {"hub france ia": "Hub France IA"},
        # Aucun faux ami identifié pour "data" — l'ensemble reste vide plutôt
        # que d'en inventer un.
        "exclusions": set(),
        "titles": [
            "Chief Data Officer",
            "Head of Data",
            "Responsable Data",
            "Directeur Data & IA",
            "MLOps Engineer",
            "Head of AI",
        ],
        "seniorities": ["director", "manager"],
    },
    {
        "name": "achats",
        "synonyms": {"achat", "procurement", "sourcing", "acheteur"},
        "acronyms": set(),
        "sector_associations": {"cdaf": "CDAF — Compagnie des Dirigeants et Acheteurs de France"},
        # Faux ami : l'achat immobilier n'est pas l'achat IT/indirect qu'une ESN cible.
        "exclusions": {"achat immobilier", "acheteur immobilier"},
        "titles": [
            "Directeur des Achats",
            "Acheteur IT",
            "IT Procurement Manager",
            "Category Manager IT",
            "Responsable Achats",
        ],
        "seniorities": ["director", "manager"],
    },
    {
        "name": "dsi",
        "synonyms": {"infra", "infrastructure"},
        "acronyms": {"it", "tdsi", "si", "cio"},
        "sector_associations": {"cigref": "CIGREF — Club Informatique des Grandes Entreprises Françaises"},
        # Faux ami : "si" est l'acronyme de Système d'Information ET le mot
        # français le plus courant pour une condition ("si besoin") — l'expression
        # entière protège l'acronyme isolé.
        "exclusions": {"si besoin"},
        "titles": [
            "DSI",
            "Directeur des Systèmes d'Information",
            "CIO",
            "Directeur Infrastructure",
            "Head of IT",
        ],
        "seniorities": ["c_suite", "director"],
    },
    {
        "name": "cloud",
        "synonyms": {"devops", "platform", "kubernetes"},
        "acronyms": set(),
        "sector_associations": {"eurocloud": "EuroCloud France"},
        "exclusions": set(),
        "titles": [
            "Directeur Cloud",
            "Cloud Architect",
            "Responsable Infrastructure Cloud",
            "Head of Cloud",
            "DevOps Manager",
        ],
        "seniorities": ["director", "manager"],
    },
    # ── #2532.2 (21/09/2026) — 5 familles HORS IT, choisies sur ce que les ESN
    # vendent RÉELLEMENT hors informatique (raison détaillée par famille dans
    # le registre .claude/notes/registre-2026-09-18-BE-memoire-404-et-recherche.md,
    # ligne 2532.2). Même forme EXACTE que les 5 presets IT ci-dessus — aucun
    # mécanisme nouveau, aucun modèle parallèle.
    {
        "name": "ingenierie",
        # Ingénierie & industrie : le métier de base d'une ESN "boutique
        # expert" hors IT (bureau d'études, méthodes, qualité industrielle —
        # cf. golden persona 18, "Mécanique & Conception").
        "synonyms": {"ingenierie", "industrie", "industriel", "manufacturing", "methodes"},
        "acronyms": set(),
        "sector_associations": {"iesf": "IESF — Ingénieurs et Scientifiques de France"},
        # Faux ami RÉEL : "ingénierie financière" désigne un métier finance,
        # jamais un bureau d'études industriel — voir la famille "finance".
        "exclusions": {"ingenierie financiere"},
        "titles": [
            "Directeur Industriel",
            "Directeur R&D",
            "Directeur des Méthodes",
            "Ingénieur Qualité",
            "Directeur de Production",
            "Responsable Bureau d'Études",
        ],
        "seniorities": ["director", "manager"],
    },
    {
        "name": "btp",
        # BTP & construction : famille née du retour BOUYGUES CONSTRUCTION
        # (#2532.2 bis, 19/09/2026, "Coordinateur de chantier") — le cas qui a
        # motivé le revirement du 21/09 (voir docstring de tête de module).
        "synonyms": {"construction", "chantier", "batiment", "travaux"},
        "acronyms": set(),
        "sector_associations": {
            "ffb": "FFB — Fédération Française du Bâtiment",
            "fntp": "FNTP — Fédération Nationale des Travaux Publics",
        },
        # Faux ami RÉEL : "travaux pratiques" (contexte scolaire) n'a aucun
        # rapport avec les travaux publics.
        "exclusions": {"travaux pratiques"},
        "titles": [
            "Directeur de Travaux",
            "Conducteur de Travaux",
            "Chef de Chantier",
            "Directeur BTP",
            "Responsable SPS",
            "Directeur Technique BTP",
        ],
        "seniorities": ["director", "manager"],
    },
    {
        "name": "sante",
        "synonyms": {"medical", "hospitalier", "clinique", "soins", "sanitaire"},
        "acronyms": {"ehpad", "ars"},
        "sector_associations": {"fhf": "FHF — Fédération Hospitalière de France"},
        # Faux ami RÉEL : "assurance santé" est un produit finance/assurance,
        # jamais un rôle de PRESTATAIRE de soin.
        "exclusions": {"assurance sante"},
        "titles": [
            "Directeur Médical",
            "Directeur des Soins",
            "Directeur d'Établissement de Santé",
            "Responsable Achats Hospitaliers",
            "Directeur Technique Hospitalier",
        ],
        "seniorities": ["director", "manager"],
    },
    {
        "name": "energie",
        "synonyms": {"electricite", "renouvelable", "nucleaire", "petrole", "gaz"},
        "acronyms": {"enr"},
        "sector_associations": {
            "ufe": "UFE — Union Française de l'Électricité",
            "sfen": "SFEN — Société Française d'Énergie Nucléaire",
        },
        # Aucun faux ami identifié pour "énergie" — l'ensemble reste vide
        # plutôt que d'en inventer un (même règle que "data"/"cloud").
        "exclusions": set(),
        "titles": [
            "Directeur Énergie",
            "Ingénieur Process",
            "Responsable Exploitation",
            "Directeur Technique Énergie",
            "Chef de Projet EnR",
        ],
        "seniorities": ["director", "manager"],
    },
    {
        "name": "finance",
        # Finance & assurance MÉTIER (CFO, actuariat, souscription) — jamais
        # confondu avec la DSI d'une banque, déjà couverte par le preset "dsi".
        "synonyms": {"banque", "assurance", "actuariat", "souscription"},
        "acronyms": {"cfo"},
        "sector_associations": {
            "acpr": "ACPR — Autorité de Contrôle Prudentiel et de Résolution",
            "ffa": "FFA — France Assureurs",
        },
        # Faux ami RÉEL : "assurance qualité" (démarche qualité) n'a aucun
        # rapport avec l'assurance en tant que produit financier.
        "exclusions": {"assurance qualite"},
        "titles": [
            "Directeur Financier",
            "Directeur des Risques",
            "Actuaire",
            "Souscripteur",
            "Directeur de l'Assurance",
            "Responsable Conformité Assurance",
        ],
        "seniorities": ["c_suite", "director"],
    },
]

# ── #4923.3 / .4 / .5 (Louis 30/10/2026) — taxonomie « au paroxysme ».
# Retour Julien Laszlo (L'Oréal, Decathlon, AXA) : ni Head of AI, ni Head of
# Data / CDO, ni Directeur Achats, ni patron de pôle DSI groupe. Cause : 10
# familles × ~6 titres. Chaque famille déclare désormais ses RÔLES DE TÊTE
# (``head_titles`` — ce qui la fait « couverte_tete », #4923.6) et au moins 25
# titres FR ET EN (variantes de genre, préfixes de niveau Group / Groupe /
# Global / Head of / Directeur / Responsable / Lead). Les titres sont GÉNÉRÉS
# depuis des racines FR/EN (une seule règle, GA-26) plutôt que recopiés à la
# main : ajouter une racine ajoute toutes ses variantes.
_FR_LEVELS = ("Directeur", "Directrice", "Responsable", "Directeur Groupe", "Directrice Groupe")
_EN_LEVELS = ("Head of", "Group Head of", "VP", "Director of", "Global Head of", "Senior Director", "Lead")


def _expand_titles(fr_roots: tuple[str, ...], en_roots: tuple[str, ...]) -> list[str]:
    out = [f"{level} {root}" for root in fr_roots for level in _FR_LEVELS]
    out += [f"{level} {root}" for root in en_roots for level in _EN_LEVELS]
    return out


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        key = item.casefold()
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


# nom de famille → (rôles de tête, racines FR, racines EN). Les rôles de tête
# viennent en PREMIER dans ``titles`` : un plafond de titres côté fournisseur
# coupe la queue, jamais la tête.
_TAXONOMY: dict[str, tuple[list[str], tuple[str, ...], tuple[str, ...]]] = {
    "cyber": (
        ["RSSI", "CISO", "Chief Information Security Officer", "RSSI Groupe", "Group CISO", "Head of Cybersecurity"],
        ("de la Cybersécurité", "de la Sécurité des SI"),
        ("Cybersecurity", "Information Security"),
    ),
    # « CDO » seul est volontairement ABSENT : acronyme ambigu (Chief Data /
    # Chief Digital Officer) — le titre complet porte la preuve, pas l'acronyme.
    "data": (
        [
            "Chief Data Officer",
            "Head of Data",
            "Head of AI",
            "Chief AI Officer",
            "Directeur Data & IA",
            "Directeur Data",
            "Directeur de l'Intelligence Artificielle",
            "Head of Data & AI",
            "Group Chief Data Officer",
        ],
        ("Data", "de l'Intelligence Artificielle", "Data & IA"),
        ("Data", "Artificial Intelligence", "Data & Analytics"),
    ),
    "achats": (
        [
            "Directeur des Achats",
            "Directrice des Achats",
            "Directeur Achats Groupe",
            "Chief Procurement Officer",
            "Head of Procurement",
            "Head of Purchasing",
            "Group Procurement Director",
            "Directeur des Achats IT",
        ],
        ("des Achats", "des Achats IT et Services"),
        ("Procurement", "IT Procurement", "Purchasing"),
    ),
    "dsi": (
        [
            "DSI",
            "DSI Groupe",
            "Directeur des Systèmes d'Information",
            "Directrice des Systèmes d'Information",
            "Directeur Informatique",
            "Directeur du Numérique",
            "CIO",
            "Group CIO",
            "Chief Information Officer",
            "Head of IT",
        ],
        ("des Systèmes d'Information", "de l'Infrastructure IT"),
        ("IT", "Information Systems"),
    ),
    "cloud": (
        ["Directeur Cloud", "Head of Cloud", "Chief Cloud Officer", "Head of Platform Engineering", "Directeur Infrastructure & Cloud"],
        ("Cloud", "des Infrastructures"),
        ("Cloud", "Platform Engineering"),
    ),
    "ingenierie": (
        ["Directeur Industriel", "Directeur de l'Ingénierie", "Head of Engineering", "VP Engineering", "Directeur Technique"],
        ("de l'Ingénierie", "Industriel"),
        ("Engineering", "Manufacturing"),
    ),
    "btp": (
        ["Directeur BTP", "Directeur de Travaux", "Directeur Technique BTP", "Directeur Général Adjoint Travaux"],
        ("des Travaux", "Technique BTP"),
        ("Construction", "Site Operations"),
    ),
    "sante": (
        ["Directeur Médical", "Directeur des Soins", "Directeur d'Établissement de Santé", "Chief Medical Officer"],
        ("Médical", "des Systèmes d'Information Hospitaliers"),
        ("Healthcare IT", "Medical Affairs"),
    ),
    "energie": (
        ["Directeur Énergie", "Directeur Technique Énergie", "Head of Energy", "Chief Energy Officer"],
        ("de l'Énergie", "des Opérations Énergie"),
        ("Energy", "Power Operations"),
    ),
    "finance": (
        ["Directeur Financier", "DAF", "CFO", "Chief Financial Officer", "Directeur des Risques", "Chief Risk Officer"],
        ("Financier", "des Risques"),
        ("Finance", "Risk"),
    ),
}

# Les familles ajoutées par #4923 : socle du comité d'achat (transformation,
# direction générale — #4923.1) puis familles SECTORIELLES (#4923.4). Même forme
# que ``_PRESETS`` ; la raison de chacune est en commentaire.
_NEW_FAMILIES: list[dict[str, Any]] = [
    {
        "name": "transformation",
        # Socle comité d'achat : la transformation (digitale, SI, opérations)
        # signe ou cosigne les missions d'une ESN dans tout grand compte.
        "synonyms": {"transformation", "digital"},
        "acronyms": set(),
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur de la Transformation", "Chief Transformation Officer", "Chief Digital Officer", "Directeur Digital", "Head of Transformation"],
        "fr": ("de la Transformation", "de la Transformation Digitale"),
        "en": ("Transformation", "Digital"),
    },
    {
        "name": "direction_generale",
        # Socle comité d'achat : le sponsor final. Aucun synonyme d'un seul mot
        # (« direction » est dans mille titres) — la famille ne se couvre que
        # par ses titres complets.
        "synonyms": set(),
        "acronyms": {"pdg", "ceo", "coo"},
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite"],
        "head": ["Directeur Général", "PDG", "CEO", "Directeur Général Adjoint", "Chief Operating Officer", "Managing Director"],
        "fr": ("Général Délégué", "des Opérations"),
        "en": ("Operations", "Business Unit"),
    },
    {
        "name": "assurance",
        # Assurance : actuariat, risques, sinistres (retour AXA) — plus fin que la
        # famille « finance », qui reste le CFO / CRO transverse.
        "synonyms": {"sinistres", "actuariat", "souscription", "bancassurance"},
        "acronyms": set(),
        "sector_associations": {},
        "exclusions": {"assurance qualite"},
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur des Sinistres", "Directeur Technique Assurance", "Directeur de l'Actuariat", "Chief Underwriting Officer", "Head of Claims"],
        "fr": ("des Sinistres", "de l'Actuariat"),
        "en": ("Claims", "Underwriting"),
    },
    {
        "name": "retail",
        # Retail / e-commerce : e-commerce, magasins, omnicanal (retour Decathlon).
        "synonyms": {"ecommerce", "magasins", "omnicanal", "merchandising"},
        "acronyms": set(),
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur E-commerce", "Directeur Omnicanal", "Directeur des Magasins", "Head of E-commerce", "Chief Retail Officer"],
        "fr": ("E-commerce", "des Magasins"),
        "en": ("E-commerce", "Retail Operations"),
    },
    {
        "name": "cosmetique_luxe",
        # Cosmétique / luxe : packaging, marques, innovation produit (retour L'Oréal).
        "synonyms": {"cosmetique", "luxe", "beaute", "parfumerie"},
        "acronyms": set(),
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur Beauté Tech", "Directeur Marques", "Directeur Packaging", "Chief Beauty Tech Officer", "Head of Beauty Tech"],
        "fr": ("des Marques", "de l'Innovation Produit"),
        "en": ("Brand", "Beauty Tech"),
    },
    {
        "name": "industrie_production",
        # Industrie / production : usines et opérations industrielles — distinct de
        # « ingenierie » (bureaux d'études, méthodes).
        "synonyms": {"production", "usine", "fabrication"},
        "acronyms": set(),
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur de Production", "Directeur d'Usine", "Directeur des Opérations Industrielles", "Head of Manufacturing", "Plant Manager"],
        "fr": ("de Production", "des Opérations Industrielles"),
        "en": ("Manufacturing", "Industrial Operations"),
    },
    {
        "name": "supply_chain",
        # Supply chain : approvisionnement, logistique (retail, industrie, luxe).
        "synonyms": {"logistique", "approvisionnement", "supply"},
        "acronyms": {"scm"},
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur Supply Chain", "Directeur Logistique", "Chief Supply Chain Officer", "Head of Supply Chain", "Directeur des Approvisionnements"],
        "fr": ("Supply Chain", "Logistique"),
        "en": ("Supply Chain", "Logistics"),
    },
    {
        "name": "qualite_qhse",
        # Qualité : qualité industrielle et QHSE. Pas de synonyme « qualite » seul :
        # « assurance qualité » est un faux ami déjà tenu par « finance » et
        # « assurance », et ne doit pas retomber ici (test_finance_excludes_…).
        "synonyms": {"qhse"},
        "acronyms": {"qhse", "qse"},
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur Qualité", "Directeur QHSE", "Chief Quality Officer", "Head of Quality", "Directeur Qualité Groupe"],
        "fr": ("Qualité", "QHSE"),
        "en": ("Quality", "Quality Assurance"),
    },
    {
        "name": "rd",
        # R&D / innovation / CTO : sponsors des missions de R&D et d'ingénierie.
        "synonyms": {"innovation", "recherche"},
        "acronyms": {"cto", "rnd"},
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur R&D", "Directeur de l'Innovation", "Chief Technology Officer", "CTO", "Head of R&D"],
        "fr": ("R&D", "de l'Innovation"),
        "en": ("R&D", "Innovation"),
    },
    {
        "name": "rh_sirh",
        # RH / SIRH : projets de paie, SIRH, transformation RH.
        "synonyms": {"sirh", "paie"},
        "acronyms": {"drh", "chro", "sirh"},
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["DRH", "Directeur des Ressources Humaines", "Chief Human Resources Officer", "Directeur SIRH", "Head of HR Digital"],
        "fr": ("des Ressources Humaines", "SIRH"),
        "en": ("Human Resources", "HR Information Systems"),
    },
    {
        "name": "marketing_digital",
        # Marketing digital : CRM, data marketing, e-commerce côté marque.
        "synonyms": {"marketing", "crm"},
        "acronyms": {"cmo"},
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur Marketing Digital", "Chief Marketing Officer", "CMO", "Head of Digital Marketing", "Directeur Marketing"],
        "fr": ("Marketing Digital", "du CRM"),
        "en": ("Digital Marketing", "CRM"),
    },
    {
        "name": "juridique_conformite",
        # Juridique / conformité : DPO, conformité réglementaire (banque, assurance).
        "synonyms": {"juridique", "conformite", "compliance"},
        "acronyms": {"dpo"},
        "sector_associations": {},
        "exclusions": set(),
        "seniorities": ["c_suite", "vp", "director"],
        "head": ["Directeur Juridique", "General Counsel", "Chief Compliance Officer", "DPO", "Directeur de la Conformité"],
        "fr": ("Juridique", "de la Conformité"),
        "en": ("Legal", "Compliance"),
    },
]

for _preset in _PRESETS:
    _head, _fr, _en = _TAXONOMY[_preset["name"]]
    _preset["head_titles"] = list(_head)
    _preset["titles"] = _dedupe(_head + list(_preset["titles"]) + _expand_titles(_fr, _en))

for _fam in _NEW_FAMILIES:
    _head_new = list(_fam.pop("head"))
    _fr_new = _fam.pop("fr")
    _en_new = _fam.pop("en")
    _fam["head_titles"] = _head_new
    _fam["titles"] = _dedupe(_head_new + _expand_titles(_fr_new, _en_new))
    _PRESETS.append(_fam)

# Geography tokens → the Apollo person_locations value.
_GEO_TOKENS = {"france": "France", "paris": "France", "europe": "Europe"}

# #2532.2 — retour client 17/09/2026 : un métier hors informatique
# ("Coordinateur de chantier", BTP) retombait sur UN SEUL mot-clé littéral
# (aucun des 5 presets IT n'est hors IT), la recherche de contacts revenait
# bredouille. Décision de Louis (QCM, 18/09/2026, RETENU) : « il faut que ça
# marche hors IT ». Un preset par métier serait une liste magique sans fin
# (BTP, santé, industrie, juridique…) — au lieu de ça, une règle GRAMMATICALE
# générique et sourcée (les suffixes masculin/féminin les plus courants du
# français administratif/professionnel) qui élargit le périmètre de recherche
# pour N'IMPORTE QUEL intitulé, jamais un métier nommé.
#
# ⚠️ REVIREMENT (21/09/2026, voir docstring de tête de module) : ce choix a
# depuis été complété par 5 presets hors IT NOMMÉS (ingénierie, BTP, santé,
# énergie, finance — ci-dessus). La règle grammaticale ci-dessous RESTE : elle
# élargit désormais tout métier qui n'entre encore dans AUCUN des 10 presets,
# jamais un métier déjà couvert par un preset nommé.
# La variante sert UNIQUEMENT à TROUVER des contacts, jamais à les CLASSER —
# aucun critère protégé ne pèse dans un rang (CLAUDE.md « Doctrine »).
_GENDER_SUFFIX_PAIRS: list[tuple[str, str]] = [
    ("teur", "trice"),  # coordinateur ↔ coordinatrice, directeur ↔ directrice
    ("eur", "euse"),  # vendeur ↔ vendeuse, chercheur ↔ chercheuse
    ("ier", "ière"),  # ouvrier ↔ ouvrière, infirmier ↔ infirmière
    ("er", "ère"),  # boulanger ↔ boulangère, conseiller ↔ conseillère
    ("é", "ée"),  # chargé ↔ chargée, attaché ↔ attachée
]


def _gender_variant(word: str) -> str | None:
    """La forme grammaticale opposée de ``word`` (masculin ↔ féminin) selon les
    suffixes français les plus courants, ou ``None`` si aucun ne s'applique.
    Déterministe, sans dictionnaire de métiers : une règle de grammaire pour
    n'importe quel intitulé, jamais un métier ajouté nommément (GA-26 — une
    seule règle, pas un preset par profession)."""
    lower = word.lower()
    for masc, fem in _GENDER_SUFFIX_PAIRS:
        if lower.endswith(masc) and not lower.endswith(fem):
            return word[: -len(masc)] + fem
        if lower.endswith(fem):
            return word[: -len(fem)] + masc
    return None


def _generic_title_variants(raw: str) -> list[str]:
    """``raw`` → lui-même, puis sa variante grammaticale opposée sur le premier
    mot (le nom de métier), si une règle s'applique — jamais un mot-clé brut
    seul sans expansion (#2532.2). Généralise à n'importe quel métier hors des
    5 presets IT ci-dessus, sans en nommer aucun."""
    if not raw:
        return []
    words = raw.split(" ", 1)
    head = words[0]
    rest = f" {words[1]}" if len(words) > 1 else ""
    variants = [raw]
    variant_head = _gender_variant(head)
    if variant_head and variant_head != head:
        variants.append(f"{variant_head}{rest}")
    return variants


def _contains_phrase(haystack: str, phrase: str) -> bool:
    """True si ``phrase`` (déjà normalisée) apparaît dans ``haystack`` (déjà
    normalisé) sur des frontières de mot. Évite qu'un mot isolé dans une autre
    expression ne déclenche une exclusion ou une association sectorielle par
    sous-chaîne (« si » dans « saisie », par exemple)."""
    if not phrase:
        return False
    return f" {phrase} " in f" {haystack} "


def _is_excluded(tokens_raw: str, preset: dict[str, Any]) -> str | None:
    """Le faux ami reconnu dans ``tokens_raw``, ou ``None``. Une exclusion qui
    matche empêche TOUTE correspondance sur cette famille pour ce thème."""
    for phrase in preset["exclusions"]:
        if _contains_phrase(tokens_raw, phrase):
            return phrase
    return None


def _make_match(
    *,
    family: str | None,
    matched_term: str | None,
    matched_via: MatchVia,
    sector_association: str | None = None,
    excluded_as_faux_ami: str | None = None,
    widened: bool = False,
) -> dict[str, Any]:
    """UNE seule forme de provenance de correspondance (GA-26) — réutilisée pour
    2290.4 (terme direct), 2290.5 (synonymie), 2290.6 (famille), 2290.7
    (association sectorielle) et 2290.8 (élargi ≠ exact), datée par 2290.9."""
    return {
        "family": family,
        "matchedTerm": matched_term,
        "matchedVia": matched_via,
        "sectorAssociation": sector_association,
        "excludedAsFauxAmi": excluded_as_faux_ami,
        "dictionaryVersion": THEME_DICTIONARY_VERSION,
        # 2290.8 — un résultat élargi n'est jamais présenté comme une
        # correspondance exacte. ``False`` ici = correspondance exacte au
        # dictionnaire ; les passes d'élargissement (bande de séniorité, relance
        # automatique par famille) posent ``True`` explicitement (côté appelant,
        # ``phase2_contacts.py`` — ce module ne déclenche aucun élargissement).
        "widened": widened,
    }


def resolve_theme_scope(theme: str) -> dict[str, Any]:
    """A free-text theme → ``{titles, seniorities, geographies, entity, match}`` scope.

    A recognised theme expands to its curated Apollo titles; an unknown one falls
    back to the raw theme PLUS its opposite grammatical gender variant
    (#2532.2 — "Coordinateur de chantier" also searches "Coordinatrice de
    chantier") as title keywords, never a single raw keyword. A geography
    token in the theme ("DSI France") adds ``person_locations``. ``entity``
    stays ``None`` — a theme narrows the persona, not the company (the caller
    keeps the account).

    ``match`` (2290.4-2290.9) est la provenance de la correspondance : famille,
    terme déclencheur, chemin (terme direct / acronyme / synonyme / association
    sectorielle / repli brut), version du dictionnaire. Un thème inconnu ou
    exclu par un faux ami rend ``match.matchedVia == "raw_fallback"`` et
    ``match.family is None`` — jamais une famille devinée.
    """
    tokens_raw = normalize_name(theme)
    tokens = set(tokens_raw.split())
    scope: dict[str, Any] = {
        "titles": [],
        "seniorities": [],
        "geographies": [],
        "entity": None,
        "match": _make_match(family=None, matched_term=None, matched_via="raw_fallback"),
    }

    for preset in _PRESETS:
        excluded_phrase = _is_excluded(tokens_raw, preset)
        if excluded_phrase:
            # Faux ami reconnu : cette famille ne matche pas CE thème, mais on
            # garde la trace de l'exclusion sur le repli brut si aucune autre
            # famille ne matche non plus.
            # La PREMIÈRE famille qui reconnaît le faux ami le nomme (plusieurs peuvent le tenir).
            scope["match"]["excludedAsFauxAmi"] = scope["match"]["excludedAsFauxAmi"] or preset["name"]
            continue
        if preset["name"] in tokens:
            scope["match"] = _make_match(family=preset["name"], matched_term=preset["name"], matched_via="direct")
        elif tokens & preset["acronyms"]:
            term = sorted(tokens & preset["acronyms"])[0]
            scope["match"] = _make_match(family=preset["name"], matched_term=term, matched_via="acronym")
        elif tokens & preset["synonyms"]:
            term = sorted(tokens & preset["synonyms"])[0]
            scope["match"] = _make_match(family=preset["name"], matched_term=term, matched_via="synonym")
        else:
            sector_hit = next(
                (phrase for phrase in preset["sector_associations"] if _contains_phrase(tokens_raw, phrase)),
                None,
            )
            if sector_hit:
                scope["match"] = _make_match(
                    family=preset["name"],
                    matched_term=sector_hit,
                    matched_via="sector_association",
                    sector_association=preset["sector_associations"][sector_hit],
                )
            else:
                continue

        scope["titles"] = list(preset["titles"])
        scope["seniorities"] = list(preset["seniorities"])
        break
    else:
        raw = theme.strip()
        scope["titles"] = _generic_title_variants(raw)

    for tok in tokens:
        if tok in _GEO_TOKENS:
            scope["geographies"] = [_GEO_TOKENS[tok]]
            break

    return scope


def theme_title_match(title: str | None, theme_scope: dict[str, Any]) -> bool:
    """Le titre d'un contact SUPPLÉMENTAIRE (repli Brave+Claude — jamais le
    passage Apollo, déjà filtré par ``person_titles``) correspond-il au thème
    résolu, par containment de phrase normalisée sur l'un des titres/mots-clés
    de ``theme_scope['titles']`` (la liste déjà étendue : titres du preset, ou
    thème brut + variante de genre pour un métier hors IT — #2532.2) ?

    #2532.2 bis (retour BOUYGUES CONSTRUCTION, 19/09/2026) — le repli
    Brave+Claude ne recevait PAS le thème : sous le seuil de repli, il
    interrogeait les personas GÉNÉRIQUES du profil, même pour une recherche
    « Coordinateur de chantier ». Cette fonction sert à NE PAS attribuer le
    thème à un contact qui n'y correspond pas — jamais à l'écarter du dossier
    (« on archive, on ne supprime pas » : voir ``themeSearch.outOfThemeCount``
    dans ``phase2_contacts._contacts``)."""
    if not title:
        return False
    title_norm = normalize_name(title)
    return any(
        candidate and _contains_phrase(title_norm, normalize_name(candidate))
        for candidate in theme_scope.get("titles", [])
    )


# Exposed so the front can render the ready-made theme chips.
THEME_PRESETS: dict[str, dict[str, Any]] = {p["name"]: p for p in _PRESETS}


def _all_input_terms(preset: dict[str, Any]) -> set[str]:
    return {preset["name"]} | preset["synonyms"] | preset["acronyms"]


def _title_matches_preset(title_norm: str, preset: dict[str, Any]) -> bool:
    """``title_norm`` (déjà normalisé) relève-t-il de cette famille — un titre
    canonique en PHRASE (containment : « Responsable Cybersécurité Groupe »
    porte « responsable cybersécurité »), sinon un acronyme/synonyme en mot
    entier (évite les faux positifs de sous-chaîne sur un synonyme court)."""
    for canon_title in preset["titles"]:
        if _contains_phrase(title_norm, normalize_name(canon_title)):
            return True
    tokens = set(title_norm.split())
    return bool(tokens & _all_input_terms(preset))


def _head_match(title_norm: str, preset: dict[str, Any]) -> bool:
    """Le titre porte-t-il un RÔLE DE TÊTE de la famille (#4923.6) — phrase
    entière, jamais un mot isolé : un « MLOps Engineer » contient « data » mais
    pas « Head of Data »."""
    return any(_contains_phrase(title_norm, normalize_name(head)) for head in preset.get("head_titles", []))


def is_target_head(title: str | None, families: Sequence[str] | None) -> bool:
    """Ce titre est-il un RÔLE DE TÊTE d'une des familles cibles (#4923.13) ?

    Sert à ORDONNER (classement, réservation des places d'enrichissement), jamais
    à filtrer : le rôle change l'ordre, pas le contenu (c76). Sans familles ⇒ False.
    """
    if not title or not families:
        return False
    title_norm = normalize_name(title)
    return any(
        _head_match(title_norm, THEME_PRESETS[family]) for family in families if family in THEME_PRESETS
    )


def theme_coverage(seeds: list[dict[str, Any]]) -> dict[str, Any]:
    """Couverture des familles de thèmes dans une recherche GÉNÉRALE (2290.2).

    Trois états mesurés (#4923.6) : ``couverte_tete`` (un rôle de tête de la
    famille a été trouvé), ``couverte_partielle`` (seulement des contributeurs —
    un MLOps Engineer ne couvre plus « data » à lui seul, c'est la cause du
    retour Julien Laszlo), ``non_couverte``. ``non_mesure`` est inchangé.

    Mesure ce qu'on A SU TROUVER parmi les contacts déjà obtenus — jamais ce que
    le marché contient (garde GA-259) : une famille sans correspondance est
    « non couverte PAR CETTE RECHERCHE », pas « absente chez ce client ».

    Une recherche VIDE (aucun contact — ex. panne Apollo) ne mesure RIEN : les
    familles restent ``non_mesure`` plutôt que ``non_couverte``. Un échec de
    recherche ne doit jamais se lire comme « 0 famille couverte » (GA-18/GA-19) —
    ``non_mesure`` SORT du dénominateur (``measured``). ``covered`` compte les
    deux états couverts ; ``headCovered`` ne compte que les têtes.
    """
    families: dict[str, dict[str, Any]] = {}

    if not seeds:
        for preset in _PRESETS:
            families[preset["name"]] = {"status": "non_mesure", "matchedTitles": []}
        return {
            "families": families,
            "dictionaryVersion": THEME_DICTIONARY_VERSION,
            "measured": 0,
            "covered": 0,
            "headCovered": 0,
            "notCovered": 0,
        }

    normalized_titles = [(seed, normalize_name(seed.get("title") or "")) for seed in seeds]

    for preset in _PRESETS:
        matched_titles: list[str] = []
        head_titles: list[str] = []
        for seed, title_norm in normalized_titles:
            if not title_norm:
                continue
            if _head_match(title_norm, preset):
                head_titles.append(str(seed.get("title") or ""))
                matched_titles.append(str(seed.get("title") or ""))
            elif _title_matches_preset(title_norm, preset):
                matched_titles.append(str(seed.get("title") or ""))
        status = "couverte_tete" if head_titles else ("couverte_partielle" if matched_titles else "non_couverte")
        families[preset["name"]] = {
            # Les têtes d'abord : c'est ce qui prouve la couverture.
            "status": status,
            "matchedTitles": (head_titles + [t for t in matched_titles if t not in head_titles])[:5],
        }

    head_covered = sum(1 for f in families.values() if f["status"] == "couverte_tete")
    partial = sum(1 for f in families.values() if f["status"] == "couverte_partielle")
    not_covered = sum(1 for f in families.values() if f["status"] == "non_couverte")
    return {
        "families": families,
        "dictionaryVersion": THEME_DICTIONARY_VERSION,
        "measured": head_covered + partial + not_covered,
        "covered": head_covered + partial,
        "headCovered": head_covered,
        "notCovered": not_covered,
    }


def theme_relaunch_candidates(coverage: dict[str, Any], targets: list[str] | None = None) -> list[str]:
    """Les familles à relancer spécifiquement (2290.3, #4923.6) : ``non_couverte``
    ET ``couverte_partielle`` — une famille sans TÊTE trouvée est candidate.
    ``non_mesure`` n'est JAMAIS candidate : on ne sait rien d'elle, ce n'est pas
    la même chose qu'un zéro constaté. Avec ``targets`` (``target_families``), seules
    les familles ciblées restent, dans l'ordre du ciblage (#4923.7)."""
    missing = {
        name
        for name, info in coverage.get("families", {}).items()
        if info.get("status") in ("non_couverte", "couverte_partielle")
    }
    if targets is None:
        return [n for n in coverage.get("families", {}) if n in missing]
    return [n for n in targets if n in missing]


def family_head_scope(family: str) -> dict[str, Any] | None:
    """Le scope « rôles de tête » d'une famille (#4923.7 : la relance cherche
    d'abord les têtes) — titres de tête SEULS, aucune séniorité (Apollo ANDe les
    deux). ``None`` pour une famille inconnue : jamais un scope deviné."""
    preset = THEME_PRESETS.get(family)
    if not preset:
        return None
    return {"titles": list(preset["head_titles"]), "seniorities": []}


# #4923.1 — le socle du comité d'achat, TOUJOURS ciblé : DSI, Achats / procurement
# IT, Data & IA, Transformation, Direction générale.
BUYING_COMMITTEE_FAMILIES: tuple[str, ...] = ("dsi", "achats", "data", "transformation", "direction_generale")

# Familles voisines : un profil data parle aussi à l'IA (même famille), au cloud
# data et à la BI ; un profil cyber à la DSI ; etc.
_NEIGHBOURS: dict[str, tuple[str, ...]] = {
    "data": ("cloud", "dsi"),
    "cloud": ("dsi", "data", "cyber"),
    "cyber": ("dsi", "juridique_conformite"),
    "dsi": ("cloud", "cyber"),
    "rd": ("ingenierie",),
}

# Secteur du compte → familles métier (#4923.1). Un secteur absent de la table
# n'ajoute rien : on ne devine pas une famille.
_SECTOR_FAMILIES: dict[str, tuple[str, ...]] = {
    "industrie": ("ingenierie", "industrie_production", "qualite_qhse", "supply_chain", "rd"),
    "assurance": ("assurance", "finance", "juridique_conformite"),
    "retail": ("retail", "supply_chain", "marketing_digital"),
    "banque": ("finance", "juridique_conformite"),
    "cosmetique": ("cosmetique_luxe", "rd", "marketing_digital", "supply_chain"),
    "luxe": ("cosmetique_luxe", "marketing_digital", "supply_chain"),
    "sante": ("sante", "qualite_qhse"),
    "energie": ("energie", "ingenierie"),
    "btp": ("btp", "ingenierie"),
}
_SECTOR_ALIASES: dict[str, str] = {
    "industriel": "industrie",
    "manufacturing": "industrie",
    "automobile": "industrie",
    "aeronautique": "industrie",
    "commerce": "retail",
    "distribution": "retail",
    "ecommerce": "retail",
    "bancaire": "banque",
    "finance": "banque",
    "assureur": "assurance",
    "cosmetiques": "cosmetique",
    "beaute": "cosmetique",
    "pharmaceutique": "sante",
    "construction": "btp",
}

# Les clés du profil de l'ESN qui disent ce qu'elle VEND (offres, expertises,
# personas) — lues partout où le profil les range.
_PROFILE_OFFER_KEYS = ("offers", "offres", "expertises", "expertise", "services", "personas", "specialties", "keywords")


def _flatten_strings(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [s for v in value.values() for s in _flatten_strings(v)]
    if isinstance(value, (list, tuple, set)):
        return [s for v in value for s in _flatten_strings(v)]
    return []


def _family_of(text: str) -> str | None:
    family = resolve_theme_scope(text)["match"]["family"]
    return family if family in THEME_PRESETS else None


def target_families(
    profile_data: dict[str, Any] | None,
    scope: Any = None,
    account_sector: str | None = None,
) -> list[str]:
    """Les familles à chercher pour CETTE demande (#4923.1) — fonction pure, ordonnée.

    Croise (1) le scope/thème posé par l'utilisateur, (2) ce que l'ESN vend
    (offres, expertises, personas du profil, et les familles voisines),
    (3) le secteur du compte, puis ajoute TOUJOURS le socle comité d'achat.

    Précédence inchangée : le scope explicite gagne (il passe en tête), mais le
    socle reste ajouté — SAUF quand l'utilisateur a posé des TITRES lui-même :
    c'est une demande exacte, on rend ``[]`` (jamais élargie en silence).
    Aucun critère protégé : seules des familles de MÉTIER entrent ici.
    """
    if scope is not None and getattr(scope, "titles", None):
        return []
    ordered: list[str] = []

    def add(name: str | None) -> None:
        if name and name in THEME_PRESETS and name not in ordered:
            ordered.append(name)

    if scope is not None:
        add(_family_of(scope.theme) if getattr(scope, "theme", None) else None)
        fam = getattr(scope, "family", None)
        if fam:
            add(fam if fam in THEME_PRESETS else _family_of(str(fam)))

    profile = profile_data or {}
    profile_families: list[str] = []
    for key in _PROFILE_OFFER_KEYS:
        for text in _flatten_strings(profile.get(key)):
            fam = _family_of(text)
            if fam and fam not in profile_families:
                profile_families.append(fam)
    for fam in profile_families:
        add(fam)
    for fam in profile_families:
        for neighbour in _NEIGHBOURS.get(fam, ()):
            add(neighbour)

    for token in normalize_name(account_sector or "").split():
        sector = _SECTOR_ALIASES.get(token, token)
        for fam in _SECTOR_FAMILIES.get(sector, ()):
            add(fam)

    for fam in BUYING_COMMITTEE_FAMILIES:
        add(fam)
    return ordered
