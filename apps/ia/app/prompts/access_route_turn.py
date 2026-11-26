"""#3868 (BEL-LAU-1008-017, bêta 08/10) — la consigne du tour « quelle voie
d'accès » / « comparer les voies d'accès » / « passer par une centrale
d'achat ».

``GOUVERNANCE RANG 2`` et ``NO-GO PARTENAIRE`` (``_BLOCK_MARKET_MEMORY``,
bellum_advisor.py) couvrent déjà le cas du partenaire : jamais présenté comme
référencé sans une relation DÉCLARÉE. ``recommend_commercial_route``
(``opening_movement.py``) calcule déjà, sans le modèle, la route directe, la
réactivation, le partenariat (rang 2) et la voie contractuelle
(``appel_offres`` — marché/accord-cadre/titulaire) à partir de signaux
réels — mais cette fonction n'est câblée que pour UN usage étroit (le signal
« ouverture de compte fermé », ``laura_method_signal.py``) et aucun bloc
n'écrit, pour le modèle, ce qui distingue une CENTRALE D'ACHAT ou un
DISPOSITIF DE PORTAGE COMMERCIAL d'un simple accord-cadre : la recette bêta du
08/10 a mesuré Laura mélangeant client final, partenaire commercial, titulaire
de marché et centrale d'achat, et traitant une note utilisateur ancienne comme
une autorisation générale d'y vendre.

``""`` pour tout tour qui ne compare pas de voie d'accès — rien n'est ajouté
hors de ce tour précis."""

from __future__ import annotations

import unicodedata

