import { useState, useEffect, useCallback } from "react";

// ── Gist sync ──────────────────────────────────────────────────────────────
const CONFIG_KEY = "wplanner_config";

function loadConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); } catch { return {}; }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
}

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
  Object.entries(weeks).forEach(([k, v]) => {
    localStorage.setItem(k, JSON.stringify(v));
  });
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
const TABS = ["Schedule", "Priorities", "Habits", "Stats", "Review", "Sync"];

const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  padding: 14,
  marginBottom: 10,
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
    work: Array(7).fill(""),
    notes: "",
    nextWeek: "",
    meditation: Object.fromEntries(DAYS.map((d) => [d, { done: false, duration: "" }])),
    weekRating: 0,
    intention: "",
    steps: Array(7).fill(""),
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
      padding: "3px 0", outline: "none", caretColor: C.accent, ...style,
    }}
  />
);

const Box = ({ checked, onChange }) => (
  <div onClick={onChange} style={{
    width: 13, height: 13, border: `1px solid ${checked ? C.accent : C.border}`,
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
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, paddingBottom: 16, position: "relative" }}>
      {values.map((v, i) => {
        const num = Number(v);
        const h = num ? (num / m) * 44 : 0;
        const meetsTarget = target != null && num >= target;
        const barColor = h > 0 ? (meetsTarget && accentColor ? accentColor : color) : "transparent";
        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ height: 44, display: "flex", alignItems: "flex-end", width: "100%" }}>
              <div style={{ width: "100%", height: h, background: barColor, border: `1px solid ${C.border}`, transition: "height 0.3s ease" }} />
            </div>
            <Label style={{ fontSize: 8, color: C.textDim }}>{days[i]}</Label>
          </div>
        );
      })}
    </div>
  );
};

// ── Tab components (outside WeeklyPlanner to prevent remount on every keystroke) ──

