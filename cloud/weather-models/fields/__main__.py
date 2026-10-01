"""Local build: python -m fields <output-dir>  (reads the real public datasets, writes files)."""

import json
import sys

from fields.builder import FieldBuilder
from fields.store import LocalStore
from metrics import log
from providers import PROVIDER_CLASSES

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'dev-fields'
    providers = {m: cls(chunk_cache_bytes=0) for m, cls in PROVIDER_CLASSES.items()}
    summary = FieldBuilder(providers, LocalStore(out), log=lambda sev, msg, **f: log(sev, msg, **f)).run()
    print(json.dumps(summary, indent=2))
