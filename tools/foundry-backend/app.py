import base64
import os
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from flask import Flask, jsonify, request
from PIL import Image

app = Flask(__name__)

TOKEN = os.getenv("FOUNDRY_BACKEND_TOKEN", "")
TRACE_SCRIPT_PATH = os.getenv("TRACE_SCRIPT_PATH", "/home/clawd_bot/clawd/pro_foundry_v8.py")
PYTHON_BIN = os.getenv("PYTHON_BIN", "python3")

ALLOWED_MIME = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}


def _unauthorized():
    return jsonify({"error": "Unauthorized"}), 401


def _check_auth():
    if not TOKEN:
        return False
    auth = request.headers.get("Authorization", "")
    return auth == f"Bearer {TOKEN}"


def _decode_image(b64: str) -> bytes:
    return base64.b64decode(b64, validate=True)


@app.get("/health")
def health():
    return jsonify({"ok": True, "traceScript": TRACE_SCRIPT_PATH})


@app.post("/upscale")
def upscale():
    if not _check_auth():
        return _unauthorized()

    body = request.get_json(force=True, silent=True) or {}
    image_b64 = (body.get("imageBase64") or "").strip()
    mime = (body.get("mimeType") or "image/png").lower().strip()
    scale = float(body.get("scale", 2))

    if not image_b64:
        return jsonify({"error": "imageBase64 is required"}), 400
    if mime not in ALLOWED_MIME:
        return jsonify({"error": "Unsupported mimeType"}), 400
    if scale < 1 or scale > 4:
        return jsonify({"error": "scale must be between 1 and 4"}), 400

    try:
        raw = _decode_image(image_b64)
        img = Image.open(BytesIO(raw)).convert("RGB")
        out = img.resize((int(img.width * scale), int(img.height * scale)), Image.Resampling.LANCZOS)
        buf = BytesIO()
        out.save(buf, format="PNG")
        out_b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        return jsonify({"bytesBase64Encoded": out_b64, "mimeType": "image/png"})
    except Exception as e:
        return jsonify({"error": f"Upscale failed: {e}"}), 500


@app.post("/trace")
def trace():
    if not _check_auth():
        return _unauthorized()

    body = request.get_json(force=True, silent=True) or {}
    image_b64 = (body.get("imageBase64") or "").strip()
    mime = (body.get("mimeType") or "image/png").lower().strip()

    if not image_b64:
        return jsonify({"error": "imageBase64 is required"}), 400
    if mime not in ALLOWED_MIME:
        return jsonify({"error": "Unsupported mimeType"}), 400

    trace_script = Path(TRACE_SCRIPT_PATH)
    if not trace_script.exists():
        return jsonify({"error": f"Trace script not found: {TRACE_SCRIPT_PATH}"}), 500

    ext = ALLOWED_MIME[mime]

    try:
        raw = _decode_image(image_b64)
    except Exception:
        return jsonify({"error": "Invalid base64 image data"}), 400

    with tempfile.TemporaryDirectory(prefix="foundry_trace_") as td:
        input_path = Path(td) / f"input.{ext}"
        output_path = Path(td) / "output.svg"
        input_path.write_bytes(raw)

        try:
            proc = subprocess.run(
                [PYTHON_BIN, str(trace_script), str(input_path), str(output_path)],
                capture_output=True,
                text=True,
                timeout=180,
                check=False,
            )
        except Exception as e:
            return jsonify({"error": f"Trace process launch failed: {e}"}), 500

        if proc.returncode != 0:
            return jsonify({
                "error": "Trace script failed",
                "stderr": (proc.stderr or "")[-3000:],
                "stdout": (proc.stdout or "")[-3000:],
            }), 500

        if not output_path.exists():
            return jsonify({"error": "Trace script produced no SVG output"}), 500

        svg = output_path.read_text(encoding="utf-8", errors="ignore")
        return jsonify({"svg": svg})


if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8787"))
    app.run(host=host, port=port)