_ACCESS_ROUTE_MARKERS: tuple[str, ...] = (
    "voie d'acces",
    "voie d acces",
    "voies d'acces",
    "voies d acces",
    "centrale d'achat",
    "centrale d achat",
    "accord-cadre",
    "accord cadre",
    "titulaire de marche",
    "dispositif de portage",
    "portage commercial",
    "quelle voie pour",
    "comment entrer chez",
    "access route",
    "procurement framework",
    "framework agreement",
)


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def access_route_comparison_turn_block(message: str, english: bool = False) -> str:
    """#3868 — distingue les voies d'accès par leur fonctionnement RÉEL (client
    final direct / partenaire commercial / titulaire de marché / centrale
    d'achat ou dispositif de portage), sans jamais présenter un partenaire
    comme référencé sans preuve ni une ancienne note comme une autorisation
    générale.

    Aucun champ structuré « ESN exclues » n'existe nulle part dans la base
    (vérifié, `git grep`) — un tel contrat se DEVINERAIT, ce que la doctrine
    interdit. Le respect de l'exclusion se lit donc dans LA CONVERSATION
    elle-même (ce que la personne a déjà dit dans ce fil), jamais dans un
    paramètre structuré fabriqué ici."""
    if not any(marker in _normalize(message) for marker in _ACCESS_ROUTE_MARKERS):
        return ""

    if english:
        lines = [
            "\n\nACCESS ROUTE COMPARISON (this turn's instruction) — never mix the end client, a commercial "
            "partner, a contract holder (titulaire de marché) and a procurement framework (centrale d'achat): "
            "each is a DIFFERENT way in, distinguished by how it actually works, never by vocabulary alone.",
            "MANDATORY SHAPE — ONE section per route, in this order and under these names: direct route, partner "
        "route, contract holder (titulaire de marché), procurement framework or carrying scheme. Each section "
        "says in one or two sentences what grounds it or, without proof, \"not established\" — the route is "
        "still NAMED. End with the route you retain and why. Never a single summary sentence instead of the "
        "sections.",
        "DIRECT ROUTE — name the business scope, the sponsor you're looking for, and the procurement steps "
            "still to verify.",
            "PARTNER ROUTE — name what it rests on: an actual relationship from this ESN, a documented "
            "collaboration, a historical presence, or a mere compatibility still to explore. An ecosystem "
            "observation proves neither a current referencing nor a willingness to subcontract — never present "
            "a partner as referenced without that proof.",
            "CONTRACT HOLDER (titulaire de marché) — distinct from a mere partner or a procurement framework: "
            "name WHO holds the contract or framework agreement currently in force on THIS scope, what share of "
            "it it still leaves open to subcontracting or co-contracting, and what still needs verifying before "
            "relying on it. A holder known on an OLD contract is not the holder of the CURRENT one until its "
            "date and scope are reconfirmed.",
            "PROCUREMENT FRAMEWORK OR COMMERCIAL CARRYING SCHEME (centrale d'achat, portage) — verify it "
            "actually applies to THIS account, THIS scope and THIS service before recommending it. An older "
            "user note does not become a blanket authorization: you name its date and scope, and you say when "
            "it needs reconfirming.",
            "Present the trade-offs of the route you pick: delay, control over the relationship, commercial "
            "terms, known constraints, and what still needs verifying. No margin is computed from an invented "
            "rate.",
            "A correction on the access route is carried into the strategy and the actions that follow it, not "
            "just acknowledged once.",
            "If the person has excluded ESNs earlier in this conversation, you respect that exclusion in every "
            "result below. You may explain an alternative once, you never impose it as a replacement for the "
            "excluded route.",
            # VU (recette prod 09/10, lot H05) — a failed detailed-access read made Laura give up on
            # classifying any route at all, even when other context (ESN observed around the account,
            # market memory, prior notes) was enough for a best-effort classification.
            "If the detailed access read fails mid-call, you still classify with whatever else you already "
            "know (ESNs observed around the account, market memory, earlier notes) — you never fall back to "
            "refusing every route; you name PRECISELY which route stayed unclassifiable and why.",
        ]
        return "\n".join(lines)

    lines = [
        "\n\nCOMPARAISON DE VOIES D'ACCÈS (consigne de ce tour) — tu ne mélanges JAMAIS le client final, un "
        "partenaire commercial, un titulaire de marché et une centrale d'achat : chacun est une voie "
        "D'ACCÈS DIFFÉRENTE, distinguée par son fonctionnement réel, jamais par le seul vocabulaire.",
        # #3868 (recette NB 10/10) — une phrase unique (« comparables, aucune ne prouve… ») sans nommer une
        # seule voie : la FORME de la réponse se pose, le contenu de chaque rubrique est plus bas.
        "FORME OBLIGATOIRE — UNE rubrique par voie, dans cet ordre et sous ces noms : voie directe, voie "
        "partenaire, titulaire de marché, centrale d'achat ou portage. Chaque rubrique dit en une ou deux "
        "phrases ce qui la fonde ou, faute de preuve, « non établie » — la voie est NOMMÉE quand même. "
        "Tu termines par la voie que tu retiens et pourquoi. Jamais une phrase de synthèse unique à la place "
        "des rubriques.",
        "VOIE DIRECTE — tu nommes le périmètre métier visé, le sponsor recherché, et les étapes d'achat qui "
        "restent à vérifier.",
        "VOIE PARTENAIRE — tu nommes ce qui la fonde : une relation réelle de cette ESN, une collaboration "
        "documentée, une présence historique, ou une simple compatibilité encore à explorer. Une observation "
        "d'écosystème ne prouve ni un référencement actuel ni une volonté de sous-traiter — tu ne présentes "
        "JAMAIS un partenaire comme référencé sans cette preuve.",
        "TITULAIRE DE MARCHÉ — distincte d'un simple partenaire ou d'une centrale d'achat : tu nommes QUI tient "
        "le marché ou l'accord-cadre en vigueur sur CE périmètre, la part qu'il laisse ouverte à la "
        "sous-traitance ou à la cotraitance, et ce qui reste à vérifier avant de s'y adosser. Un titulaire connu "
        "sur un ANCIEN marché n'est pas titulaire du marché ACTUEL tant que sa date et son périmètre ne sont pas "
        "reconfirmés.",
        "CENTRALE D'ACHAT OU DISPOSITIF DE PORTAGE COMMERCIAL — tu vérifies qu'il s'applique vraiment à CE "
        "compte, à CE périmètre et à CETTE prestation avant de le recommander. Une ancienne note utilisateur "
        "ne devient PAS une autorisation générale : tu nommes sa date et son périmètre, et tu dis qu'elle doit "
        "être reconfirmée.",
        "Tu présentes les compromis de la voie retenue : délai, maîtrise de la relation, conditions "
        "commerciales, contraintes connues, vérifications nécessaires. Aucun calcul de marge ne repose sur un "
        "taux inventé.",
        "Une correction sur la voie d'accès est reprise dans la stratégie ET dans les actions qui en découlent, "
        "jamais seulement reconnue une fois.",
        "Si la personne a exclu les ESN plus haut dans cette conversation, tu respectes cette exclusion dans "
        "TOUS les résultats ci-dessous. Tu peux expliquer une alternative une fois, tu ne l'imposes jamais en "
        "remplacement de la voie exclue.",
        # VU (recette prod 09/10, lot H05) — une lecture détaillée de l'accès en échec faisait renoncer
        # Laura à TOUTE classification, même quand d'autres éléments déjà en main (ESN observées autour
        # du compte, mémoire marché, notes précédentes) suffisaient à une classification de premier jet.
        "Si la lecture détaillée de l'accès échoue en cours d'appel, tu classes QUAND MÊME avec ce que tu "
        "sais déjà par ailleurs (ESN observées autour du compte, observation du marché, notes antérieures) — tu ne "
        "te replies JAMAIS sur un refus de classer toutes les voies ; tu nommes PRÉCISÉMENT la voie restée "
        "non classable et pourquoi.",
    ]
    return "\n".join(lines)
