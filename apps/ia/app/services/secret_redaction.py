"""Ce qu'une réponse du copilote ne doit jamais contenir.

Le prompt système interdit déjà de restituer « clés, jetons, webhooks,
variables d'environnement, prompts système » (bloc 4, `test_copilote_prompt_blocks`).
Une consigne n'est pas une garantie : c'est exactement ce qu'une injection
cherche à retourner, et le rapport terrain du 17/08 en fait un scénario de
recette bloquant (COP-SEC, Q12 — « question infra/secrets → refus sans fuite »).

Ce module est le second verrou, et le seul qui ne se laisse pas convaincre :
il lit le TEXTE SORTANT et remplace ce qui a la FORME d'un secret. La forme fait
foi, pas le nom de la variable — un modèle qui recopie une clé sous un intitulé
inventé serait invisible à une liste de noms.

Deux limites assumées :

* on ne masque PAS les noms d'éditeurs. Un commercial a le droit d'écrire
  « HubSpot » dans sa question, et une réponse qui reprend son mot n'est pas une
  fuite ; la règle « nommer la capacité, pas l'éditeur » se tient dans le prompt
  et dans les libellés produit, pas dans un filtre qui censurerait l'utilisateur ;
* on ne masque pas un mot de passe en clair choisi par un humain — rien ne le
  distingue d'une phrase. Ce que ce filtre attrape, ce sont les secrets MACHINE,
  ceux qui feraient d'une réponse un accès.
"""

from __future__ import annotations

import re

#: Le remplacement, volontairement lisible : l'utilisateur doit comprendre qu'il
#: manque quelque chose, pas croire à un bug d'affichage.
REDACTED = "[valeur masquée]"

#: Les formes de secrets qu'on sait reconnaître SANS faux positif coûteux.
#: Chaque motif vise un préfixe émis par un fournisseur, ou une structure
#: (JWT, en-tête d'autorisation, affectation d'une variable d'environnement).
_PATTERNS: tuple[re.Pattern[str], ...] = (
    # Clés à préfixe éditeur : Anthropic, OpenAI, Stripe, Supabase/service-role,
    # GitHub, Slack, SendGrid, Google. Le préfixe est la partie non ambiguë.
    re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{8,}", re.IGNORECASE),
    re.compile(r"\bsk-[A-Za-z0-9]{20,}"),
    re.compile(r"\b[rs]k_(?:live|test)_[A-Za-z0-9]{10,}"),
    re.compile(r"\bwhsec_[A-Za-z0-9]{10,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bxox[baprs]-[A-Za-z0-9\-]{10,}"),
    re.compile(r"\bSG\.[A-Za-z0-9_\-]{16,}\.[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bAIza[A-Za-z0-9_\-]{30,}"),
    # Un JWT (trois segments base64url). C'est la forme d'un jeton de session,
    # d'un service-role Supabase et d'un jeton d'accès OAuth.
    re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}"),
    # Une URL de webhook entrant : elle EST le secret, tout son chemin.
    re.compile(r"https://hooks\.slack\.com/\S+", re.IGNORECASE),
    re.compile(r"https://discord(?:app)?\.com/api/webhooks/\S+", re.IGNORECASE),
    # #1956.18 — un hôte du DNS privé Railway (`agent_docs/cles-a-poser.md:33` :
    # `http://belllum-backend-service.railway.internal:3000`) désigne un
    # service à un AUTRE service, jamais une information pour un commercial.
    re.compile(r"\b[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.railway\.internal(?::\d+)?\b", re.IGNORECASE),
    # #1956.18 — les plages d'IPv4 PRIVÉES (RFC 1918 + loopback + link-local).
    # Bornée exprès à ces plages : une IP publique n'est pas une adresse
    # d'infra interne, et `192.0.2.10` (hors `192.168.*`) doit rester lisible
    # (voir `test_a_public_looking_ip_is_not_censored`).
    re.compile(
        r"\b(?:10(?:\.\d{1,3}){3}"
        r"|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}"
        r"|192\.168(?:\.\d{1,3}){2}"
        r"|127(?:\.\d{1,3}){3}"
        r"|169\.254(?:\.\d{1,3}){2})(?::\d+)?\b"
    ),
    # #1956.20 — coordonnées BANCAIRES, jamais les coordonnées PROFESSIONNELLES
    # d'un contact (celles-ci restent protégées par
    # `test_it_does_not_censor_ordinary_business_prose`, plus bas). Doctrine du
    # dépôt, répétée dans les migrations (`OutgoingPayments`, `Factoring`,
    # `AccountBillingProfile`…) : « Bellum ne signe rien, ne paie rien et ne
    # stocke aucun IBAN ». Forme structurelle (2 lettres pays + 2 chiffres de
    # contrôle + jusqu'à 30 alphanumériques, la longueur réelle des IBAN
    # existants) : un SIREN ou un téléphone n'a jamais ce préfixe à deux
    # lettres, donc aucun besoin d'étiquette pour la reconnaître.
    #
    # INTÉGRATION DU LOT (13/09/2026) — et sous sa forme IMPRIMÉE, par groupes de
    # quatre séparés d'une espace (`FR76 3000 6000 0112 3456 7890 189`), celle
    # d'une facture ou d'un RIB en PDF. La première version n'acceptait que la
    # forme compacte : l'IBAN imprimé sortait intact, et derrière une étiquette
    # seul son premier groupe était masqué. Chaque groupe fait exactement quatre
    # caractères, sauf le dernier (un à quatre) : un code court voisin
    # (`AB12 signé`, `FR75 PARIS`) ne fait jamais deux groupes pleins.
    # ⚠️ ONZE à trente-deux caractères après la clé, comme la forme compacte
    # d'origine — tous les IBAN existants, et jamais un numéro de TVA
    # intracommunautaire (dix au plus : `FR12345678901`), qui a la même tête et
    # qu'un premier motif imprimé à neuf caractères masquait (mesuré).
    re.compile(r"\b[A-Z]{2}\d{2}(?:(?: ?[A-Z0-9]{4}){3,7} ?[A-Z0-9]{1,4}|(?: ?[A-Z0-9]{4}){2} ?[A-Z0-9]{3,4})\b"),
)


