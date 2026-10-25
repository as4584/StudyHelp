import os
import sys

# Windows Application Control on the dev workstation blocks SQLAlchemy's unsigned Cython
# extensions; use the pure-Python fallback there. Linux/Docker keep the compiled path.
if sys.platform == "win32":
    os.environ.setdefault("DISABLE_SQLALCHEMY_CEXT_RUNTIME", "1")
