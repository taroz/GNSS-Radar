#!/usr/bin/env python3
"""Generate js/prnmap.js (NORAD ID -> PRN label / block type) from the IGS
satellite metadata.

Source: https://files.igs.org/pub/station/general/igs_satellite_metadata.snx
The SINEX file maps SVN <-> NORAD ID + block type (+SATELLITE/IDENTIFIER) and
SVN <-> PRN with validity periods (+SATELLITE/PRN). Joining the two on SVN
gives NORAD -> current PRN for GPS(G) / GLONASS(R) / Galileo(E) / BeiDou(C) /
QZSS(J) / NavIC(I).
GLONASS PRN is the orbital slot number. QZSS Jnn is converted to Q(192+nn)
so labels match the PRN numbers broadcast by QZSS (Q193, Q194, ...).
The block type (e.g. GPS-IIF, GLO-M, BDS-3M-CAST) is emitted as BLOCKMAP and
drives the signal-option filters in the web app (GPS L2C/L5, GLO M/K, BDS II/III).

Run from anywhere (python .github/scripts/update_prn.py); output is written
into this repo's js/ directory. Intended to be run weekly by GitHub Actions
(see .github/workflows/update-prn.yml), but it has no dependencies beyond the
Python standard library, so it can also be run manually or from cron.
"""

import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SNX_URL = "https://files.igs.org/pub/station/general/igs_satellite_metadata.snx"
OUT_PATH = Path(__file__).resolve().parents[2] / "js" / "prnmap.js"

# constellations to include (SBAS is not in the IGS file; the web app
# falls back to parsing PRN from the TLE name for SBAS)
SYSTEMS = "GRECJI"


def fetch_snx(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "GNSS-Radar prn updater"})
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode("utf-8", errors="replace")


def parse_blocks(text: str) -> dict:
    """Return {block_name: [lines]} for all +BLOCK ... -BLOCK sections."""
    blocks = {}
    current = None
    for line in text.splitlines():
        if line.startswith("+"):
            current = line[1:].strip()
            blocks[current] = []
        elif line.startswith("-"):
            current = None
        elif current and not line.startswith("*"):
            blocks[current].append(line)
    return blocks


def main() -> int:
    text = fetch_snx(SNX_URL)
    blocks = parse_blocks(text)

    # SVN -> NORAD catalog number and block type
    svn2norad = {}
    svn2block = {}
    for line in blocks.get("SATELLITE/IDENTIFIER", []):
        # e.g. " G001 1978-020A  10684 GPS-I           Launched ..."
        m = re.match(r"\s*([GRECJI]\d{3})\s+(\S+)\s+(\d+)\s+(\S+)", line)
        if m:
            svn2norad[m.group(1)] = int(m.group(3))
            svn2block[m.group(1)] = m.group(4)

    # SVN -> current PRN (Valid_To == 0000:000:00000 means "still valid")
    svn2prn = {}
    for line in blocks.get("SATELLITE/PRN", []):
        # e.g. " R730 2010:062:00000 0000:000:00000 R01"
        m = re.match(
            r"\s*([GRECJI]\d{3})\s+(\d{4}:\d{3}:\d{5})\s+(\d{4}:\d{3}:\d{5})\s+([GRECJI]\d+)",
            line,
        )
        if m and m.group(3) == "0000:000:00000":
            svn2prn[m.group(1)] = m.group(4)

    prnmap = {}
    blockmap = {}
    for svn, prn in sorted(svn2prn.items()):
        sys_char, num = prn[0], int(prn[1:])
        if sys_char not in SYSTEMS:
            continue
        norad = svn2norad.get(svn)
        if norad is None:
            continue
        if sys_char == "J":  # QZSS: J01 -> Q193 (broadcast PRN)
            label = f"Q{192 + num}"
        else:
            label = f"{sys_char}{num}"
        prnmap[str(norad)] = label
        block = svn2block.get(svn)
        if block:
            blockmap[str(norad)] = block

    if len(prnmap) < 100:  # sanity check: G+R+E+C+J+I should be ~130+
        print(f"ERROR: only {len(prnmap)} entries parsed, refusing to overwrite", file=sys.stderr)
        return 1

    updated = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    js = (
        "// prnmap.js: NORAD catalog number -> PRN label (G5/R10/E23/C45/Q194/I5)\n"
        "// and block type (GPS-IIF/GLO-M/BDS-3M-CAST/...).\n"
        f"// Auto-generated from the IGS satellite metadata on {updated} by\n"
        "// .github/scripts/update_prn.py -- do not edit by hand.\n"
        f"// Source: {SNX_URL}\n"
        "const PRNMAP =\n" + json.dumps(prnmap, indent=1) + ";\n"
        "const BLOCKMAP =\n" + json.dumps(blockmap, indent=1) + ";\n"
    )
    OUT_PATH.write_text(js, encoding="utf-8")
    print(f"wrote {OUT_PATH} with {len(prnmap)} satellites")
    return 0


if __name__ == "__main__":
    sys.exit(main())