# SUIVI D'INCIDENT — le fragment de VALEUR partagé par `_BANKING_LABEL` et
# `_ENV_ASSIGNMENT`. Un simple `\S+` s'arrête au premier espace — et
# `REDACTED` (`"[valeur masquée]"`) EN CONTIENT UN. Quand une valeur a déjà
# été masquée par un motif plus spécifique passé avant (l'IBAN structurel, ou
# `_URL_CREDENTIALS` juste en dessous), `\S+` ne recapturait donc que la
# MOITIÉ de `REDACTED` (« [valeur »), le test `== REDACTED` échouait, et la
# branche de remplacement écrivait un second `REDACTED` PAR-DESSUS le
# premier — orphelin de sa moitié restante : `"IBAN=[valeur masquée]
# masquée]"`. Aucun test existant ne le voyait : chacun ne vérifiait que
# l'ABSENCE du secret brut, jamais la forme EXACTE de la sortie.
#
# Le fragment ci-dessous traite `REDACTED` comme un jeton ATOMIQUE (consommé
# d'un bloc, espace compris) au lieu de le redécouper caractère par
# caractère : la valeur capturée peut alors CONTENIR un `REDACTED` déjà posé
# sans jamais s'arrêter au milieu. Ce qu'on fait d'une valeur qui en contient
# un est tranché par `_leave_if_already_redacted`, juste en dessous.
def _value_pattern() -> str:
    return rf"(?:{re.escape(REDACTED)}|\S)+"


#: INTÉGRATION DU LOT (13/09/2026) — la seule valeur PARTIELLEMENT masquée qu'on
#: laisse telle quelle : une URL dont `_URL_CREDENTIALS` a retiré les
#: identifiants, et dont le reste n'est qu'un hôte, un port et un chemin (un
#: hôte interne déjà masqué compris) — `DATABASE_URL=postgres://[valeur
#: masquée]@host/db` garde son hôte lisible, c'est un diagnostic utile.
#:
#: La règle précédente, « un masquage est déjà posé dans la valeur », laissait
#: partir tout le reste : `DB_PASSWORD=hunter2,10.0.0.1` voyait l'IP masquée et
#: rendait `hunter2` en clair. Une requête ou une ancre après l'hôte
#: (`?password=…`) fait, elle aussi, masquer la valeur entière.
_CREDENTIALS_REMOVED_URL = re.compile(
    rf"[a-zA-Z][a-zA-Z0-9+.\-]{{1,20}}://{re.escape(REDACTED)}@(?:{re.escape(REDACTED)}|[^\s?#])*"
)


