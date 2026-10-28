# AURA — The AI Atelier 👑

Your smart closet + AI personal stylist. Upload your wardrobe, tell AURA where you're going, and it composes a full look from your own pieces — tailored to your body shape, height, coloring, vibe, mood, and the weather — plus a wishlist of pieces worth acquiring, with shopping links.

**100% free stack**: FastAPI + Google Gemini free tier (vision + styling brain) + React/Vite + localStorage + Open-Meteo weather (no key needed). No credit card anywhere.

---

## 1. Get your free AI key (2 minutes)

1. Go to https://aistudio.google.com/apikey
2. Sign in with a Google account → **Create API key**
3. That's it. The free tier is generous enough for personal use and demos.

## 2. Run the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env             # then open .env and paste your Gemini key
uvicorn main:app --reload --port 8000
```

Check it's alive: open http://localhost:8000/health

## 3. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). Done — the atelier is open.

---

## How it works

- **Add a piece** → your photo is compressed in the browser, sent to `/analyze-garment`, and Gemini's vision identifies, names, and categorizes it (type, color, style, season, formality). You confirm, it's saved.
- **Style Me** → your profile + closet catalogue + occasion/mood/weather go to `/compose-look`; Gemini returns a structured outfit referencing your actual items, styling notes, "why it works on *you*", and wishlist pieces with shopping links.
- **Weather "Auto" button** → Open-Meteo geocodes your city and fills in live conditions, free, keyless.
- **Storage** → profile + closet live in your browser's localStorage for now (private, free, survives restarts on the same browser).

## Deploy for free (when you're ready to show it off)

- **Backend → Render.com** (free web service): connect your GitHub repo, root dir `backend`, build `pip install -r requirements.txt`, start `uvicorn main:app --host 0.0.0.0 --port $PORT`. Add `GEMINI_API_KEY` as an environment variable in the dashboard — never commit `.env`.
- **Frontend → Vercel** (free): import the repo, root dir `frontend`, framework Vite. Set env var `VITE_API_URL` to your Render backend URL.
- In `backend/main.py`, tighten CORS `allow_origins` to your Vercel URL.
- Note: Render's free tier sleeps after inactivity; first request takes ~30s to wake. Fine for a portfolio demo.

## Free upgrade path (in order)

1. **Supabase (free tier)** — real accounts + Postgres + image storage, so users keep closets across devices. Replace the `load/save` helpers with Supabase client calls.
2. **Rate-limit handling** — Gemini free tier has per-minute limits; add a simple retry/queue in `call_gemini` if you get 429s.
3. **Affiliate shopping** — swap the Google Shopping links for ShopStyle Collective / Amazon Associates links (free to join; they pay *you* per purchase). Your first revenue line.
4. **Virtual try-on** — free-tier experiments via Hugging Face Spaces running IDM-VTON / OOTDiffusion; later a hosted GPU when there's revenue.
5. **Taste model** — log every look users 👍/👎; that dataset is your moat. Fine-tune a ranker when you have volume.

## Project structure

```
aura/
├── backend/
│   ├── main.py             # FastAPI: /analyze-garment, /compose-look, /health
│   ├── requirements.txt
│   └── .env.example        # GEMINI_API_KEY goes in .env (never commit .env)
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── main.jsx
        └── App.jsx         # the whole atelier UI
```

*Dress like it's your empire — because it is.*
