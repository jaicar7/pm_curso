from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Project Management MVP")
frontend_dir = Path(__file__).resolve().parents[2] / "frontend" / "out"


@app.get("/", response_class=HTMLResponse)
def root() -> str:
    if frontend_dir.exists():
        return (frontend_dir / "index.html").read_text(encoding="utf-8")

    return """
    <!doctype html>
    <html lang=\"en\">
      <head>
        <meta charset=\"utf-8\" />
        <title>Kanban Studio</title>
      </head>
      <body>
        <h1>Kanban Studio</h1>
      </body>
    </html>
    """


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "project-management-mvp"}


if frontend_dir.exists():
  app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
