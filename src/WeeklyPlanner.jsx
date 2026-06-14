import { useState, useEffect, useCallback } from "react";

// ── Gist sync ──────────────────────────────────────────────────────────────
const CONFIG_KEY = "wplanner_config";

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); } catch { return {}; }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

// Collect every wplanner_* key (excluding config) into one object
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

// Write a batch of weeks back into localStorage
function applyAllWeeks(weeks) {
  Object.entries(weeks).forEach(([k, v]) => {
    localStorage.setItem(k, JSON.stringify(v));
  });
}

async function gistPush(pat, gistId) {
  const body = JSON.stringify(collectAllWeeks(), null, 2);
  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
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
    headers: {
      Authorization: `Bearer ${pat}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: "Weekly Planner data store",
      public: false,
      files: { "weekly-planner.json": { content: body } },
    }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${res.statusText}`);
  return await res.json();
}

// ── Palette (pulled directly from screenshot) ──────────────────────────────
const C = {
  bg: "#0e0e0e",
  surface: "#161616",
  border: "#2a2a2a",
  borderLight: "#222222",
  text: "#c8b89a",       // warm tan — labels
  textDim: "#4a4540",    // very muted
  textBright: "#e0d4bc", // headings
  fill: "#1e1c19",       // input backgrounds
  accent: "#c8b89a",     // same tan for checkboxes / active state
};

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];
const HABITS = ["Workout", "Reading", "Zone 2"];

function getWeekKey(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 + offset * 7);
  return d.toISOString().slice(0, 10);
}

function getWeekLabel(key) {
  const d = new Date(key);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  const fmt = (dt) =>
    dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
    habits: Object.fromEntries(
      HABITS.map((h) => [h, Array(7).fill(false)])
    ),
    // Per-day detail for habits that have numeric tracking
    habitDetail: Object.fromEntries(
      HABITS.map((h) => [h, Array(7).fill("")])
    ),
    // Zone 2 cardio: checkbox + mins + avg HR per day
    zone2: Object.fromEntries(
      DAYS.map((d) => [d, { done: false, mins: "", hr: "" }])
    ),
    sleep: Array(7).fill(""),
    work: Array(7).fill(""),
    notes: "",
    nextWeek: "",
    meditation: Object.fromEntries(
      DAYS.map((d) => [d, { done: false, duration: "" }])
    ),
    weekRating: 0,
    intention: "",
    steps: Array(7).fill(""),
  };
}

// ── Tiny shared components ─────────────────────────────────────────────────
const Label = ({ children, style }) => (
  <span
    style={{
      fontSize: 9,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: C.text,
      fontFamily: "'Space Mono', monospace",
      ...style,
    }}
  >
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
      width: "100%",
      background: "transparent",
      border: "none",
      borderBottom: `1px solid ${C.border}`,
      color: C.textBright,
      fontSize: 11,
      fontFamily: "'Space Mono', monospace",
      padding: "3px 0",
      outline: "none",
      caretColor: C.accent,
      ...style,
    }}
  />
);

const Box = ({ checked, onChange }) => (
  <div
    onClick={onChange}
    style={{
      width: 13,
      height: 13,
      border: `1px solid ${checked ? C.accent : C.border}`,
      background: checked ? C.accent : "transparent",
      cursor: "pointer",
      flexShrink: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {checked && (
      <svg width="8" height="6" viewBox="0 0 8 6">
        <polyline
          points="1,3 3,5 7,1"
          stroke={C.bg}
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
      </svg>
    )}
  </div>
);

const BarChart = ({ values, max, days, color = C.textDim, accentColor, target }) => {
  const m = Math.max(...values.map(Number).filter(Boolean), max || 1);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 4,
        height: 60,
        paddingBottom: 16,
        position: "relative",
      }}
    >
      {values.map((v, i) => {
        const num = Number(v);
        const h = num ? (num / m) * 44 : 0;
        const meetsTarget = target != null && num >= target;
        const barColor = h > 0 ? (meetsTarget && accentColor ? accentColor : color) : "transparent";
        return (
          <div
            key={i}
            style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}
          >
            <div style={{ height: 44, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div
                style={{
                  width: "100%",
                  height: h,
                  background: barColor,
                  border: `1px solid ${C.border}`,
                  transition: "height 0.3s ease",
                }}
              />
            </div>
            <Label style={{ fontSize: 8, color: C.textDim }}>{days[i]}</Label>
          </div>
        );
      })}
    </div>
  );
};

