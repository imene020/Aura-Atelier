"""
AURA — The AI Atelier · Backend
FastAPI + Google Gemini (free tier).

Run:
    pip install -r requirements.txt
    cp .env.example .env   (put your free Gemini key inside)
    uvicorn main:app --reload --port 8000
"""

import os
import json
import re
import urllib.request
import urllib.error

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent?key={GEMINI_KEY}"
)

CATEGORIES = ["Dresses", "Tops", "Bottoms", "Skirts", "Outerwear", "Shoes", "Bags", "Accessories"]

app = FastAPI(title="AURA API")

# While ALLOWED_ORIGINS is empty we allow everything (handy in local dev).
# Once deployed, set ALLOWED_ORIGINS to your frontend URL so only your site can call this API.
_origins_raw = os.getenv("ALLOWED_ORIGINS", "").strip()
ALLOWED_ORIGINS = [o.strip() for o in _origins_raw.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------- Gemini helpers ----------

def call_gemini(parts: list) -> str:
    """Send parts (text and/or inline images) to Gemini, return the text reply."""
    if not GEMINI_KEY:
        raise HTTPException(500, "GEMINI_API_KEY missing. Get a free key at https://aistudio.google.com/apikey and put it in backend/.env")

    payload = json.dumps({"contents": [{"parts": parts}]}).encode()
    req = urllib.request.Request(
        GEMINI_URL, data=payload, headers={"Content-Type": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            data = json.loads(res.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        raise HTTPException(502, f"Gemini error {e.code}: {detail}")
    except Exception as e:
        raise HTTPException(502, f"Could not reach Gemini: {e}")

    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError):
        raise HTTPException(502, "Gemini returned an unexpected response.")


def extract_json(text: str) -> dict:
    """Parse JSON even if the model wrapped it in ``` fences or prose."""
    clean = re.sub(r"```(json)?", "", text).strip()
    start, end = clean.find("{"), clean.rfind("}")
    if start == -1 or end == -1:
        raise HTTPException(502, "The stylist replied in an unexpected format. Try again.")
    return json.loads(clean[start : end + 1])


# ---------- request models ----------

class GarmentIn(BaseModel):
    image_base64: str          # jpeg base64, no data: prefix
    media_type: str = "image/jpeg"


class LookIn(BaseModel):
    profile: dict
    closet: list               # [{id, name, category, color, style, formality}]
    occasion: str
    mood: str = ""
    weather: str = ""
    notes: str = ""


# ---------- endpoints ----------

@app.get("/health")
def health():
    return {"ok": True, "model": GEMINI_MODEL, "key_loaded": bool(GEMINI_KEY), "origins": ALLOWED_ORIGINS}


@app.post("/analyze-garment")
def analyze_garment(g: GarmentIn):
    prompt = (
        "You are a fashion archivist. Identify the garment/item in this photo. "
        "Respond ONLY with raw JSON, no markdown, no preamble: "
        '{"name": "short chic name e.g. \'Ivory silk blouse\'", '
        f'"category": one of {json.dumps(CATEGORIES)}, '
        '"color": "main color(s)", '
        '"style": "2-4 style descriptors", '
        '"seasons": "e.g. spring/summer", '
        '"formality": "casual | smart casual | office | evening | black tie"}'
    )
    text = call_gemini([
        {"inline_data": {"mime_type": g.media_type, "data": g.image_base64}},
        {"text": prompt},
    ])
    meta = extract_json(text)
    if meta.get("category") not in CATEGORIES:
        meta["category"] = "Accessories"
    return meta


@app.post("/compose-look")
def compose_look(r: LookIn):
    prompt = f"""You are AURA, an elite personal stylist with the taste level of a Vogue editor.

CLIENT PROFILE: {json.dumps(r.profile)}
CLOSET (available pieces): {json.dumps(r.closet)}
REQUEST: occasion="{r.occasion}", mood="{r.mood}", weather="{r.weather}", extra notes="{r.notes}"

Compose ONE complete outfit. Prefer pieces from the closet (reference them by id).
If the closet lacks something essential, mark it as a wishlist piece instead.
Flatter the client's body shape, height, skin tone and vibe.

Respond ONLY with raw JSON, no markdown fences, no preamble:
{{
 "look_title": "an editorial name for the look, 3-6 words",
 "pieces": [{{"item_id": "id from closet or null", "name": "piece name", "role": "e.g. The anchor / The statement / The finish", "wishlist": false}}],
 "styling_notes": "2-3 sentences: how to wear it — tucks, cuffs, hair, the attitude",
 "why_it_works": "2-3 sentences on why this flatters THIS client specifically",
 "wishlist_suggestions": [{{"piece": "specific item to buy", "why": "one sentence", "search_query": "short shopping search phrase"}}]
}}"""
    return extract_json(call_gemini([{"text": prompt}]))
