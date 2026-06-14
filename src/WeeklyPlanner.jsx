import { useState, useEffect, useCallback } from "react";

// ── Gist sync ──────────────────────────────────────────────────────────────
const CONFIG_KEY = "wplanner_config";

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); } catch { return {}; }
}
function saveConfig(cfg) { localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg)); }

function collectAllWeeks() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("wplanner_") && k !== CONFIG_KEY) {
      try { out[k] = JSON.parse(localStorage.getItem(k)); } catch { /* skip */ }
    }
  }
  return out;
}
function applyAllWeeks(weeks) {
  Object.entries(weeks).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
}

async function gistPush(pat, gistId) {
  const body = JSON.stringify(collectAllWeeks(), null, 2);
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({ files: { "weekly-planner.json": { content: body } } }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
  return await res.json();
}
async function gistPull(pat, gistId) {
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    headers: { Authorization: `Bearer ${pat}` },
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
  const data = await res.json();
  const content = data.files?.["weekly-planner.json"]?.content;
  if (!content) throw new Error("File not found in Gist — push first from this device.");
  return JSON.parse(content);
}
async function gistCreate(pat) {
  const body = JSON.stringify(collectAllWeeks(), null, 2);
  const res = await fetch("https://api.github.com/gists", {
    method: "POST",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "Weekly Planner data store",
      public: false,
      files: { "weekly-planner.json": { content: body } },
    }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
  return await res.json();
}

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: "#0e0e0e",
  surface: "#161616",
  border: "#2a2a2a",
  text: "#c8b89a",
  textDim: "#4a4540",
  textBright: "#e0d4bc",
  fill: "#1e1c19",
  accent: "#c8b89a",
};

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const HABITS = ["Workout", "Reading", "Zone 2"];
const TRACKED_HABITS = ["Workout", "Reading"];
const DETAIL_PLACEHOLDER = { Workout: "min", Reading: "min" };
const TABS = ["Schedule", "Habits", "Review", "Sync"];

const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  padding: 12,
  marginBottom: 8,
};

const numInputStyle = {
  width: "100%",
  background: "transparent",
  border: `1px solid ${C.border}`,
  color: C.textBright,
  fontSize: 10,
  fontFamily: "'Space Mono', monospace",
  padding: "3px 2px",
  outline: "none",
  textAlign: "center",
  caretColor: C.accent,
};

function getWeekKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 + offset * 7);
  return d.toISOString().slice(0, 10);
}
function getWeekLabel(key) {
  const d = new Date(key);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(d)} – ${fmt(end)}`;
}
function getWeekNumber(key) {
  const d = new Date(key);
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7);
}

function emptyWeek() {
  return {
    schedule: Object.fromEntries(DAYS.map((d) => [d, ["", "", ""]])),
    priorities: ["", "", ""],
    habits: Object.fromEntries(HABITS.map((h) => [h, Array(7).fill(false)])),
    habitDetail: Object.fromEntries(HABITS.map((h) => [h, Array(7).fill("")])),
    zone2: Object.fromEntries(DAYS.map((d) => [d, { done: false, mins: "", hr: "" }])),
    sleep: Array(7).fill(""),
    steps: Array(7).fill(""),
    notes: "",
    nextWeek: "",
    weekRating: 0,
  };
}

// ── Shared components ──────────────────────────────────────────────────────
const Label = ({ children, style }) => (
  <span style={{
    fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase",
    color: C.text, fontFamily: "'Space Mono', monospace", ...style,
  }}>
    {children}
  </span>
);

const Line = ({ value, onChange, placeholder, style }) => (
  <input
    type="text"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder || ""}
    style={{
      width: "100%", background: "transparent", border: "none",
      borderBottom: `1px solid ${C.border}`, color: C.textBright,
      fontSize: 11, fontFamily: "'Space Mono', monospace",
      padding: "2px 0", outline: "none", caretColor: C.accent, ...style,
    }}
  />
);

const Box = ({ checked, onChange, size = 13 }) => (
  <div onClick={onChange} style={{
    width: size, height: size, border: `1px solid ${checked ? C.accent : C.border}`,
    background: checked ? C.accent : "transparent", cursor: "pointer",
    flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
  }}>
    {checked && (
      <svg width="8" height="6" viewBox="0 0 8 6">
        <polyline points="1,3 3,5 7,1" stroke={C.bg} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </svg>
    )}
  </div>
);

const BarChart = ({ values, max, days, color = C.textDim, accentColor, target }) => {
  const m = Math.max(...values.map(Number).filter(Boolean), max || 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56, paddingBottom: 16, position: "relative" }}>
      {target != null && (
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 16 + (Math.min(target, m) / m) * 40,
          borderTop: `1px dashed ${C.textDim}`, opacity: 0.5,
        }} />
      )}
      {values.map((v, i) => {
        const num = Number(v);
        const h = num ? (num / m) * 40 : 0;
        const meetsTarget = target != null && num >= target;
        const barColor = h > 0 ? (meetsTarget && accentColor ? accentColor : color) : "transparent";
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ height: 40, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{ width: "100%", height: h, background: barColor, border: h > 0 ? `1px solid ${C.border}` : "none", transition: "height 0.3s ease" }} />
            </div>
            <Label style={{ fontSize: 8, color: C.textDim }}>{days[i]}</Label>
          </div>
        );
      })}
    </div>
  );
};

// ── SCHEDULE TAB — compact 7-day grid ──────────────────────────────────────
function ScheduleTab({ w, set }) {
  return (
    <div>
      <div style={card}>
        <Label>Top 3 Priorities</Label>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: C.textDim, fontFamily: "'Space Mono', monospace", fontSize: 10 }}>{["①", "②", "③"][i]}</span>
              <Line value={w.priorities?.[i] || ""} onChange={(v) => set(`priorities.${i}`, v)} />
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <Label>Schedule</Label>
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {DAYS.map((day) => (
            <div key={day} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 34, flexShrink: 0 }}>
                <Label style={{ color: C.textBright, fontSize: 9 }}>{day}</Label>
              </div>
              <div style={{ flex: 1, display: "flex", gap: 6 }}>
                {[0, 1, 2].map((li) => (
                  <Line
                    key={li}
                    value={w.schedule?.[day]?.[li] || ""}
                    onChange={(v) => set(`schedule.${day}.${li}`, v)}
                    placeholder={li === 0 ? "am" : li === 1 ? "pm" : "eve"}
                    style={{ fontSize: 10 }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── HABITS TAB — checkboxes + sleep + steps + zone2 summary ─────────────────
function HabitsTab({ w, set }) {
  const sleepVals = DAYS.map((_, i) => w.sleep?.[i] || "");
  const stepsVals = DAYS.map((_, i) => w.steps?.[i] || "");
  const avgSleep = (() => {
    const v = sleepVals.map(Number).filter(Boolean);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : "—";
  })();
  const avgSteps = (() => {
    const v = stepsVals.map(Number).filter(Boolean);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
  })();

  // Zone 2 summary
  const z2mins = DAYS.map(d => w.zone2?.[d]?.mins || "");
  const z2hr = DAYS.map(d => w.zone2?.[d]?.hr || "");
  const z2total = z2mins.map(Number).reduce((a, b) => a + b, 0);
  const z2hrNums = z2hr.map(Number).filter(Boolean);
  const z2avgHR = z2hrNums.length ? Math.round(z2hrNums.reduce((a, b) => a + b, 0) / z2hrNums.length) : null;
  const z2max = Math.max(...z2mins.map(Number).filter(Boolean), 60);

  return (
    <div>
      {/* Habit checkboxes */}
      <div style={card}>
        <Label>Habits</Label>
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 4 }}>
          <div style={{ width: 64, flexShrink: 0 }} />
          {DAYS_SHORT.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}><Label style={{ fontSize: 8 }}>{d}</Label></div>
          ))}
        </div>
        {TRACKED_HABITS.map((habit) => (
          <div key={habit} style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 4 }}>
            <div style={{ width: 64, flexShrink: 0 }}><Label style={{ fontSize: 9 }}>{habit}</Label></div>
            {Array(7).fill(0).map((_, di) => (
              <div key={di} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                <Box checked={w.habits?.[habit]?.[di] || false} onChange={() => set(`habits.${habit}.${di}`, !(w.habits?.[habit]?.[di]))} />
              </div>
            ))}
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 4 }}>
          <div style={{ width: 64, flexShrink: 0 }}><Label style={{ fontSize: 8, color: C.textDim }}>Done</Label></div>
          {Array(7).fill(0).map((_, di) => {
            const count = TRACKED_HABITS.filter((h) => w.habits?.[h]?.[di]).length;
            return (
              <div key={di} style={{ flex: 1, textAlign: "center" }}>
                <Label style={{ fontSize: 9, color: count === TRACKED_HABITS.length ? C.accent : C.textDim }}>{count}/{TRACKED_HABITS.length}</Label>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sleep */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Label>Sleep (hrs)</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>avg {avgSleep} · target 7</Label>
        </div>
        <div style={{ marginTop: 8 }}>
          <BarChart values={sleepVals} max={10} days={DAYS_SHORT} color="#3a3530" accentColor={C.accent + "cc"} target={7} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {DAYS.map((day, i) => (
            <div key={day} style={{ flex: 1 }}>
              <input type="number" value={w.sleep?.[i] || ""} onChange={(e) => set(`sleep.${i}`, e.target.value)} min={0} max={12} step={0.5} style={numInputStyle} />
            </div>
          ))}
        </div>
      </div>

      {/* Steps */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Label>Steps</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>avg {avgSteps ? avgSteps.toLocaleString() : "—"} · target 10k</Label>
        </div>
        <div style={{ marginTop: 8 }}>
          <BarChart values={stepsVals} max={15000} days={DAYS_SHORT} color="#2a3028" accentColor="#5a8a5a" target={10000} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {DAYS.map((day, i) => (
            <div key={day} style={{ flex: 1 }}>
              <input type="number" value={w.steps?.[i] || ""} onChange={(e) => set(`steps.${i}`, e.target.value)} min={0} max={99999} step={100} style={numInputStyle} />
            </div>
          ))}
        </div>
      </div>

      {/* Zone 2 — checkbox + mins + hr inline, with summary chart */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Label>Zone 2 Cardio</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>{z2total}/150 min{z2avgHR ? ` · avg ${z2avgHR} bpm` : ""}</Label>
        </div>
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, paddingBottom: 16 }}>
            {DAYS.map((day, i) => {
              const mins = Number(z2mins[i]);
              const hr = Number(z2hr[i]);
              const barH = mins ? (mins / z2max) * 40 : 0;
              const meets = z2total >= 150;
              return (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ height: 12, display: "flex", alignItems: "center" }}>
                    {hr ? <span style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: "#8a5a5a" }}>{hr}</span> : null}
                  </div>
                  <div style={{ height: 40, display: "flex", alignItems: "flex-end", width: "100%" }}>
                    <div style={{ width: "100%", height: barH, background: barH > 0 ? (meets ? "#3a5a3a" : "#2a3a2a") : "transparent", border: barH > 0 ? `1px solid ${C.border}` : "none", transition: "height 0.3s ease" }} />
                  </div>
                  <Label style={{ fontSize: 8, color: C.textDim }}>{DAYS_SHORT[i]}</Label>
                </div>
              );
            })}
          </div>
        </div>
        {/* mins + hr input rows */}
        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
          {DAYS.map((day, i) => (
            <div key={day} style={{ flex: 1 }}>
              <input type="number" value={w.zone2?.[day]?.mins || ""} onChange={(e) => set(`zone2.${day}.mins`, e.target.value)} min={0} max={300} step={5} placeholder="min" style={numInputStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {DAYS.map((day, i) => (
            <div key={day} style={{ flex: 1 }}>
              <input type="number" value={w.zone2?.[day]?.hr || ""} onChange={(e) => set(`zone2.${day}.hr`, e.target.value)} min={60} max={200} step={1} placeholder="hr" style={{ ...numInputStyle, color: "#8a5a5a", fontSize: 9 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── REVIEW TAB ─────────────────────────────────────────────────────────────
function ReviewTab({ w, set }) {
  return (
    <div>
      <div style={card}>
        <Label>Week Rating</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} onClick={() => set("weekRating", n)} style={{
              flex: 1, height: 34,
              border: `1px solid ${w.weekRating >= n ? C.accent : C.border}`,
              background: w.weekRating >= n ? C.accent + "22" : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }}>
              <Label style={{ color: w.weekRating >= n ? C.accent : C.textDim, fontSize: 11 }}>{n}</Label>
            </div>
          ))}
        </div>
      </div>

      <div style={card}>
        <Label>Week Summary</Label>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {HABITS.map((habit) => {
            const done = (w.habits?.[habit] || []).filter(Boolean).length;
            return (
              <div key={habit} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Label style={{ fontSize: 9 }}>{habit}</Label>
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  {Array(7).fill(0).map((_, i) => (
                    <div key={i} style={{ width: 8, height: 8, background: w.habits?.[habit]?.[i] ? C.accent : C.border }} />
                  ))}
                  <Label style={{ fontSize: 9, marginLeft: 6 }}>{done}/7</Label>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <Label style={{ fontSize: 9 }}>Avg Sleep</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {(() => { const v = (w.sleep || []).map(Number).filter(Boolean); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) + " hrs" : "—"; })()}
            </Label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Label style={{ fontSize: 9 }}>Avg Steps</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {(() => { const v = (w.steps || []).map(Number).filter(Boolean); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length).toLocaleString() : "—"; })()}
            </Label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Label style={{ fontSize: 9 }}>Zone 2 Total</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {DAYS.map(d => Number(w.zone2?.[d]?.mins || 0)).reduce((a, b) => a + b, 0)} min
            </Label>
          </div>
        </div>
      </div>

      <div style={card}>
        <Label>Notes</Label>
        <textarea value={w.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={4} style={{
          width: "100%", background: "transparent", border: `1px solid ${C.border}`,
          color: C.textBright, fontSize: 11, fontFamily: "'Space Mono', monospace",
          padding: 8, outline: "none", resize: "none", marginTop: 8,
          boxSizing: "border-box", caretColor: C.accent,
        }} />
      </div>

      <div style={card}>
        <Label>Add to Next Week</Label>
        <textarea value={w.nextWeek || ""} onChange={(e) => set("nextWeek", e.target.value)} rows={3} style={{
          width: "100%", background: "transparent", border: `1px solid ${C.border}`,
          color: C.textBright, fontSize: 11, fontFamily: "'Space Mono', monospace",
          padding: 8, outline: "none", resize: "none", marginTop: 8,
          boxSizing: "border-box", caretColor: C.accent,
        }} />
      </div>
    </div>
  );
}

// ── SYNC TAB ───────────────────────────────────────────────────────────────
function SyncTab({ weekKey, setData, syncStatus, setSyncStatus }) {
  const [cfg, setCfgState] = useState(loadConfig);
  const [pat, setPat] = useState(cfg.pat || "");
  const [gistId, setGistId] = useState(cfg.gistId || "");

  const persistConfig = (updates) => {
    const next = { ...cfg, ...updates };
    setCfgState(next);
    saveConfig(next);
  };

  const lastSync = cfg.lastSync ? new Date(cfg.lastSync).toLocaleString() : null;

  const handlePush = useCallback(async () => {
    if (!pat) { setSyncStatus({ error: "Enter a GitHub PAT first." }); return; }
    setSyncStatus("pushing");
    try {
      let id = gistId;
      if (!id) {
        const created = await gistCreate(pat);
        id = created.id;
        setGistId(id);
        persistConfig({ pat, gistId: id, lastSync: new Date().toISOString() });
      } else {
        await gistPush(pat, id);
        persistConfig({ pat, gistId: id, lastSync: new Date().toISOString() });
      }
      setSyncStatus("ok");
    } catch (e) { setSyncStatus({ error: e.message }); }
  }, [pat, gistId]);

  const handlePull = useCallback(async () => {
    if (!pat || !gistId) { setSyncStatus({ error: "PAT and Gist ID required to pull." }); return; }
    setSyncStatus("pulling");
    try {
      const weeks = await gistPull(pat, gistId);
      applyAllWeeks(weeks);
      persistConfig({ pat, gistId, lastSync: new Date().toISOString() });
      const raw = localStorage.getItem("wplanner_" + weekKey);
      if (raw) setData(JSON.parse(raw));
      setSyncStatus("ok");
    } catch (e) { setSyncStatus({ error: e.message }); }
  }, [pat, gistId, weekKey]);

  const statusColor = syncStatus === "ok" ? "#5a8a5a" : syncStatus?.error ? "#8a3a3a" : C.textDim;
  const statusText = syncStatus === "pushing" ? "Pushing to Gist…"
    : syncStatus === "pulling" ? "Pulling from Gist…"
    : syncStatus === "ok" ? "Sync complete."
    : syncStatus?.error ?? "";
  const btnStyle = (disabled) => ({
    flex: 1, padding: "10px 0", background: "transparent",
    border: `1px solid ${disabled ? C.border : C.accent}`,
    color: disabled ? C.textDim : C.accent,
    fontFamily: "'Space Mono', monospace", fontSize: 10,
    letterSpacing: "0.1em", cursor: disabled ? "not-allowed" : "pointer",
  });
  const busy = syncStatus === "pushing" || syncStatus === "pulling";

  return (
    <div>
      <div style={card}>
        <Label>GitHub Gist Sync</Label>
        <p style={{ fontSize: 10, color: C.textDim, fontFamily: "'Space Mono', monospace", marginTop: 8, lineHeight: 1.6 }}>
          One private Gist syncs all devices. Your PAT stays in localStorage — it never enters the Gist.
        </p>
      </div>

      <div style={card}>
        <Label>Configuration</Label>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <Label style={{ fontSize: 8, display: "block", marginBottom: 6 }}>GitHub PAT (gist scope)</Label>
            <input type="password" value={pat} onChange={(e) => setPat(e.target.value)} onBlur={() => persistConfig({ pat })} placeholder="ghp_xxxxxxxxxxxx"
              style={{ width: "100%", background: C.fill, border: `1px solid ${C.border}`, color: C.textBright, fontSize: 11, fontFamily: "'Space Mono', monospace", padding: "8px 10px", outline: "none", caretColor: C.accent }} />
          </div>
          <div>
            <Label style={{ fontSize: 8, display: "block", marginBottom: 6 }}>Gist ID (auto-filled after first push)</Label>
            <input type="text" value={gistId} onChange={(e) => setGistId(e.target.value)} onBlur={() => persistConfig({ gistId })} placeholder="leave blank to create a new Gist"
              style={{ width: "100%", background: C.fill, border: `1px solid ${C.border}`, color: C.textBright, fontSize: 11, fontFamily: "'Space Mono', monospace", padding: "8px 10px", outline: "none", caretColor: C.accent }} />
          </div>
        </div>
      </div>

      <div style={card}>
        <Label>Actions</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={handlePush} disabled={busy} style={btnStyle(busy)}>↑ PUSH</button>
          <button onClick={handlePull} disabled={busy || !gistId} style={btnStyle(busy || !gistId)}>↓ PULL</button>
        </div>
        <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", marginTop: 8, lineHeight: 1.6 }}>
          Push before switching devices. Pull on the new device before editing.
        </p>
        {statusText ? (
          <div style={{ marginTop: 10, padding: "8px 10px", border: `1px solid ${statusColor}`, color: statusColor, fontFamily: "'Space Mono', monospace", fontSize: 10 }}>{statusText}</div>
        ) : null}
        {lastSync && !statusText ? (
          <div style={{ marginTop: 10, fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace" }}>Last synced: {lastSync}</div>
        ) : null}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function WeeklyPlanner() {
  const [weekKey, setWeekKey] = useState(getWeekKey(0));
  const [data, setData] = useState({});
  const [tab, setTab] = useState(0);
  const [syncStatus, setSyncStatus] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem("wplanner_" + weekKey);
    setData(raw ? JSON.parse(raw) : emptyWeek());
  }, [weekKey]);

  useEffect(() => {
    if (Object.keys(data).length > 0) {
      localStorage.setItem("wplanner_" + weekKey, JSON.stringify(data));
      setLastSaved(Date.now());
    }
  }, [data, weekKey]);

  const set = useCallback((path, value) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  }, []);

  const w = data.schedule ? data : emptyWeek();

  const tabContent = [
    <ScheduleTab key="schedule" w={w} set={set} />,
    <HabitsTab key="habits" w={w} set={set} />,
    <ReviewTab key="review" w={w} set={set} />,
    <SyncTab key="sync" weekKey={weekKey} setData={setData} syncStatus={syncStatus} setSyncStatus={setSyncStatus} />,
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: ${C.bg}; }
        input::placeholder, textarea::placeholder { color: ${C.textDim}; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; }
      `}</style>

      <div style={{
        background: C.bg, minHeight: "100vh", fontFamily: "'Space Mono', monospace",
        color: C.text, maxWidth: 680, margin: "0 auto", display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{ padding: "14px 14px 0", borderBottom: `1px solid ${C.border}`, paddingBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "0.08em", color: C.textBright }}>WEEKLY PLANNER</div>
              <div style={{ display: "flex", gap: 14, marginTop: 3, alignItems: "center" }}>
                <Label style={{ fontSize: 8 }}>WEEK OF {getWeekLabel(weekKey)}</Label>
                <Label style={{ fontSize: 8 }}>WK {getWeekNumber(weekKey)}</Label>
                {lastSaved && <Label style={{ fontSize: 7, color: C.textDim }}>SAVED</Label>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { label: "←", action: () => { const d = new Date(weekKey); d.setDate(d.getDate() - 7); setWeekKey(d.toISOString().slice(0, 10)); } },
                { label: "NOW", action: () => setWeekKey(getWeekKey(0)) },
                { label: "→", action: () => { const d = new Date(weekKey); d.setDate(d.getDate() + 7); setWeekKey(d.toISOString().slice(0, 10)); } },
              ].map(({ label, action }) => (
                <button key={label} onClick={action} style={{
                  background: "transparent", border: `1px solid ${C.border}`, color: C.text,
                  fontFamily: "'Space Mono', monospace", fontSize: label === "NOW" ? 9 : 10,
                  padding: "4px 8px", cursor: "pointer",
                }}>{label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{
              flex: 1, padding: "10px 6px", background: "transparent", border: "none",
              borderBottom: i === tab ? `2px solid ${C.accent}` : "2px solid transparent",
              color: i === tab ? C.textBright : C.textDim,
              fontFamily: "'Space Mono', monospace", fontSize: 9,
              letterSpacing: "0.08em", cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 10 }}>
          {tabContent[tab]}
        </div>
      </div>
    </>
  );
}