function ScheduleTab({ w, set }) {
  return (
    <div>
      <div style={card}>
        <Label>Schedule</Label>
        {DAYS.map((day) => (
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
}

function PrioritiesTab({ w, set }) {
  return (
    <div>
      <div style={card}>
        <Label>Intention</Label>
        <textarea
          value={w.intention || ""}
          onChange={(e) => set("intention", e.target.value)}
          rows={3}
          placeholder="What does a great week look like?"
          style={{
            width: "100%", background: "transparent", border: `1px solid ${C.border}`,
            color: C.textBright, fontSize: 11, fontFamily: "'Space Mono', monospace",
            padding: 8, outline: "none", resize: "none", marginTop: 8,
            boxSizing: "border-box", caretColor: C.accent,
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
              <Line value={w.priorities?.[i] || ""} onChange={(v) => set(`priorities.${i}`, v)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HabitsTab({ w, set }) {
  return (
    <div>
      <div style={card}>
        <Label>Habit Tracker</Label>
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
            <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 4 }}>
              <div style={{ width: 68, flexShrink: 0 }}><Label style={{ fontSize: 9 }}>{habit}</Label></div>
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
            <div style={{ display: "flex", alignItems: "center", marginTop: 4, gap: 4 }}>
              <div style={{ width: 68, flexShrink: 0 }}>
                <Label style={{ fontSize: 7, color: C.textDim }}>{DETAIL_PLACEHOLDER[habit]}</Label>
              </div>
              <div style={{ width: 36, flexShrink: 0 }} />
              {DAYS.map((_, di) => (
                <div key={di} style={{ flex: 1 }}>
                  <input
                    type="number"
                    value={w.habitDetail?.[habit]?.[di] || ""}
                    onChange={(e) => set(`habitDetail.${habit}.${di}`, e.target.value)}
                    min={0} max={999} step={1}
                    style={{
                      width: "100%", background: "transparent", border: `1px solid ${C.border}`,
                      color: C.textDim, fontSize: 9, fontFamily: "'Space Mono', monospace",
                      padding: "2px 1px", outline: "none", textAlign: "center", caretColor: C.accent,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", marginTop: 12, gap: 4 }}>
          <div style={{ width: 68, flexShrink: 0 }}><Label style={{ fontSize: 8, color: C.textDim }}>Done</Label></div>
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

      {/* Zone 2 Cardio */}
      <div style={card}>
        <Label>Zone 2 Cardio</Label>
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 4 }}>
          <div style={{ width: 30, flexShrink: 0 }} />
          <div style={{ width: 28, flexShrink: 0, textAlign: "center" }}><Label style={{ fontSize: 7 }}>✓</Label></div>
          <div style={{ flex: 1, textAlign: "center" }}><Label style={{ fontSize: 7 }}>Min</Label></div>
          <div style={{ flex: 1, textAlign: "center" }}><Label style={{ fontSize: 7 }}>HR</Label></div>
        </div>
        {DAYS.map((day) => (
          <div key={day} style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 4 }}>
            <div style={{ width: 30, flexShrink: 0 }}>
              <Label style={{ fontSize: 9, color: C.textDim }}>{day.slice(0, 1)}</Label>
            </div>
            <div style={{ width: 28, flexShrink: 0, display: "flex", justifyContent: "center" }}>
              <Box checked={w.zone2?.[day]?.done || false} onChange={() => set(`zone2.${day}.done`, !(w.zone2?.[day]?.done))} />
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                value={w.zone2?.[day]?.mins || ""}
                onChange={(e) => set(`zone2.${day}.mins`, e.target.value)}
                min={0} max={300} step={5} placeholder="—"
                style={{
                  width: "100%", background: "transparent", border: `1px solid ${C.border}`,
                  color: C.textBright, fontSize: 10, fontFamily: "'Space Mono', monospace",
                  padding: "3px 4px", outline: "none", textAlign: "center", caretColor: C.accent,
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="number"
                value={w.zone2?.[day]?.hr || ""}
                onChange={(e) => set(`zone2.${day}.hr`, e.target.value)}
                min={60} max={200} step={1} placeholder="—"
                style={{
                  width: "100%", background: "transparent", border: `1px solid ${C.border}`,
                  color: C.textBright, fontSize: 10, fontFamily: "'Space Mono', monospace",
                  padding: "3px 4px", outline: "none", textAlign: "center", caretColor: C.accent,
                }}
              />
            </div>
          </div>
        ))}
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

      {/* Meditation */}
      <div style={card}>
        <Label>Meditation</Label>
        <div style={{ display: "flex", alignItems: "center", marginTop: 10, gap: 6 }}>
          <div style={{ width: 30, flexShrink: 0 }} />
          <div style={{ width: 60, flexShrink: 0 }}><Label style={{ fontSize: 8 }}>Done</Label></div>
          <div style={{ flex: 1 }}><Label style={{ fontSize: 8 }}>Duration</Label></div>
        </div>
        {DAYS.map((day) => (
          <div key={day} style={{ display: "flex", alignItems: "center", marginTop: 8, gap: 6 }}>
            <div style={{ width: 30, flexShrink: 0 }}>
              <Label style={{ fontSize: 9, color: C.textDim }}>{day.slice(0, 1)}</Label>
            </div>
            <div style={{ width: 60, flexShrink: 0 }}>
              <Box checked={w.meditation?.[day]?.done || false} onChange={() => set(`meditation.${day}.done`, !(w.meditation?.[day]?.done))} />
            </div>
            <div style={{ flex: 1 }}>
              <Line value={w.meditation?.[day]?.duration || ""} onChange={(v) => set(`meditation.${day}.duration`, v)} placeholder="min" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsTab({ w, set }) {
  const sleepVals = DAYS.map((_, i) => w.sleep?.[i] || "");
  const workVals = DAYS.map((_, i) => w.work?.[i] || "");
  const stepsVals = DAYS.map((_, i) => w.steps?.[i] || "");
  const totalSteps = stepsVals.map(Number).reduce((a, b) => a + b, 0);
  const avgSteps = stepsVals.filter(Boolean).length
    ? Math.round(totalSteps / stepsVals.filter(Boolean).length) : 0;

  return (
    <div>
      {/* Sleep */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Label>Sleep (hrs)</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>target: 7 hrs</Label>
        </div>
        <div style={{ marginTop: 10 }}>
          <BarChart values={sleepVals} max={10} days={DAYS_SHORT} color="#3a3530" accentColor={C.accent + "cc"} target={7} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {DAYS.map((day, i) => (
            <div key={day} style={{ flex: 1 }}>
              <input type="number" value={w.sleep?.[i] || ""} onChange={(e) => set(`sleep.${i}`, e.target.value)} min={0} max={12} step={0.5} style={numInputStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <Label style={{ fontSize: 8, color: C.textDim }}>
            avg {(() => { const vals = sleepVals.map(Number).filter(Boolean); return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "—"; })()} hrs
          </Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>·</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>{sleepVals.filter(v => Number(v) >= 7).length}/7 days at target</Label>
        </div>
      </div>

      {/* Steps */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Label>Steps</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>target: 10,000</Label>
        </div>
        <div style={{ marginTop: 10 }}>
          <BarChart values={stepsVals} max={15000} days={DAYS_SHORT} color="#2a3028" accentColor="#5a8a5a" target={10000} />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {DAYS.map((day, i) => (
            <div key={day} style={{ flex: 1 }}>
              <input type="number" value={w.steps?.[i] || ""} onChange={(e) => set(`steps.${i}`, e.target.value)} min={0} max={99999} step={100} style={numInputStyle} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
          <Label style={{ fontSize: 8, color: C.textDim }}>avg {avgSteps ? avgSteps.toLocaleString() : "—"} steps</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>·</Label>
          <Label style={{ fontSize: 8, color: C.textDim }}>{stepsVals.filter(v => Number(v) >= 10000).length}/7 days at target</Label>
        </div>
      </div>

      {/* Zone 2 */}
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
              <div style={{ marginTop: 10, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70, paddingBottom: 16 }}>
                  {DAYS.map((day, i) => {
                    const mins = Number(minsVals[i]);
                    const hr = Number(hrVals[i]);
                    const barH = mins ? (mins / maxMins) * 44 : 0;
                    const meetsTarget = totalMins >= 150;
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                        <div style={{ height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {hr ? <span style={{ fontSize: 7, fontFamily: "'Space Mono', monospace", color: "#8a5a5a", letterSpacing: 0 }}>{hr}</span> : null}
                        </div>
                        <div style={{ height: 44, display: "flex", alignItems: "flex-end", width: "100%" }}>
                          <div style={{ width: "100%", height: barH, background: barH > 0 ? (meetsTarget ? "#3a5a3a" : "#2a3a2a") : "transparent", border: `1px solid ${C.border}`, transition: "height 0.3s ease" }} />
                        </div>
                        <Label style={{ fontSize: 8, color: C.textDim }}>{DAYS_SHORT[i]}</Label>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                <Label style={{ fontSize: 8, color: C.textDim }}>{totalMins} / 150 min this week</Label>
                {avgHR ? (<><Label style={{ fontSize: 8, color: C.textDim }}>·</Label><Label style={{ fontSize: 8, color: C.textDim }}>avg {avgHR} bpm</Label></>) : null}
              </div>
            </>
          );
        })()}
      </div>

      {/* Work */}
      <div style={card}>
        <Label>Work (hrs)</Label>
        <div style={{ marginTop: 10 }}>
          <BarChart values={workVals} max={12} days={DAYS_SHORT} color="#2a2825" />
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
          {DAYS.map((day, i) => (
            <div key={day} style={{ flex: 1 }}>
              <input type="number" value={w.work?.[i] || ""} onChange={(e) => set(`work.${i}`, e.target.value)} min={0} max={16} step={0.5} style={numInputStyle} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 6 }}>
          <Label style={{ fontSize: 8, color: C.textDim }}>total {workVals.map(Number).reduce((a, b) => a + b, 0).toFixed(1)} hrs</Label>
        </div>
      </div>
    </div>
  );
}

function ReviewTab({ w, set }) {
  return (
    <div>
      <div style={card}>
        <Label>Week Rating</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} onClick={() => set("weekRating", n)} style={{
              flex: 1, height: 36,
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
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          {HABITS.map((habit) => {
            const done = (w.habits?.[habit] || []).filter(Boolean).length;
            return (
              <div key={habit} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Label style={{ fontSize: 9 }}>{habit}</Label>
                <div style={{ display: "flex", gap: 3 }}>
                  {Array(7).fill(0).map((_, i) => (
                    <div key={i} style={{ width: 8, height: 8, background: w.habits?.[habit]?.[i] ? C.accent : C.border }} />
                  ))}
                  <Label style={{ fontSize: 9, marginLeft: 6 }}>{done}/7</Label>
                </div>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <Label style={{ fontSize: 9 }}>Avg Sleep</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {(() => { const vals = (w.sleep || []).map(Number).filter(Boolean); return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) + " hrs" : "—"; })()}
            </Label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Label style={{ fontSize: 9 }}>Avg Steps</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>
              {(() => { const vals = (w.steps || []).map(Number).filter(Boolean); return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length).toLocaleString() : "—"; })()}
            </Label>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <Label style={{ fontSize: 9 }}>Total Work</Label>
            <Label style={{ fontSize: 9, color: C.textBright }}>{(w.work || []).map(Number).reduce((a, b) => a + b, 0).toFixed(1)} hrs</Label>
          </div>
        </div>
      </div>

      <div style={card}>
        <Label>Notes</Label>
        <textarea value={w.notes || ""} onChange={(e) => set("notes", e.target.value)} rows={5} style={{
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
      const raw = localStorage.getItem("wplanner_" + weekKey);
      if (raw) setData(JSON.parse(raw));
      setSyncStatus("ok");
    } catch (e) {
      setSyncStatus({ error: e.message });
    }
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
        <p style={{ fontSize: 10, color: C.textDim, fontFamily: "'Space Mono', monospace", marginTop: 10, lineHeight: 1.6 }}>
          One private Gist acts as a single source of truth across all devices. Your PAT stays in localStorage — it never enters the Gist.
        </p>
      </div>

      <div style={card}>
        <Label>Configuration</Label>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <Label style={{ fontSize: 8, display: "block", marginBottom: 6 }}>GitHub Personal Access Token (gist scope)</Label>
            <input
              type="password" value={pat}
              onChange={(e) => setPat(e.target.value)}
              onBlur={() => persistConfig({ pat })}
              placeholder="ghp_xxxxxxxxxxxx"
              style={{ width: "100%", background: C.fill, border: `1px solid ${C.border}`, color: C.textBright, fontSize: 11, fontFamily: "'Space Mono', monospace", padding: "8px 10px", outline: "none", caretColor: C.accent }}
            />
          </div>
          <div>
            <Label style={{ fontSize: 8, display: "block", marginBottom: 6 }}>Gist ID (auto-filled after first push)</Label>
            <input
              type="text" value={gistId}
              onChange={(e) => setGistId(e.target.value)}
              onBlur={() => persistConfig({ gistId })}
              placeholder="leave blank to create a new Gist"
              style={{ width: "100%", background: C.fill, border: `1px solid ${C.border}`, color: C.textBright, fontSize: 11, fontFamily: "'Space Mono', monospace", padding: "8px 10px", outline: "none", caretColor: C.accent }}
            />
          </div>
        </div>
      </div>

      <div style={card}>
        <Label>Actions</Label>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button onClick={handlePush} disabled={busy} style={btnStyle(busy)}>↑ PUSH</button>
          <button onClick={handlePull} disabled={busy || !gistId} style={btnStyle(busy || !gistId)}>↓ PULL</button>
        </div>
        <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", marginTop: 10, lineHeight: 1.6 }}>
          Push writes all local week data to the Gist. Pull overwrites local data with the Gist. Always push before switching devices.
        </p>
        {statusText ? (
          <div style={{ marginTop: 12, padding: "8px 10px", border: `1px solid ${statusColor}`, color: statusColor, fontFamily: "'Space Mono', monospace", fontSize: 10 }}>
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
        {[
          { title: "Step 1 — Create a GitHub account (if needed)", body: "Go to github.com and sign up for a free account. If you already have one, skip to Step 2." },
          { title: "Step 2 — Generate a Personal Access Token (PAT)", body: "Go to github.com/settings/tokens → Generate new token (classic) → check only the gist scope → generate → copy it immediately (starts with ghp_)." },
          { title: "Step 3 — First push", body: "Paste your PAT above and tap away to save. Leave Gist ID blank. Tap ↑ PUSH — the app creates a private Gist and fills in the ID automatically." },
          { title: "Step 4 — Set up a second device", body: "Open the planner on the second device → Sync tab → paste the same PAT + the Gist ID → tap ↓ PULL." },
          { title: "Step 5 — Daily workflow", body: "Before switching devices: tap ↑ PUSH. After switching: tap ↓ PULL before editing. Last push wins — check the Last synced timestamp if unsure which device is ahead." },
        ].map(({ title, body }, i) => (
          <div key={i} style={{ marginTop: 16 }}>
            <Label style={{ fontSize: 8, color: C.textBright, display: "block", marginBottom: 6 }}>{title}</Label>
            <p style={{ fontSize: 9, color: C.textDim, fontFamily: "'Space Mono', monospace", lineHeight: 1.8 }}>{body}</p>
          </div>
        ))}
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
    <PrioritiesTab key="priorities" w={w} set={set} />,
    <HabitsTab key="habits" w={w} set={set} />,
    <StatsTab key="stats" w={w} set={set} />,
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
        <div style={{ padding: "16px 16px 0", borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "0.08em", color: C.textBright }}>WEEKLY PLANNER</div>
              <div style={{ display: "flex", gap: 16, marginTop: 4, alignItems: "center" }}>
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
        <div style={{
          display: "flex", borderBottom: `1px solid ${C.border}`,
          overflowX: "auto", flexShrink: 0,
          WebkitOverflowScrolling: "touch", scrollbarWidth: "none",
        }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)} style={{
              flexShrink: 0, minWidth: 58, padding: "10px 6px",
              background: "transparent", border: "none",
              borderBottom: i === tab ? `2px solid ${C.accent}` : "2px solid transparent",
              color: i === tab ? C.textBright : C.textDim,
              fontFamily: "'Space Mono', monospace", fontSize: 8,
              letterSpacing: "0.08em", cursor: "pointer", whiteSpace: "nowrap",
            }}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
          {tabContent[tab]}
        </div>
      </div>
    </>
  );
}