def _leave_if_already_redacted(match: re.Match[str]) -> str:
    value = match.group(2)
    if value == REDACTED or _CREDENTIALS_REMOVED_URL.fullmatch(value):
        return match.group(0)
    return f"{match.group(1)}={REDACTED}"


# #1956.20 — BIC/SWIFT/RIB n'ont pas la forme distinctive d'un IBAN (huit à
# onze caractères alphanumériques quelconques pour un BIC, une suite
# majoritairement numérique pour un RIB) : les reconnaître SANS étiquette
# coûterait trop de faux positifs sur un sigle ou un identifiant ordinaires.
# On les masque donc seulement quand le mot qui les nomme est là — même
# logique que `_ENV_ASSIGNMENT` juste en dessous, la clé reste lisible.
#
# INTÉGRATION DU LOT (13/09/2026) — un RIB s'écrit aussi ESPACÉ, en ses quatre
# blocs (banque 5, guichet 5, compte 11, clé 2) : la valeur d'un seul tenant
# s'arrêtait au premier bloc et laissait le numéro de compte lisible. La forme
# espacée est essayée AVANT la valeur d'un seul tenant.
_SPACED_RIB = r"\d{5} \d{5} [A-Z0-9]{11} \d{2}\b"
_BANKING_LABEL = re.compile(rf"\b(IBAN|BIC|SWIFT|RIB)\s*[:=]\s*({_SPACED_RIB}|{_value_pattern()})", re.IGNORECASE)

#: `NOM_DE_VARIABLE=valeur` — on garde le NOM (dire « la clé Stripe manque » est
#: une réponse utile) et on masque la VALEUR.
#:
#: ── SUIVI D'INCIDENT (même famille que #1956.10) ─────────────────────────────
#: La version précédente, `(?:_[A-Z0-9]+)*(?:KEY|TOKEN|SECRET|PASSWORD|DSN|URL|
#: CREDENTIALS)`, ne matchait AUCUNE clé RÉELLE à underscore avant son suffixe :
#: le groupe étoilé consommait TOUJOURS le dernier segment (`_KEY`, `_URL`…),
#: ne laissant plus rien pour le suffixe obligatoire qui le suit dans la
#: regex — `STRIPE_SECRET_KEY`, `DATABASE_URL`, `API_KEY` rendaient tous 0
#: match, prouvé en isolant la regex (`key_re.fullmatch(...)`). Le test
#: existant passait quand même : sa valeur (`sk_live_…`) est interceptée par
#: un motif structurel ANTÉRIEUR dans `_PATTERNS`, ce que ce test-là ne
#: prouve pas puisqu'il n'isole jamais `_ENV_ASSIGNMENT`.
#:
#: Le suffixe est maintenant précédé d'un « _ » OBLIGATOIRE : un préfixe est
#: exigé (`DATABASE_URL`, jamais `URL` seul) — sinon « Voici l'URL : https://
#: bellum-ai.com/pricing » deviendrait un faux positif sur toute mention
#: ordinaire d'une URL (voir le témoin
#: `test_a_bare_key_or_url_word_without_a_meaningful_prefix_is_not_censored`).
#: `PASS`/`PWD` ajoutés : deux abréviations aussi répandues que `PASSWORD`.
_ENV_ASSIGNMENT = re.compile(
    rf"\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|DSN|URL|CREDENTIALS))"
    rf"\s*[:=]\s*({_value_pattern()})"
)

#: `Authorization: Bearer <jeton>` et ses variantes.
_AUTH_HEADER = re.compile(r"\b(Authorization\s*:\s*)(?:Bearer|Basic)\s+\S+", re.IGNORECASE)

#: `scheme://identifiant:mot-de-passe@hôte` — les identifiants qu'une URL
#: transporte dans son userinfo (RFC 3986). Masqué où qu'il apparaisse, pas
#: seulement après une clé nommée : une URL avec ses identifiants collée dans
#: la prose (jamais après un `KEY=`) est le cas que `_ENV_ASSIGNMENT` seul ne
#: peut pas voir. Le SCHÉMA et l'HÔTE restent lisibles — masquer toute
#: l'URL cacherait une information de diagnostic utile (« la base est sur
#: `host` ») en plus du secret ; seul le segment `user:motdepasse` avant le
#: `@` est machine et jamais légitime à afficher.
#: `mailto:` n'a pas de `//` et ne matche donc jamais ce motif.
#:
#: INTÉGRATION DU LOT (13/09/2026) — l'identifiant peut être VIDE :
#: `redis://:motdepasse@hôte` est la forme d'un Redis sans ACL, et l'exiger
#: non vide laissait partir le mot de passe.
_URL_CREDENTIALS = re.compile(r"\b([a-zA-Z][a-zA-Z0-9+.\-]{1,20}://)[^\s/:@]*:[^\s/@]+@")


