import { useState, useEffect, useRef } from "react";

/* ─────────────────────────────────────────────────────────
   AURA — The AI Atelier · Frontend (local / free-cloud edition)
   Talks to the FastAPI backend (Gemini free tier).
   Data lives in localStorage for now; swap for Supabase later.
   ───────────────────────────────────────────────────────── */

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const C = {
  porcelain: "#FAF7F1", noir: "#141114", oxblood: "#6E1F2C",
  gold: "#A98A45", stone: "#8C8478", line: "#E3DCD0", card: "#FFFFFF",
};

const FONT_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap');
body { margin: 0; }
.aura-display { font-family: 'Cormorant Garamond', Georgia, serif; }
.aura-body { font-family: 'Jost', 'Helvetica Neue', sans-serif; }
.aura-fade { animation: auraFade .5s ease both; }
@keyframes auraFade { from { opacity: 0; transform: translateY(6px);} to { opacity:1; transform:none; } }
@media (prefers-reduced-motion: reduce) { .aura-fade { animation: none; } }
.aura-shimmer { background: linear-gradient(100deg, #efe9df 40%, #f9f5ee 50%, #efe9df 60%); background-size: 200% 100%; animation: shim 1.4s linear infinite; }
@keyframes shim { to { background-position: -200% 0; } }
`;

const CATEGORIES = ["Dresses", "Tops", "Bottoms", "Skirts", "Outerwear", "Shoes", "Bags", "Accessories"];

/* ───────────── localStorage helpers ───────────── */
const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};
const save = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.error("storage full?", e); alert("Storage is full — remove a few items or use smaller photos."); }
};

/* ───────────── backend helpers ───────────── */
async function api(path, body) {
  const res = await fetch(API + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = "Request failed";
    try { msg = (await res.json()).detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

/* ───────────── free weather (Open-Meteo, no key) ───────────── */
async function fetchWeather(city) {
  const geo = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`
  ).then((r) => r.json());
  const spot = geo.results && geo.results[0];
  if (!spot) throw new Error("City not found");
  const w = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${spot.latitude}&longitude=${spot.longitude}&current=temperature_2m,precipitation,wind_speed_10m`
  ).then((r) => r.json());
  const cur = w.current;
  const rain = cur.precipitation > 0 ? ", some rain" : "";
  return `${Math.round(cur.temperature_2m)}°C${rain}, wind ${Math.round(cur.wind_speed_10m)} km/h`;
}

/* ───────────── image compression ───────────── */
function fileToThumb(file, max = 300, quality = 0.68) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ───────────── UI atoms ───────────── */
const Eyebrow = ({ children }) => (
  <div className="aura-body" style={{ fontSize: 11, letterSpacing: "0.28em", textTransform: "uppercase", color: C.gold, fontWeight: 500 }}>{children}</div>
);

const Btn = ({ children, onClick, variant = "primary", disabled, style }) => (
  <button
    onClick={disabled ? undefined : onClick}
    style={{
      fontFamily: "'Jost', sans-serif", fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase",
      padding: "13px 26px", cursor: disabled ? "default" : "pointer",
      border: `1px solid ${C.noir}`, transition: "all .18s ease", opacity: disabled ? 0.45 : 1,
      background: variant === "primary" ? C.noir : "transparent",
      color: variant === "primary" ? C.porcelain : C.noir, ...style,
    }}
    onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = C.oxblood; e.currentTarget.style.borderColor = C.oxblood; e.currentTarget.style.color = C.porcelain; } }}
    onMouseLeave={(e) => { e.currentTarget.style.background = variant === "primary" ? C.noir : "transparent"; e.currentTarget.style.borderColor = C.noir; e.currentTarget.style.color = variant === "primary" ? C.porcelain : C.noir; }}
  >
    {children}
  </button>
);

const Field = ({ label, children }) => (
  <label className="aura-body" style={{ display: "block", marginBottom: 18 }}>
    <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: C.stone, marginBottom: 7 }}>{label}</div>
    {children}
  </label>
);

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "transparent",
  border: "none", borderBottom: `1px solid ${C.line}`, padding: "8px 2px",
  fontFamily: "'Jost', sans-serif", fontSize: 15, color: C.noir, outline: "none",
};

/* ═════════════════════ APP ═════════════════════ */
export default function App() {
  const [profile, setProfile] = useState(() => load("aura:profile", null));
  const [items, setItems] = useState(() => load("aura:items", []));
  const [tab, setTab] = useState(profile ? "closet" : "welcome");

  const persistItems = (next) => { setItems(next); save("aura:items", next); };
  const persistProfile = (p) => { setProfile(p); save("aura:profile", p); };

  return (
    <div className="aura-body" style={{ minHeight: "100vh", background: C.porcelain, color: C.noir }}>
      <style>{FONT_CSS}</style>

      <header style={{ borderBottom: `1px solid ${C.line}`, padding: "26px 20px 20px", textAlign: "center" }}>
        <div className="aura-display" style={{ fontSize: 44, fontWeight: 500, letterSpacing: "0.32em", marginLeft: "0.32em" }}>AURA</div>
        <div style={{ fontSize: 10.5, letterSpacing: "0.34em", textTransform: "uppercase", color: C.gold, marginTop: 2 }}>The AI Atelier · Est. MMXXVI</div>
        {profile && (
          <nav style={{ display: "flex", justifyContent: "center", gap: 34, marginTop: 22, flexWrap: "wrap" }}>
            {[["closet", "The Closet"], ["style", "Style Me"], ["profile", "My Silhouette"]].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Jost', sans-serif", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase",
                color: tab === k ? C.oxblood : C.stone, paddingBottom: 5,
                borderBottom: tab === k ? `1px solid ${C.oxblood}` : "1px solid transparent",
              }}>{label}</button>
            ))}
          </nav>
        )}
      </header>

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "34px 20px 90px" }}>
        {tab === "welcome" && <Welcome onDone={(p) => { persistProfile(p); setTab("closet"); }} />}
        {tab === "profile" && profile && <ProfileEditor profile={profile} onSave={persistProfile} />}
        {tab === "closet" && profile && <Closet items={items} onChange={persistItems} goStyle={() => setTab("style")} />}
        {tab === "style" && profile && <StyleMe profile={profile} items={items} />}
      </main>

      <footer style={{ borderTop: `1px solid ${C.line}`, padding: "18px 20px", textAlign: "center", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: C.stone }}>
        Dress like it's your empire — because it is.
      </footer>
    </div>
  );
}

/* ═════════════ ONBOARDING / PROFILE ═════════════ */
const EMPTY_PROFILE = { name: "", age: "", height: "", size: "", bodyShape: "", skinTone: "", hairColor: "", vibe: "", city: "" };

function ProfileFields({ p, set }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 26px" }}>
      <Field label="Name"><input style={inputStyle} value={p.name} onChange={set("name")} placeholder="Blair" /></Field>
      <Field label="Age"><input style={inputStyle} value={p.age} onChange={set("age")} placeholder="24" /></Field>
      <Field label="Height"><input style={inputStyle} value={p.height} onChange={set("height")} placeholder="168 cm" /></Field>
      <Field label="Size"><input style={inputStyle} value={p.size} onChange={set("size")} placeholder="S / 36 / US 4" /></Field>
      <Field label="Body shape">
        <select style={{ ...inputStyle, appearance: "none" }} value={p.bodyShape} onChange={set("bodyShape")}>
          <option value="">Choose…</option>
          {["Hourglass", "Pear", "Apple", "Rectangle", "Inverted triangle", "Petite", "Tall & lean"].map((o) => <option key={o}>{o}</option>)}
        </select>
      </Field>
      <Field label="Skin tone"><input style={inputStyle} value={p.skinTone} onChange={set("skinTone")} placeholder="Warm olive, deep, fair…" /></Field>
      <Field label="Hair"><input style={inputStyle} value={p.hairColor} onChange={set("hairColor")} placeholder="Dark chestnut" /></Field>
      <Field label="City (for weather & stores)"><input style={inputStyle} value={p.city} onChange={set("city")} placeholder="Tunis" /></Field>
      <div style={{ gridColumn: "1 / -1" }}>
        <Field label="Your vibe / aura">
          <input style={inputStyle} value={p.vibe} onChange={set("vibe")} placeholder="Blair Waldorf meets Fallon Carrington — polished, powerful, a little dangerous" />
        </Field>
      </div>
    </div>
  );
}

function Welcome({ onDone }) {
  const [p, setP] = useState(EMPTY_PROFILE);
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value });
  const canGo = p.name && p.height && p.size;
  return (
    <div className="aura-fade" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 36 }}>
        <Eyebrow>First fitting</Eyebrow>
        <h1 className="aura-display" style={{ fontSize: 40, fontWeight: 500, margin: "10px 0 8px", lineHeight: 1.1 }}>
          Every great wardrobe begins<br /><em>with a silhouette.</em>
        </h1>
        <p style={{ color: C.stone, fontSize: 15, fontWeight: 300 }}>
          Tell AURA how you're built and how you want to feel. Your stylist tailors every look to this.
        </p>
      </div>
      <ProfileFields p={p} set={set} />
      <div style={{ textAlign: "center", marginTop: 10 }}>
        <Btn onClick={() => onDone(p)} disabled={!canGo}>Enter the atelier</Btn>
        {!canGo && <div style={{ fontSize: 12, color: C.stone, marginTop: 10 }}>Name, height and size are needed to fit your looks.</div>}
      </div>
    </div>
  );
}

function ProfileEditor({ profile, onSave }) {
  const [p, setP] = useState(profile);
  const [saved, setSaved] = useState(false);
  const set = (k) => (e) => { setSaved(false); setP({ ...p, [k]: e.target.value }); };
  return (
    <div className="aura-fade" style={{ maxWidth: 560, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <Eyebrow>My silhouette</Eyebrow>
        <h2 className="aura-display" style={{ fontSize: 34, fontWeight: 500, margin: "8px 0" }}>The measurements of a legend</h2>
      </div>
      <ProfileFields p={p} set={set} />
      <div style={{ textAlign: "center" }}>
        <Btn onClick={() => { onSave(p); setSaved(true); }}>Save changes</Btn>
        {saved && <div style={{ marginTop: 10, fontSize: 13, color: C.oxblood }}>Saved. The atelier remembers.</div>}
      </div>
    </div>
  );
}

/* ═════════════ CLOSET ═════════════ */
function Closet({ items, onChange, goStyle }) {
  const [adding, setAdding] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    setAnalyzing(true);
    try {
      const thumb = await fileToThumb(file);
      const meta = await api("/analyze-garment", { image_base64: thumb.split(",")[1] });
      setDraft({ id: "it_" + Date.now(), img: thumb, ...meta });
    } catch (e) {
      console.error(e);
      setError(e.message || "The stylist couldn't read that photo. Try a clearer shot of a single item.");
    } finally {
      setAnalyzing(false);
    }
  };

  const shown = filter === "All" ? items : items.filter((i) => i.category === filter);

  return (
    <div className="aura-fade">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 16, marginBottom: 26 }}>
        <div>
          <Eyebrow>The closet</Eyebrow>
          <h2 className="aura-display" style={{ fontSize: 36, fontWeight: 500, margin: "6px 0 0" }}>
            {items.length === 0 ? "An empty stage awaits" : `${items.length} pieces, curated`}
          </h2>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {items.length > 1 && <Btn variant="ghost" onClick={goStyle}>Style me</Btn>}
          <Btn onClick={() => { setAdding(true); setDraft(null); setError(""); }}>+ Add a piece</Btn>
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", borderBottom: `1px solid ${C.line}`, paddingBottom: 12, marginBottom: 26 }}>
          {["All", ...CATEGORIES].map((c) => (
            <button key={c} onClick={() => setFilter(c)} style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost', sans-serif",
              fontSize: 11.5, letterSpacing: "0.18em", textTransform: "uppercase",
              color: filter === c ? C.oxblood : C.stone,
            }}>{c}</button>
          ))}
        </div>
      )}

      {adding && (
        <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: 26, marginBottom: 30 }}>
          {!draft && !analyzing && (
            <div style={{ textAlign: "center", padding: "26px 0" }}>
              <div className="aura-display" style={{ fontSize: 24, fontStyle: "italic", marginBottom: 6 }}>Photograph the piece</div>
              <p style={{ color: C.stone, fontSize: 14, fontWeight: 300, marginBottom: 18 }}>
                Lay it flat or hang it against a plain background. AURA will identify and catalogue it.
              </p>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={(e) => handleFile(e.target.files && e.target.files[0])} />
              <Btn onClick={() => fileRef.current && fileRef.current.click()}>Upload photo</Btn>
              <div style={{ marginTop: 14 }}>
                <button onClick={() => setAdding(false)} style={{ background: "none", border: "none", color: C.stone, fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Jost', sans-serif" }}>Cancel</button>
              </div>
              {error && <div style={{ marginTop: 14, color: C.oxblood, fontSize: 13 }}>{error}</div>}
            </div>
          )}
          {analyzing && (
            <div style={{ textAlign: "center", padding: "34px 0" }}>
              <div className="aura-display" style={{ fontSize: 22, fontStyle: "italic", color: C.oxblood }}>The archivist is examining the piece…</div>
              <div className="aura-shimmer" style={{ height: 3, width: 220, margin: "18px auto 0" }} />
            </div>
          )}
          {draft && (
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", alignItems: "flex-start" }}>
              <img src={draft.img} alt={draft.name} style={{ width: 150, height: 190, objectFit: "cover", border: `1px solid ${C.line}` }} />
              <div style={{ flex: 1, minWidth: 240 }}>
                <Field label="Name"><input style={inputStyle} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
                <Field label="Category">
                  <select style={{ ...inputStyle, appearance: "none" }} value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <div style={{ fontSize: 13, color: C.stone, marginBottom: 16 }}>
                  {draft.color} · {draft.style} · {draft.formality}
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <Btn onClick={() => { onChange([draft, ...items]); setDraft(null); setAdding(false); }}>Add to closet</Btn>
                  <Btn variant="ghost" onClick={() => setDraft(null)}>Retake</Btn>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {items.length === 0 && !adding ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: C.stone }}>
          <div className="aura-display" style={{ fontSize: 26, fontStyle: "italic", marginBottom: 8 }}>"A closet is autobiography."</div>
          <p style={{ fontSize: 14, fontWeight: 300 }}>Add your first pieces and AURA starts learning your wardrobe.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 20 }}>
          {shown.map((it) => (
            <div key={it.id} style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <img src={it.img} alt={it.name} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }} />
              <div style={{ padding: "10px 12px 12px" }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3 }}>{it.name}</div>
                <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.gold, marginTop: 3 }}>{it.category}</div>
                <button onClick={() => onChange(items.filter((i) => i.id !== it.id))} style={{ marginTop: 8, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "'Jost', sans-serif", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.stone }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═════════════ THE MANNEQUIN (paper-doll view) ═════════════ */

const SKIN_MAP = [
  [/deep|dark|ebony|espresso/i, "#6B4630"],
  [/tan|bronze|caramel|golden brown/i, "#B98555"],
  [/olive|medium|beige|wheat/i, "#D2A679"],
  [/light|porcelain|ivory/i, "#EDC9AA"],
  [/fair|pale/i, "#F3D9C4"],
];
const HAIR_MAP = [
  [/black|jet|raven/i, "#1E1B1C"],
  [/chestnut|brunette|brown|coffee/i, "#4A2F23"],
  [/blonde|blond|honey|platinum/i, "#C9A15C"],
  [/red|auburn|ginger|copper/i, "#8C3A21"],
  [/grey|gray|silver|white/i, "#9A9490"],
];
const pick = (map, text, fallback) => {
  const s = (text || "").toString();
  for (const [re, hex] of map) if (re.test(s)) return hex;
  return fallback;
};

/* map a garment to a body zone; infer from name when it's a wishlist piece */
function zoneFor(category, name) {
  const c = (category || "").toLowerCase();
  const n = (name || "").toLowerCase();
  if (c.includes("dress") || /\bdress|gown|jumpsuit\b/.test(n)) return "dress";
  if (c.includes("top") || /shirt|blouse|tee|top|knit|sweater|bodysuit|cami/.test(n)) return "top";
  if (c.includes("skirt") || /skirt/.test(n)) return "skirt";
  if (c.includes("bottom") || /trouser|pant|jean|short|legging/.test(n)) return "bottom";
  if (c.includes("outerwear") || /coat|blazer|jacket|trench|cardigan/.test(n)) return "outer";
  if (c.includes("shoe") || /shoe|heel|boot|sneaker|loafer|sandal|pump|flat/.test(n)) return "shoes";
  if (c.includes("bag") || /bag|clutch|purse|tote/.test(n)) return "bag";
  return "accessory";
}

const ZONES = {
  dress:  { x: 100, y: 98,  w: 100, h: 262 },
  top:    { x: 100, y: 98,  w: 100, h: 128 },
  bottom: { x: 108, y: 214, w: 84,  h: 196 },
  skirt:  { x: 104, y: 214, w: 92,  h: 118 },
  outer:  { x: 86,  y: 96,  w: 32,  h: 176 },   // left panel; right mirrored
  shoes:  { x: 116, y: 548, w: 30,  h: 44 },    // left shoe; right offset +36
  bag:    { x: 218, y: 292, w: 50,  h: 62 },
  accessory: { x: 131, y: 78, w: 38, h: 26 },
};

function Mannequin({ pieces, itemById, profile }) {
  const skin = pick(SKIN_MAP, profile.skinTone, "#DFC0A0");
  const hair = pick(HAIR_MAP, profile.hairColor, "#33261F");

  // bucket pieces by zone (first piece wins each zone)
  const slots = {};
  (pieces || []).forEach((p) => {
    const it = p.item_id ? itemById(p.item_id) : null;
    const z = zoneFor(it && it.category, p.name);
    if (!slots[z]) slots[z] = { ...p, img: it ? it.img : null };
  });

  // a dress overrides separates
  if (slots.dress) { delete slots.top; delete slots.bottom; delete slots.skirt; }

  const Garment = ({ slot, zone, id, dx = 0, flip = false }) => {
    const g = slots[slot];
    if (!g) return null;
    const z = ZONES[zone];
    const x = z.x + dx;
    if (g.img) {
      return (
        <g>
          <clipPath id={`clip-${id}`}>
            <rect x={x} y={z.y} width={z.w} height={z.h} rx={9} />
          </clipPath>
          <image href={g.img} x={x} y={z.y} width={z.w} height={z.h}
            preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${id})`}
            transform={flip ? `translate(${2 * x + z.w}, 0) scale(-1, 1)` : undefined} />
          <rect x={x} y={z.y} width={z.w} height={z.h} rx={9} fill="none" stroke={C.line} strokeWidth="1" />
        </g>
      );
    }
    return (
      <g>
        <rect x={x} y={z.y} width={z.w} height={z.h} rx={9} fill="#FBF6EA" stroke={C.gold} strokeWidth="1" strokeDasharray="4 4" />
        <text x={x + z.w / 2} y={z.y + z.h / 2} textAnchor="middle" dominantBaseline="middle"
          fontFamily="'Cormorant Garamond', serif" fontStyle="italic" fontSize="13" fill={C.gold}>wishlist</text>
      </g>
    );
  };

  return (
    <svg viewBox="0 0 300 620" style={{ width: "100%", maxWidth: 300, display: "block", margin: "0 auto" }}
      role="img" aria-label="Your look shown on a figure">
      {/* ── the body ── */}
      <g>
        {/* hair behind */}
        <ellipse cx="150" cy="44" rx="27" ry="33" fill={hair} />
        {/* head + neck */}
        <ellipse cx="150" cy="48" rx="21" ry="27" fill={skin} />
        <path d="M129,30 q21,-20 42,0 q-6,-16 -21,-16 q-15,0 -21,16 z" fill={hair} />
        <rect x="142" y="70" width="16" height="26" fill={skin} />
        {/* torso */}
        <path d="M104,100 q46,-14 92,0 l-16,118 q-26,8 -60,0 z" fill={skin} />
        <path d="M120,214 q30,-9 60,0 l8,44 q-38,12 -76,0 z" fill={skin} />
        {/* arms */}
        <path d="M106,101 q-16,6 -19,26 l-9,108 q-1,10 8,11 q9,1 10,-9 l13,-104 z" fill={skin} />
        <path d="M194,101 q16,6 19,26 l9,108 q1,10 -8,11 q-9,1 -10,-9 l-13,-104 z" fill={skin} />
        {/* legs */}
        <path d="M118,256 l10,168 q2,72 4,128 l16,0 q2,-58 3,-128 l4,-166 z" fill={skin} />
        <path d="M182,256 l-10,168 q-2,72 -4,128 l-16,0 q-2,-58 -3,-128 l-4,-166 z" fill={skin} />
        {/* feet */}
        <path d="M132,552 l16,0 l1,32 l-19,0 z" fill={skin} />
        <path d="M152,552 l16,0 l2,32 l-19,0 z" fill={skin} />
      </g>

      {/* ── the clothes ── */}
      <Garment slot="dress" zone="dress" id="dress" />
      <Garment slot="bottom" zone="bottom" id="bottom" />
      <Garment slot="skirt" zone="skirt" id="skirt" />
      <Garment slot="top" zone="top" id="top" />
      <Garment slot="outer" zone="outer" id="outerL" />
      <Garment slot="outer" zone="outer" id="outerR" dx={96} flip />
      <Garment slot="shoes" zone="shoes" id="shoeL" />
      <Garment slot="shoes" zone="shoes" id="shoeR" dx={36} flip />
      <Garment slot="bag" zone="bag" id="bag" />
      <Garment slot="accessory" zone="accessory" id="acc" />
    </svg>
  );
}

