import gzip
import urllib.error
import urllib.request

SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl"
STANDINGS = "https://site.api.espn.com/apis/v2/sports/football/nfl/standings"
GAMBIT = "https://gambit-api.fantasy.espn.com/apis/v1/challenges"

# ESPN has 403'd blank and default urllib agents; a plain browser-ish UA is
# what reeses settled on.
HEADERS = {"User-Agent": "Mozilla/5.0 (pickem.xomware.com)", "Accept-Encoding": "gzip"}


def get(url: str, timeout: int = 15) -> tuple[int, bytes]:
    """Return (status, body). HTTP errors come back as a status, not an exception."""
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            if resp.headers.get("Content-Encoding") == "gzip":
                body = gzip.decompress(body)
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read()