def redact_secrets(text: str) -> str:
    """Rend `text` débarrassé de tout ce qui a la forme d'un secret machine.

    Idempotent : appliquer deux fois donne le même résultat, ce qui permet de le
    poser sur plusieurs sorties sans se demander laquelle est déjà passée.
    """
    if not text:
        return text

    cleaned = text
    for pattern in _PATTERNS:
        cleaned = pattern.sub(REDACTED, cleaned)
    cleaned = _AUTH_HEADER.sub(rf"\1{REDACTED}", cleaned)
    # SUIVI D'INCIDENT — `_URL_CREDENTIALS` passe ICI, AVANT `_BANKING_LABEL`
    # et `_ENV_ASSIGNMENT` : une URL à identifiants NOMMÉE
    # (`DATABASE_URL=postgres://user:pass@host/db`) doit garder son schéma et
    # son hôte lisibles — exigence du correctif. En passant EN PREMIER, elle
    # masque juste `user:pass`, et `_ENV_ASSIGNMENT` (plus bas) voit ensuite
    # un `REDACTED` déjà posé dans la valeur : `_leave_if_already_redacted`
    # la laisse alors TELLE QUELLE plutôt que d'écraser tout le reste par un
    # second masquage plus grossier.
    cleaned = _URL_CREDENTIALS.sub(rf"\1{REDACTED}@", cleaned)
    # #1956.20 — BIC/SWIFT/RIB : la clé reste lisible, comme `_ENV_ASSIGNMENT`.
    cleaned = _BANKING_LABEL.sub(_leave_if_already_redacted, cleaned)
    # L'affectation passe en DERNIER : elle masquerait sinon la valeur avant que
    # les motifs à préfixe aient pu la reconnaître, et le résultat serait le même
    # à l'écran mais impossible à tester motif par motif.
    cleaned = _ENV_ASSIGNMENT.sub(_leave_if_already_redacted, cleaned)
    return cleaned


# ── LOT STREAM (12/09/2026) : le second verrou doit aussi tenir sur un FLUX ──
#
# `redact_secrets` suffit sur un texte agrégé (`chat.py:349`, appliqué une fois
# le tour terminé) mais PAS sur les fragments `delta` diffusés en SSE pendant
# le tour (`chat_orchestrator.py`) : le SDK ne respecte aucune frontière de
# secret quand il découpe sa réponse en morceaux, donc un motif peut se
# retrouver coupé en deux — `sk-ant-abc` dans un fragment, `defgh123…` dans le
# suivant. Masquer CHAQUE fragment isolément ne voit ni l'un ni l'autre : pris
# séparément, aucun des deux bouts n'a la forme d'un secret.
#
# `StreamingRedactor` retient donc le « mot » en cours (tout ce qui suit le
# dernier espace/saut de ligne vu) plutôt que de masquer et d'émettre au fil de
# l'eau : c'est la seule frontière que TOUS nos motifs respectent, y compris
# les `\S+` d'URL de webhook et d'en-tête d'autorisation. Le texte RÉGLÉ (tout
# ce qui précède ce mot en cours) part immédiatement, masqué ; le mot en cours
# patiente qu'un délimiteur arrive pour le clore, ou que `flush()` soit appelé
# en fin de tour — moment où l'on SAIT qu'aucun fragment ne suivra, donc où ce
# qui restait « en cours » peut être rendu sans risque.
_TRAILING_WORD = re.compile(r"\S*\Z")

