"""Production WSGI entrypoint.

``app.py`` is shadowed by the ``app/`` package when imported as a module, so
``gunicorn app:app`` cannot work. Use ``gunicorn wsgi:app`` (see README).
"""

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run()