/* ═════════════ STYLE ME ═════════════ */
function StyleMe({ profile, items }) {
  const [req, setReq] = useState({ occasion: "", mood: "", weather: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [look, setLook] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("figure");

  const closetSummary = items.map((i) => ({
    id: i.id, name: i.name, category: i.category, color: i.color, style: i.style, formality: i.formality,
  }));

  const autoWeather = async () => {
    if (!profile.city) { setError("Add your city in My Silhouette to auto-fill weather."); return; }
    setWeatherLoading(true); setError("");
    try { setReq({ ...req, weather: await fetchWeather(profile.city) }); }
    catch { setError("Couldn't fetch weather for that city — type it manually."); }
    finally { setWeatherLoading(false); }
  };

  const generate = async () => {
    setLoading(true); setError(""); setLook(null);
    try {
      const data = await api("/compose-look", { profile, closet: closetSummary, ...req });
      setLook(data);
    } catch (e) {
      console.error(e);
      setError(e.message || "The stylist stepped out for a moment. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const itemById = (id) => items.find((i) => i.id === id);
  const shopUrl = (q) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`;

  return (
    <div className="aura-fade" style={{ maxWidth: 720, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <Eyebrow>Style me</Eyebrow>
        <h2 className="aura-display" style={{ fontSize: 36, fontWeight: 500, margin: "8px 0 6px" }}>Tell me where you're going.</h2>
        <p style={{ color: C.stone, fontSize: 14.5, fontWeight: 300 }}>AURA composes a look from your closet — and whispers what's missing.</p>
      </div>

      <div style={{ background: C.card, border: `1px solid ${C.line}`, padding: 26, marginBottom: 30 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 26px" }}>
          <Field label="The occasion"><input style={inputStyle} value={req.occasion} onChange={(e) => setReq({ ...req, occasion: e.target.value })} placeholder="Gallery opening, first day at work…" /></Field>
          <Field label="Your mood"><input style={inputStyle} value={req.mood} onChange={(e) => setReq({ ...req, mood: e.target.value })} placeholder="Untouchable. Soft. Main character." /></Field>
          <Field label="Weather">
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input style={inputStyle} value={req.weather} onChange={(e) => setReq({ ...req, weather: e.target.value })} placeholder="28° and sunny / cold and rainy" />
              <button onClick={autoWeather} style={{ background: "none", border: `1px solid ${C.line}`, cursor: "pointer", fontFamily: "'Jost', sans-serif", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.stone, padding: "6px 10px", whiteSpace: "nowrap" }}>
                {weatherLoading ? "…" : "Auto"}
              </button>
            </div>
          </Field>
          <Field label="Anything else"><input style={inputStyle} value={req.notes} onChange={(e) => setReq({ ...req, notes: e.target.value })} placeholder="Ex will be there. Heels are negotiable." /></Field>
        </div>
        <div style={{ textAlign: "center", marginTop: 6 }}>
          <Btn onClick={generate} disabled={loading || !req.occasion}>{loading ? "Composing…" : "Compose my look"}</Btn>
          {items.length < 3 && <div style={{ fontSize: 12.5, color: C.stone, marginTop: 10 }}>Tip: AURA styles best with at least a few pieces in your closet.</div>}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: "20px 0 40px" }}>
          <div className="aura-display" style={{ fontSize: 22, fontStyle: "italic", color: C.oxblood }}>Pinning, draping, deciding…</div>
          <div className="aura-shimmer" style={{ height: 3, width: 240, margin: "16px auto 0" }} />
        </div>
      )}
      {error && <div style={{ textAlign: "center", color: C.oxblood, fontSize: 14, marginBottom: 30 }}>{error}</div>}

      {look && (
        <article className="aura-fade" style={{ background: C.card, border: `1px solid ${C.noir}`, padding: "34px 30px" }}>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.3em", textTransform: "uppercase", color: C.gold }}>Look Nº 1 · {new Date().toLocaleDateString()}</div>
            <h3 className="aura-display" style={{ fontSize: 32, fontWeight: 500, fontStyle: "italic", margin: "8px 0 0", color: C.oxblood }}>{look.look_title}</h3>
            <div style={{ width: 46, height: 1, background: C.gold, margin: "16px auto 0" }} />
          </div>

          {/* view toggle */}
          <div style={{ display: "flex", justifyContent: "center", gap: 22, marginBottom: 20 }}>
            {[["figure", "On the figure"], ["flat", "Flat lay"]].map(([k, label]) => (
              <button key={k} onClick={() => setView(k)} style={{
                background: "none", border: "none", cursor: "pointer", fontFamily: "'Jost', sans-serif",
                fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", paddingBottom: 4,
                color: view === k ? C.oxblood : C.stone,
                borderBottom: view === k ? `1px solid ${C.oxblood}` : "1px solid transparent",
              }}>{label}</button>
            ))}
          </div>

          {view === "figure" ? (
            <div style={{ marginBottom: 26 }}>
              <Mannequin pieces={look.pieces} itemById={itemById} profile={profile} />
              <div style={{ textAlign: "center", marginTop: 10, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: C.stone }}>
                {(look.pieces || []).map((p) => p.name).join(" · ")}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 26 }}>
              {(look.pieces || []).map((p, i) => {
                const it = p.item_id ? itemById(p.item_id) : null;
                return (
                  <div key={i} style={{ width: 128, textAlign: "center" }}>
                    {it ? (
                      <img src={it.img} alt={p.name} style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", border: `1px solid ${C.line}` }} />
                    ) : (
                      <div style={{ width: "100%", aspectRatio: "3/4", border: `1px dashed ${C.gold}`, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, boxSizing: "border-box" }}>
                        <span className="aura-display" style={{ fontStyle: "italic", fontSize: 14, color: C.gold }}>wishlist</span>
                      </div>
                    )}
                    <div style={{ fontSize: 12.5, fontWeight: 500, marginTop: 7, lineHeight: 1.3 }}>{p.name}</div>
                    <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: C.stone, marginTop: 2 }}>{p.role}</div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 20, display: "grid", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: C.gold, marginBottom: 5 }}>How to wear it</div>
              <p style={{ fontSize: 14.5, fontWeight: 300, lineHeight: 1.65, margin: 0 }}>{look.styling_notes}</p>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: C.gold, marginBottom: 5 }}>Why it works on you</div>
              <p style={{ fontSize: 14.5, fontWeight: 300, lineHeight: 1.65, margin: 0 }}>{look.why_it_works}</p>
            </div>
            {(look.wishlist_suggestions || []).length > 0 && (
              <div>
                <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: C.gold, marginBottom: 5 }}>The stylist suggests acquiring</div>
                {look.wishlist_suggestions.map((w, i) => (
                  <p key={i} style={{ fontSize: 14, fontWeight: 300, lineHeight: 1.6, margin: "0 0 6px" }}>
                    <span style={{ fontWeight: 500 }}>{w.piece}</span> — {w.why}{" "}
                    <a href={shopUrl(w.search_query || w.piece)} target="_blank" rel="noreferrer" style={{ color: C.oxblood, textDecoration: "underline", textUnderlineOffset: 3 }}>
                      Shop →
                    </a>
                  </p>
                ))}
              </div>
            )}
          </div>

          <div style={{ textAlign: "center", marginTop: 26 }}>
            <Btn variant="ghost" onClick={generate}>Another option</Btn>
          </div>
        </article>
      )}
    </div>
  );
}