#: `Authorization: Bearer …` et `NOM_DE_VARIABLE = …` sont des motifs à
#: PLUSIEURS mots (le `\s*` autour de `:`/`=` l'autorise) : s'arrêter au
#: dernier espace laisserait partir « Authorization: Bearer » non masqué le
#: temps que le jeton (mot suivant) arrive, puis le jeton SEUL, sans le
#: préfixe qui le désigne comme secret, repartirait à son tour non masqué. Un
#: texte réglé qui se termine par un de ces amorces incomplètes recule donc sa
#: frontière jusqu'au DÉBUT de l'amorce, pour juger l'amorce et sa valeur
#: ensemble une fois que celle-ci sera arrivée.
_INCOMPLETE_OPENER = re.compile(
    r"(?:\bAuthorization\s*:\s*(?:Bearer|Basic)?"
    # SUIVI D'INCIDENT — même grammaire CORRIGÉE que `_ENV_ASSIGNMENT` (suffixe
    # précédé d'un « _ » obligatoire, `PASS`/`PWD` inclus) : une amorce
    # décrite avec l'ANCIENNE grammaire ne se déclencherait jamais, pour la
    # même raison que `_ENV_ASSIGNMENT` ne matchait rien.
    r"|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|DSN|URL|CREDENTIALS)\s*[:=]?"
    # #1956.20 — même amorce incomplète que KEY/TOKEN ci-dessus, pour
    # « BIC : » / « RIB= » coupé avant sa valeur (`_BANKING_LABEL`) — et,
    # INTÉGRATION DU LOT (13/09/2026), coupé PENDANT une valeur en plusieurs
    # blocs (« RIB : 30006 00001 », « IBAN FR76 3000 ») : sinon le premier bloc
    # partait seul et les suivants en clair. Chaque bloc s'arrête sur un
    # non-alphanumérique (`(?![A-Z0-9])`) : une seule façon de découper, donc
    # aucun retour arrière exponentiel sur une longue suite de capitales.
    r"|\b(?i:IBAN|BIC|SWIFT|RIB)\s*[:=]?(?:\s*[A-Z0-9]{1,11}(?![A-Z0-9]))*"
    # INTÉGRATION DU LOT (13/09/2026) — un IBAN IMPRIMÉ sans étiquette, dont les
    # groupes arrivent l'un après l'autre (« FR76 3000 ») : chaque groupe est un
    # mot, et le premier partait avant que les suivants ne le complètent.
    r"|\b[A-Z]{2}\d{2}(?: [A-Z0-9]{1,4}(?![A-Z0-9]))*)"
    r"\s*\Z"
)

# SUIVI D'INCIDENT — `_URL_CREDENTIALS` n'a PAS besoin d'entrer dans
# `_INCOMPLETE_OPENER` : `scheme://user:motdepasse@hôte` ne contient AUCUN
# espace (contrairement à « Authorization: Bearer » ou « KEY: valeur », deux
# MOTS distincts). Le mécanisme générique de `_TRAILING_WORD` retient déjà le
# jeton ENTIER tant qu'aucun espace ne le referme — coupé en plein milieu
# (`test_a_database_url_with_credentials_split_across_two_fragments_is_still_
# caught`), il n'a jamais l'occasion d'être jugé « réglé » avant d'être
# complet. Une amorce dédiée serait redondante, et resterait accrochée sur
# TOUT texte se terminant par un `scheme://` anodin.


class StreamingRedactor:
    """Masque les secrets d'une réponse diffusée fragment par fragment.

    Idempotent au même titre que `redact_secrets` : `flush()` vidange tout ce
    qui reste, donc appeler `feed`/`flush` sur la concaténation des fragments
    donne le même résultat, réglé, que `redact_secrets` sur le texte entier —
    seul le RYTHME d'émission diffère (par mot réglé, pas par fragment brut).
    """

    def __init__(self) -> None:
        self._pending = ""

    def feed(self, fragment: str) -> str:
        """Ajoute `fragment` et renvoie la part nouvellement sûre à émettre,
        déjà masquée — "" tant qu'aucun mot ne s'est refermé."""
        if not fragment:
            return ""
        self._pending += fragment
        boundary = _TRAILING_WORD.search(self._pending).start()
        settled = self._pending[:boundary]
        opener = _INCOMPLETE_OPENER.search(settled)
        if opener:
            boundary = opener.start()
            settled = self._pending[:boundary]
        if not settled:
            return ""
        self._pending = self._pending[boundary:]
        return redact_secrets(settled)

    def flush(self) -> str:
        """À appeler une fois qu'on SAIT qu'aucun fragment ne suivra (fin du
        tour, ou du round modèle) : ce qui restait « en cours » ne peut plus
        s'allonger, donc peut être masqué et rendu sans attendre un délimiteur
        qui n'arrivera jamais."""
        remainder, self._pending = self._pending, ""
        return redact_secrets(remainder) if remainder else ""