// ── TABS ───────────────────────────────────────────────────────────────────
const TABS = ["Schedule", "Priorities", "Habits", "Stats", "Review", "Sync"];

export default function WeeklyPlanner() {
  const [weekKey, setWeekKey] = useState(getWeekKey(0));
  const [data, setData] = useState({});
  const [tab, setTab] = useState(0);
  const [syncStatus, setSyncStatus] = useState(null);
  const [lastSaved, setLastSaved] = useState(null); // timestamp of last save

  // Load from storage
  useEffect(() => {
    const raw = localStorage.getItem("wplanner_" + weekKey);
    setData(raw ? JSON.parse(raw) : emptyWeek());
  }, [weekKey]);

  // Save to storage
  useEffect(() => {
    if (Object.keys(data).length > 0) {
      localStorage.setItem("wplanner_" + weekKey, JSON.stringify(data));
      setLastSaved(Date.now());
    }
  }, [data, weekKey]);

  const set = (path, value) => {
    setData((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]];
      cur[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const w = data.schedule ? data : emptyWeek();

  // ── Shared styles ──────────────────────────────────────────────────────
  const card = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    padding: 14,
    marginBottom: 10,
  };

  // ── SCHEDULE TAB ───────────────────────────────────────────────────────
  const ScheduleTab = () => (
    <div>
      <div style={card}>
        <Label>Schedule</Label>
        {DAYS.map((day, di) => (
          <div key={day} style={{ marginTop: 14 }}>
            <Label style={{ color: C.textBright, fontSize: 10 }}>{day}</Label>
            <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 5 }}>
              {[0, 1, 2].map((li) => (
                <Line
                  key={li}
                  value={w.schedule?.[day]?.[li] || ""}
                  onChange={(v) => set(`schedule.${day}.${li}`, v)}
                  placeholder={li === 0 ? "am" : li === 1 ? "pm" : "eve"}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── PRIORITIES TAB ─────────────────────────────────────────────────────
  const PrioritiesTab = () => (
    <div>
      <div style={card}>
        <Label>Intention</Label>
        <textarea
          value={w.intention || ""}
          onChange={(e) => set("intention", e.target.value)}
          rows={3}
          placeholder="What does a great week look like?"
          style={{
            width: "100%",
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textBright,
            fontSize: 11,
            fontFamily: "'Space Mono', monospace",
            padding: 8,
            outline: "none",
            resize: "none",
            marginTop: 8,
            boxSizing: "border-box",
            caretColor: C.accent,
          }}
        />
      </div>

      <div style={card}>
        <Label>Top 3 Priorities</Label>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ color: C.textDim, fontFamily: "'Space Mono', monospace", fontSize: 10 }}>
                {["①", "②", "③"][i]}
              </span>
              <Line
                value={w.priorities?.[i] || ""}
                onChange={(v) => set(`priorities.${i}`, v)}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── HABITS TAB ─────────────────────────────────────────────────────────
  const TRACKED_HABITS = ["Workout", "Reading"]; // habits with optional detail field
  const detailPlaceholder = { Workout: "min", Reading: "min" };

  const HabitsTab = () => (
    <div>
      <div style={card}>
        <Label>Habit Tracker</Label>
        {/* Day headers */}
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 4 }}>
          <div style={{ width: 68, flexShrink: 0 }} />
          <div style={{ width: 36, flexShrink: 0 }} />
          {DAYS_SHORT.map((d, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center" }}>
              <Label style={{ fontSize: 8 }}>{d}</Label>
            </div>
          ))}
        </div>

        {TRACKED_HABITS.map((habit) => (
          <div key={habit}>
            {/* Checkbox row */}
            <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 4 }}>
              <div style={{ width: 68, flexShrink: 0 }}>
                <Label style={{ fontSize: 9 }}>{habit}</Label>
              </div>
              <div style={{ width: 36, flexShrink: 0 }} />
              {Array(7).fill(0).map((_, di) => (
                <div key={di} style={{ flex: 1, display: "flex", justifyContent: "center" }}>
                  <Box
                    checked={w.habits?.[habit]?.[di] || false}
                    onChange={() => set(`habits.${habit}.${di}`, !(w.habits?.[habit]?.[di]))}
                  />
                </div>
              ))}
            </div>
            {/* Detail row */}
            <div style={{ display: "flex", alignItems: "center", marginTop: 4, gap: 4 }}>
              <div style={{ width: 68, flexShrink: 0 }}>
                <Label style={{ fontSize: 7, color: C.textDim }}>{detailPlaceholder[habit]}</Label>
              </div>
              <div style={{ width: 36, flexShrink: 0 }} />
              {DAYS.map((day, di) => (
                <div key={di} style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={w.habitDetail?.[habit]?.[di] || ""}
                    onChange={(e) => set(`habitDetail.${habit}.${di}`, e.target.value)}
                    min={0} max={999} step={1}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: `1px solid ${C.border}`,
                      color: C.textDim,
                      fontSize: 9,
                      fontFamily: "'Space Mono', monospace",
                      padding: "2px 1px",
                      outline: "none",
                      textAlign: "center",
                      caretColor: C.accent,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Completion row */}
        <div style={{ display: "flex", alignItems: "center", marginTop: 12, gap: 4 }}>
          <div style={{ width: 68, flexShrink: 0 }}>
            <Label style={{ fontSize: 8, color: C.textDim }}>Done</Label>
          </div>
          <div style={{ width: 36, flexShrink: 0 }} />
          {Array(7).fill(0).map((_, di) => {
            const count = TRACKED_HABITS.filter((h) => w.habits?.[h]?.[di]).length;
            return (
              <div key={di} style={{ flex: 1, textAlign: "center" }}>
                <Label style={{ fontSize: 9, color: count === TRACKED_HABITS.length ? C.accent : C.textDim }}>
                  {count}/{TRACKED_HABITS.length}
                </Label>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Zone 2 Cardio ── */}
      <div style={card}>
        <Label>Zone 2 Cardio</Label>
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 4 }}>
          <div style={{ width: 30, flexShrink: 0 }} />
          <div style={{ width: 28, flexShrink: 0, textAlign: "center" }}>
            <Label style={{ fontSize: 7 }}>✓</Label>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <Label style={{ fontSize: 7 }}>Min</Label>
          </div>
          <div style={{ flex: 1, textAlign: "center" }}>
            <Label style={{ fontSize: 7 }}>HR</Label>
          </div>
        </div>
        {DAYS.map((day) => (
          <div key={day} style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 4 }}>
            <div style={{ width: 30, flexShrink: 0 }}>
              <Label style={{ fontSize: 9, color: C.textDim }}>{day.slice(0, 1)}</Label>
            </div>
            <div style={{ width: 28, flexShrink: 0, display: "flex", justifyContent: "center" }}>
              <Box
                checked={w.zone2?.[day]?.done || false}
                onChange={() => set(`zone2.${day}.done`, !(w.zone2?.[day]?.done))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                value={w.zone2?.[day]?.mins || ""}
                onChange={(e) => set(`zone2.${day}.mins`, e.target.value)}
                min={0} max={300} step={5}
                placeholder="—"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textBright,
                  fontSize: 10,
                  fontFamily: "'Space Mono', monospace",
                  padding: "3px 4px",
                  outline: "none",
                  textAlign: "center",
                  caretColor: C.accent,
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                value={w.zone2?.[day]?.hr || ""}
                onChange={(e) => set(`zone2.${day}.hr`, e.target.value)}
                min={60} max={200} step={1}
                placeholder="—"
                style={{
                  width: "100%",
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textBright,
                  fontSize: 10,
                  fontFamily: "'Space Mono', monospace",
                  padding: "3px 4px",
                  outline: "none",
                  textAlign: "center",
                  caretColor: C.accent,
                }}
              />
            </div>
          </div>
        ))}
        {/* Weekly zone 2 summary */}
        {(() => {
          const sessions = DAYS.filter(d => w.zone2?.[d]?.mins);
          const totalMins = sessions.reduce((a, d) => a + Number(w.zone2?.[d]?.mins || 0), 0);
          const hrVals = DAYS.map(d => Number(w.zone2?.[d]?.hr || 0)).filter(Boolean);
          const avgHR = hrVals.length ? Math.round(hrVals.reduce((a, b) => a + b, 0) / hrVals.length) : null;
          return sessions.length > 0 ? (
            <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
              <Label style={{ fontSize: 8, color: C.textDim }}>{sessions.length} sessions</Label>
              <Label style={{ fontSize: 8, color: C.textDim }}>{totalMins} min total</Label>
              {avgHR && <Label style={{ fontSize: 8, color: C.textDim }}>avg {avgHR} bpm</Label>}
            </div>
          ) : null;
        })()}
      </div>

      {/* ── Meditation ── */}
      <div style={card}>
        <Label>Meditation</Label>
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 6 }}>
          <div style={{ width: 30, flexShrink: 0 }} />
          <div style={{ width: 60, flexShrink: 0 }}>
            <Label style={{ fontSize: 8 }}>Done</Label>
          </div>
          <div style={{ flex: 1 }}>
            <Label style={{ fontSize: 8 }}>Duration</Label>
          </div>
        </div>
        {DAYS.map((day) => (
          <div key={day} style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 6 }}>
            <div style={{ width: 30, flexShrink: 0 }}>
              <Label style={{ fontSize: 9, color: C.textDim }}>{day.slice(0, 1)}</Label>
            </div>
            <div style={{ width: 60, flexShrink: 0 }}>
              <Box
                checked={w.meditation?.[day]?.done || false}
                onChange={() => set(`meditation.${day}.done`, !(w.meditation?.[day]?.done))}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Line
                value={w.meditation?.[day]?.duration || ""}
                onChange={(v) => set(`meditation.${day}.duration`, v)}
                placeholder="min"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ── STATS TAB ──────────────────────────────────────────────────────────
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

  const StatsTab = () => {
    const sleepVals = DAYS.map((_, i) => w.sleep?.[i] || "");
    const workVals = DAYS.map((_, i) => w.work?.[i] || "");
    const stepsVals = DAYS.map((_, i) => w.steps?.[i] || "");
    const totalSteps = stepsVals.map(Number).reduce((a, b) => a + b, 0);
    const avgSteps = stepsVals.filter(Boolean).length
      ? Math.round(totalSteps / stepsVals.filter(Boolean).length)
      : 0;

    return (
      <div>
        {/* ── Sleep ── */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Label>Sleep (hrs)</Label>
            <Label style={{ fontSize: 8, color: C.textDim }}>target: 7 hrs</Label>
          </div>
          <div style={{ marginTop: 10 }}>
            <BarChart
              values={sleepVals}
              max={10}
              days={DAYS_SHORT}
              color="#3a3530"
              accentColor={C.accent + "cc"}
              target={7}
            />
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {DAYS.map((day, i) => (
              <div key={day} style={{ flex: 1 }}>
                <input
                  type="number"
                  value={w.sleep?.[i] || ""}
                  onChange={(e) => set(`sleep.${i}`, e.target.value)}
                  min={0} max={12} step={0.5}
                  style={numInputStyle}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <Label style={{ fontSize: 8, color: C.textDim }}>
              avg {(() => {
                const vals = sleepVals.map(Number).filter(Boolean);
                return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—";
              })()} hrs
            </Label>
            <Label style={{ fontSize: 8, color: C.textDim }}>·</Label>
            <Label style={{ fontSize: 8, color: C.textDim }}>
              {sleepVals.filter(v => Number(v) >= 7).length}/7 days at target
            </Label>
          </div>
        </div>

        {/* ── Steps ── */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Label>Steps</Label>
            <Label style={{ fontSize: 8, color: C.textDim }}>target: 10,000</Label>
          </div>
          <div style={{ marginTop: 10 }}>
            <BarChart
              values={stepsVals}
              max={15000}
              days={DAYS_SHORT}
              color="#2a3028"
              accentColor="#5a8a5a"
              target={10000}
            />
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {DAYS.map((day, i) => (
              <div key={day} style={{ flex: 1 }}>
                <input
                  type="number"
                  value={w.steps?.[i] || ""}
                  onChange={(e) => set(`steps.${i}`, e.target.value)}
                  min={0} max={99999} step={100}
                  style={numInputStyle}
                />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            <Label style={{ fontSize: 8, color: C.textDim }}>
              avg {avgSteps ? avgSteps.toLocaleString() : "—"} steps
            </Label>
            <Label style={{ fontSize: 8, color: C.textDim }}>·</Label>
            <Label style={{ fontSize: 8, color: C.textDim }}>
              {stepsVals.filter(v => Number(v) >= 10000).length}/7 days at target
            </Label>
          </div>
        </div>

        {/* ── Zone 2 ── */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <Label>Zone 2 Cardio</Label>
            <Label style={{ fontSize: 8, color: C.textDim }}>target: 150 min/wk</Label>
          </div>
          {(() => {
            const minsVals = DAYS.map(d => w.zone2?.[d]?.mins || "");
            const hrVals = DAYS.map(d => w.zone2?.[d]?.hr || "");
            const totalMins = minsVals.map(Number).reduce((a, b) => a + b, 0);
            const hrNums = hrVals.map(Number).filter(Boolean);
            const avgHR = hrNums.length ? Math.round(hrNums.reduce((a, b) => a + b, 0) / hrNums.length) : null;
            const maxMins = Math.max(...minsVals.map(Number).filter(Boolean), 60);
            return (
              <>
                {/* Dual chart: bars = minutes, dots+labels = HR */}
                <div style={{ marginTop: 10, position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70, paddingBottom: 16 }}>
                    {DAYS.map((day, i) => {
                      const mins = Number(minsVals[i]);
                      const hr = Number(hrVals[i]);
                      const barH = mins ? (mins / maxMins) * 44 : 0;
                      const meetsTarget = totalMins >= 150;
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          {/* HR label above bar */}
                          <div style={{ height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {hr ? (
                              <span style={{
                                fontSize: 7,
                                fontFamily: "'Space Mono', monospace",
                                color: "#8a5a5a",
                                letterSpacing: 0,
                              }}>{hr}</span>
                            ) : null}
                          </div>
                          {/* Bar */}
                          <div style={{ height: 44, display: "flex", alignItems: "flex-end", width: "100%" }}>
                            <div style={{
                              width: "100%",
                              height: barH,
                              background: barH > 0 ? (meetsTarget ? "#3a5a3a" : "#2a3a2a") : "transparent",
                              border: `1px solid ${C.border}`,
                              transition: "height 0.3s ease",
                            }} />
                          </div>
                          <Label style={{ fontSize: 8, color: C.textDim }}>{DAYS_SHORT[i]}</Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                  <Label style={{ fontSize: 8, color: C.textDim }}>
                    {totalMins} / 150 min this week
                  </Label>
                  {avgHR ? (
                    <>
                      <Label style={{ fontSize: 8, color: C.textDim }}>·</Label>
                      <Label style={{ fontSize: 8, color: C.textDim }}>avg {avgHR} bpm</Label>
                    </>
                  ) : null}
                </div>
              </>
            );
          })()}
        </div>

        {/* ── Work ── */}
        <div style={card}>
          <Label>Work (hrs)</Label>
          <div style={{ marginTop: 10 }}>
            <BarChart values={workVals} max={12} days={DAYS_SHORT} color="#2a2825" />
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {DAYS.map((day, i) => (
              <div key={day} style={{ flex: 1 }}>
                <input
                  type="number"
                  value={w.work?.[i] || ""}
                  onChange={(e) => set(`work.${i}`, e.target.value)}
                  min={0} max={16} step={0.5}
                  style={numInputStyle}
                />
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>
            <Label style={{ fontSize: 8, color: C.textDim }}>
              total {workVals.map(Number).reduce((a, b) => a + b, 0).toFixed(1)} hrs
            </Label>
          </div>
        </div>
      </div>
    );
  };

  // ── REVIEW TAB ─────────────────────────────────────────────────────────
  const ReviewTab = () => (
    <div>
      <div style={card}>
        <Label>Week Rating</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div
              key={n}
              onClick={() => set("weekRating", n)}
              style={{
                flex: 1,
                height: 36,
                border: `1px solid ${w.weekRating >= n ? C.accent : C.border}`,
                background: w.weekRating >= n ? C.accent + "22" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              <Label style={{ color: w.weekRating >= n ? C.accent : C.textDim, fontSize: 11 }}>
                {n}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Summary view */}
      <div style={card}>
        <Label>Week Summary</Label>
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {HABITS.map((habit) => {
            const done = (w.habits?.[habit] || []).filter(Boolean).length;
            return (
              <div key={habit} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Label style={{ fontSize: 9 }}>{habit}</Label>
                <div style={{ display: "flex", gap: 3 }}>
                  {Array(7).fill(0).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 8,
                        height: 8,
                        background: w.habits?.[habit]?.[i] ? C.accent : C.border,
                      }}
                    />
                  ))}
                  <Label style={{ fontSize: 9, marginLeft: 6 }}>{done}/7</Label>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <Label style={{ fontSize: 9 }}>Avg Sleep</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {(() => {
                const vals = (w.sleep || []).map(Number).filter(Boolean);
                return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) + " hrs" : "—";
              })()}
            </Label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Label style={{ fontSize: 9 }}>Avg Steps</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {(() => {
                const vals = (w.steps || []).map(Number).filter(Boolean);
                return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length).toLocaleString() : "—";
              })()}
            </Label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Label style={{ fontSize: 9 }}>Total Work</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {(w.work || []).map(Number).reduce((a, b) => a + b, 0).toFixed(1)} hrs
            </Label>
          </div>
        </div>
      </div>

      <div style={card}>
        <Label>Notes</Label>
        <textarea
          value={w.notes || ""}
          onChange={(e) => set("notes", e.target.value)}
          rows={5}
          style={{
            width: "100%",
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textBright,
            fontSize: 11,
            fontFamily: "'Space Mono', monospace",
            padding: 8,
            outline: "none",
            resize: "none",
            marginTop: 8,
            boxSizing: "border-box",
            caretColor: C.accent,
          }}
        />
      </div>

      <div style={card}>
        <Label>Add to Next Week</Label>
        <textarea
          value={w.nextWeek || ""}
          onChange={(e) => set("nextWeek", e.target.value)}
          rows={3}
          style={{
            width: "100%",
            background: "transparent",
            border: `1px solid ${C.border}`,
            color: C.textBright,
            fontSize: 11,
            fontFamily: "'Space Mono', monospace",
            padding: 8,
            outline: "none",
            resize: "none",
            marginTop: 8,
            boxSizing: "border-box",
            caretColor: C.accent,
          }}
        />
      </div>
    </div>
  );

  // ── SYNC TAB ───────────────────────────────────────────────────────────
  const SyncTab = () => {
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
      } catch (e) {
        setSyncStatus({ error: e.message });
      }
    }, [pat, gistId]);

    const handlePull = useCallback(async () => {
      if (!pat || !gistId) { setSyncStatus({ error: "PAT and Gist ID required to pull." }); return; }
      setSyncStatus("pulling");
      try {
        const weeks = await gistPull(pat, gistId);
        applyAllWeeks(weeks);
        persistConfig({ pat, gistId, lastSync: new Date().toISOString() });
        // Reload current week from freshly-written localStorage
        const raw = localStorage.getItem("wplanner_" + weekKey);
        if (raw) setData(JSON.parse(raw));
        setSyncStatus("ok");
      } catch (e) {
        setSyncStatus({ error: e.message });
      }
    }, [pat, gistId]);

    const statusColor = syncStatus === "ok" ? "#5a8a5a"
      : syncStatus?.error ? "#8a3a3a"
      : C.textDim;

    const statusText = syncStatus === "pushing" ? "Pushing to Gist…"
      : syncStatus === "pulling" ? "Pulling from Gist…"
      : syncStatus === "ok" ? "Sync complete."
      : syncStatus?.error ?? "";

    const btnStyle = (disabled) => ({
      flex: 1,
      padding: "10px 0",
      background: "transparent",
      border: `1px solid ${disabled ? C.border : C.accent}`,
      color: disabled ? C.textDim : C.accent,
      fontFamily: "'Space Mono', monospace",
      fontSize: 10,
      letterSpacing: "0.1em",
      cursor: disabled ? "not-allowed" : "pointer",
    });

    const busy = syncStatus === "pushing" || syncStatus === "pulling";

    return (
      <div>
        <div style={card}>
          <Label>GitHub Gist Sync</Label>
          <p style={{ fontSize: 10, color: C.textDim, fontFamily: "'Space Mono', monospace", marginTop: 10, lineHeight: 1.6 }}>
            One private Gist acts as a single source of truth across iPhone, iPad, and any other device.
            Your PAT stays in localStorage on this device — it never enters the Gist.
          </p>
        </div>

        <div style={card}>
          <Label>Configuration</Label>
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label style={{ fontSize: 8, display: "block", marginBottom: 6 }}>GitHub Personal Access Token (gist scope)</Label>
              <input
                type="password"
                value={pat}
                onChange={(e) => setPat(e.target.value)}
                onBlur={() => persistConfig({ pat })}
                placeholder="ghp_xxxxxxxxxxxx"
                style={{
                  width: "100%",
                  background: C.fill,
                  border: `1px solid ${C.border}`,
                  color: C.textBright,
                  fontSize: 11,
                  fontFamily: "'Space Mono', monospace",
                  padding: "8px 10px",
                  outline: "none",
                  caretColor: C.accent,
                }}
              />
            </div>
            <div>
              <Label style={{ fontSize: 8, display: "block", marginBottom: 6 }}>Gist ID (auto-filled after first push)</Label>
              <input
                type="text"
                value={gistId}
                onChange={(e) => setGistId(e.target.value)}
                onBlur={() => persistConfig({ gistId })}
                placeholder="leave blank to create a new Gist"
                style={{
                  width: "100%",
                  background: C.fill,
                  border: `1px solid ${C.border}`,
                  color: C.textBright,
                  fontSize: 11,
                  fontFamily: "'Space Mono', monospace",
                  padding: "8px 10px",
                  outline: "none",
                  caretColor: C.accent,
                }}
              />
            </div>
          </div>
        </div>

        <div style={card}>
          <Label>Actions</Label>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button onClick={handlePush} disabled={busy} style={btnStyle(busy)}>
              ↑ PUSH
            </button>
            <button onClick={handlePull} disabled={busy || !gistId} style={btnStyle(busy || !gistId)}>
              ↓ PULL
            </button>
          </div>
          <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", marginTop: 10, lineHeight: 1.6 }}>
            Push writes all local week data to the Gist. Pull overwrites local data with the Gist. Always push before switching devices.
          </p>
          {statusText ? (
            <div style={{
              marginTop: 12,
              padding: "8px 10px",
              border: `1px solid ${statusColor}`,
              color: statusColor,
              fontFamily: "'Space Mono', monospace",
              fontSize: 10,
            }}>
              {statusText}
            </div>
          ) : null}
          {lastSync && !statusText ? (
            <div style={{ marginTop: 12, fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace" }}>
              Last synced: {lastSync}
            </div>
          ) : null}
        </div>

        <div style={card}>
          <Label>Setup Guide</Label>

          {/* Section 1 */}
          <div style={{ marginTop: 14 }}>
            <Label style={{ fontSize: 8, color: C.textBright, display: "block", marginBottom: 8 }}>Step 1 — Create a GitHub account (if needed)</Label>
            <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.8 }}>
              Go to github.com and sign up for a free account. You don't need to know anything about coding — GitHub is just being used here as a free, private data store. If you already have an account, skip to Step 2.
            </p>
          </div>

          {/* Section 2 */}
          <div style={{ marginTop: 16 }}>
            <Label style={{ fontSize: 8, color: C.textBright, display: "block", marginBottom: 8 }}>Step 2 — Generate a Personal Access Token (PAT)</Label>
            <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.8, marginBottom: 10 }}>
              A PAT is a password that lets this app write to your GitHub account on your behalf. You'll create one with the minimum possible permissions — Gist scope only — so it can't touch your repositories or any other GitHub data.
            </p>
            {[
              "Sign into github.com on a browser (easier on desktop for this step)",
              "Click your profile photo in the top-right corner → Settings",
              "Scroll all the way down the left sidebar → Developer settings (last item)",
              "Click Personal access tokens → Tokens (classic)",
              "Click Generate new token → Generate new token (classic)",
              "Give it a name, e.g. \"weekly-planner\" — this is just a label for you",
              "Set Expiration to No expiration (or 1 year if you prefer to rotate it)",
              "Under Select scopes, check only the box labeled gist — nothing else",
              "Click Generate token at the bottom",
              "IMPORTANT: Copy the token immediately — GitHub shows it only once. It starts with ghp_",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <Label style={{ fontSize: 9, color: C.accent, flexShrink: 0, width: 16 }}>{i + 1}.</Label>
                <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.7 }}>{s}</p>
              </div>
            ))}
          </div>

          {/* Section 3 */}
          <div style={{ marginTop: 16 }}>
            <Label style={{ fontSize: 8, color: C.textBright, display: "block", marginBottom: 8 }}>Step 3 — First push (creates the Gist)</Label>
            {[
              "Paste your PAT into the field above and tap anywhere else to save it",
              "Leave the Gist ID field blank — it auto-fills on first push",
              "Tap ↑ PUSH. The app creates a private Gist named weekly-planner.json in your GitHub account and writes all your week data to it",
              "The Gist ID field now shows a long alphanumeric string, e.g. a1b2c3d4e5f6... — this is the address of your data store",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <Label style={{ fontSize: 9, color: C.accent, flexShrink: 0, width: 16 }}>{i + 1}.</Label>
                <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.7 }}>{s}</p>
              </div>
            ))}
          </div>

          {/* Section 4 */}
          <div style={{ marginTop: 16 }}>
            <Label style={{ fontSize: 8, color: C.textBright, display: "block", marginBottom: 8 }}>Step 4 — Set up your second device</Label>
            {[
              "Open the planner URL in Safari on your iPad (or any other device)",
              "Go to the Sync tab",
              "Paste the same PAT into the PAT field",
              "Paste the Gist ID from your first device into the Gist ID field (find it at gist.github.com — it's in the URL of the file named weekly-planner.json)",
              "Tap ↓ PULL — all your week data syncs to this device immediately",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <Label style={{ fontSize: 9, color: C.accent, flexShrink: 0, width: 16 }}>{i + 1}.</Label>
                <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.7 }}>{s}</p>
              </div>
            ))}
          </div>

          {/* Section 5 */}
          <div style={{ marginTop: 16 }}>
            <Label style={{ fontSize: 8, color: C.textBright, display: "block", marginBottom: 8 }}>Step 5 — Daily workflow</Label>
            <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.8, marginBottom: 10 }}>
              Sync is manual and intentional — there's no background sync that could overwrite good data with a half-loaded device.
            </p>
            {[
              "Before switching devices: tap ↑ PUSH on the device you were using",
              "After switching devices: tap ↓ PULL on the new device before editing",
              "If you forget to push: the last push wins. Check the Last synced timestamp before pulling to know which device is ahead",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <Label style={{ fontSize: 9, color: C.accent, flexShrink: 0, width: 16 }}>{"›"}</Label>
                <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.7 }}>{s}</p>
              </div>
            ))}
          </div>

          {/* Section 6 — Troubleshooting */}
          <div style={{ marginTop: 16 }}>
            <Label style={{ fontSize: 8, color: C.textBright, display: "block", marginBottom: 8 }}>Troubleshooting</Label>
            {[
              ["GitHub 401: Unauthorized", "Your PAT is wrong, expired, or doesn't have the gist scope. Regenerate it following Step 2 and paste the new one."],
              ["GitHub 404: Not Found", "Your Gist ID is wrong. Find the correct ID at gist.github.com — it's the long string in the URL after your username."],
              ["File not found in Gist — push first", "You entered a valid Gist ID but it doesn't contain a weekly-planner.json file yet. Push from your primary device first."],
              ["Sync complete but data didn't update", "Tap ↓ PULL again. If the current week's data still looks wrong, navigate away and back to the Stats or Schedule tab to force a reload from localStorage."],
            ].map(([err, fix], i) => (
              <div key={i} style={{ marginBottom: 12, paddingLeft: 0 }}>
                <Label style={{ fontSize: 8, color: C.accent, display: "block", marginBottom: 4 }}>{err}</Label>
                <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.7 }}>{fix}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const tabContent = [<ScheduleTab />, <PrioritiesTab />, <HabitsTab />, <StatsTab />, <ReviewTab />, <SyncTab />];

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
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'Space Mono', monospace",
        color: C.text,
        maxWidth: 680,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: "16px 16px 0",
          borderBottom: `1px solid ${C.border}`,
          paddingBottom: 12,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.08em", color: C.textBright }}>
                WEEKLY PLANNER
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 4, alignItems: "center" }}>
                <Label style={{ fontSize: 8 }}>WEEK OF {getWeekLabel(weekKey)}</Label>
                <Label style={{ fontSize: 8 }}>WK {getWeekNumber(weekKey)}</Label>
                {lastSaved && (
                  <Label style={{ fontSize: 7, color: C.textDim }}>
                    SAVED
                  </Label>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => {
                  const d = new Date(weekKey);
                  d.setDate(d.getDate() - 7);
                  setWeekKey(d.toISOString().slice(0, 10));
                }}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >←</button>
              <button
                onClick={() => setWeekKey(getWeekKey(0))}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 9,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >NOW</button>
              <button
                onClick={() => {
                  const d = new Date(weekKey);
                  d.setDate(d.getDate() + 7);
                  setWeekKey(d.toISOString().slice(0, 10));
                }}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.text,
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >→</button>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{
          display: "flex",
          borderBottom: `1px solid ${C.border}`,
          overflowX: "auto",
          flexShrink: 0,
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}>
          {TABS.map((t, i) => (
            <button
              key={t}
              onClick={() => setTab(i)}
              style={{
                flexShrink: 0,
                minWidth: 58,
                padding: "10px 6px",
                background: "transparent",
                border: "none",
                borderBottom: i === tab ? `2px solid ${C.accent}` : "2px solid transparent",
                color: i === tab ? C.textBright : C.textDim,
                fontFamily: "'Space Mono', monospace",
                fontSize: 8,
                letterSpacing: "0.08em",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {tabContent[tab]}
        </div>
      </div>
    </>
  );
}
