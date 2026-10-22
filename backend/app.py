"""Development runner.

The ``app/`` package shadows this module for imports, so the application factory
lives in ``app/factory.py`` and is re-exported from ``app``. Production uses
``gunicorn wsgi:app``.
"""

import os

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port)
