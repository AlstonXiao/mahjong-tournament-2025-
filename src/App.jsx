import React, { useEffect, useMemo, useState } from "react";

// Mahjong Tournament Tracker — 8 players
// Single-file React component. Uses TailwindCSS for styling.
// Features
// - Optional 2v2 grouping at start (locked once first round is saved)
// - Add Round dialog: pick 4 players in seat order (East, South, West, North)
// - Enter raw points; per-player delta = (raw - 30000)/1000 + rank bonus
// - Configurable rank bonuses in Settings
// - Live leaderboards for players and (if enabled) groups
// - Clear divider between Top 4 players and Top 4 groups
// - Round history and per-round breakdown
// - State persisted to localStorage
// - Developer self-tests to validate scoring logic

// ----------------------- Utility Types -----------------------
const DEFAULT_PLAYERS = [
  { id: "p1", name: "Sitaowex", avatar: "/avatars/sita.jpg", note: "" },
  { id: "p2", name: "Len Ozora", avatar: "/avatars/len.jpg", note: "" },
  { id: "p3", name: "TT", avatar: "/avatars/tt.jpg", note: "" },
  { id: "p4", name: "Lakto", avatar: "/avatars/lakto.jpg", note: "" },
  { id: "p5", name: "Tigris Scientificus", avatar: "/avatars/tiger.jpg", note: "" },
  { id: "p6", name: "okamipancake", avatar: "/avatars/lj.jpg", note: "" },
  { id: "p7", name: "Silveryena", avatar: "/avatars/sil.jpg", note: "" },
  { id: "p8", name: "Neon", avatar: "/avatars/neon.png", note: "" },
];

const EMPTY_BONUS = [20, 10, -10, -20]; // example default rank bonus (1st..4th)

// ----------------------- Helpers -----------------------
function cls(...arr) {
  return arr.filter(Boolean).join(" ");
}

function loadPersisted(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function savePersisted(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// Compute initials for placeholder avatar
function initials(name) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts[parts.length - 1]?.[0] ?? "";
  return (first + last).toUpperCase();
}

// ----------------------- Pure Logic (also used by tests) -----------------------
/**
 * Compute per-player base/bonus/delta from raw scores and rank bonuses.
 * @param {Array<{pid:string, raw:number}>} seatWithRaw - 4 entries for E,S,W,N in order
 * @param {number[]} rankBonus - length 4, for ranks 1..4
 */
function computeRoundDeltas(seatWithRaw, rankBonus) {
  // Stable sort by raw descending to get ranks
  const sorted = [...seatWithRaw].sort((a, b) => b.raw - a.raw);
  const rankIndexByPid = Object.fromEntries(sorted.map((x, i) => [x.pid, i])); // 0..3
  return seatWithRaw.map(({ pid, raw }) => {
    const base = (raw - 30000) / 1000;
    const bonus = rankBonus[rankIndexByPid[pid]] ?? 0;
    return { pid, delta: base + bonus, base, bonus, raw };
  });
}

// ----------------------- Main Component -----------------------
export default function MahjongTournamentTracker() {
  // Core state
  const [players, setPlayers] = useState(() => loadPersisted("mt_players", DEFAULT_PLAYERS));
  const [playerScores, setPlayerScores] = useState(() => loadPersisted("mt_playerScores", Object.fromEntries(DEFAULT_PLAYERS.map(p => [p.id, 0]))));
  const [rounds, setRounds] = useState(() => loadPersisted("mt_rounds", []));
  const [rankBonus, setRankBonus] = useState(() => loadPersisted("mt_rankBonus", EMPTY_BONUS));
  const [groupsEnabled, setGroupsEnabled] = useState(() => loadPersisted("mt_groupsEnabled", false));
  const [groups, setGroups] = useState(() => loadPersisted("mt_groups", [
    { id: "g1", name: "Group A", members: [] },
    { id: "g2", name: "Group B", members: [] },
    { id: "g3", name: "Group C", members: [] },
    { id: "g4", name: "Group D", members: [] },
  ]));

  // UI state
  const [showRoundDialog, setShowRoundDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGroupSetup, setShowGroupSetup] = useState(false);

  // Persist
  useEffect(() => savePersisted("mt_players", players), [players]);
  useEffect(() => savePersisted("mt_playerScores", playerScores), [playerScores]);
  useEffect(() => savePersisted("mt_rounds", rounds), [rounds]);
  useEffect(() => savePersisted("mt_rankBonus", rankBonus), [rankBonus]);
  useEffect(() => savePersisted("mt_groupsEnabled", groupsEnabled), [groupsEnabled]);
  useEffect(() => savePersisted("mt_groups", groups), [groups]);

  const playersById = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players]);
  const anyRounds = rounds.length > 0;

  // --------------- Derived: Group scores ---------------
  const groupScores = useMemo(() => {
    if (!groupsEnabled) return [];
    return groups.map(g => ({
      id: g.id,
      name: g.name,
      members: g.members,
      score: g.members.reduce((acc, pid) => acc + (playerScores[pid] || 0), 0),
    }));
  }, [groupsEnabled, groups, playerScores]);

  // --------------- Handlers ---------------
  function resetAll() {
  if (!window.confirm("确定要清空所有数据吗？此操作不可撤销。")) return;

    // Clear persisted keys first to avoid stale flicker
    try {
      ["mt_playerScores", "mt_rounds", "mt_groupsEnabled", "mt_groups"].forEach(k => localStorage.removeItem(k));
    } catch {}

    // Reset runtime state: scores, rounds, and ALSO grouping state
    setPlayerScores(Object.fromEntries(players.map(p => [p.id, 0])));
    setRounds([]);
    setGroupsEnabled(false);
    setGroups([
      { id: "g1", name: "Group A", members: [] },
      { id: "g2", name: "Group B", members: [] },
      { id: "g3", name: "Group C", members: [] },
      { id: "g4", name: "Group D", members: [] },
    ]);
  }

  function handleUpdatePlayer(id, patch) {
    setPlayers(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  }

  // ----------------- Round Logic -----------------
  function AddRoundButton() {
    return (
      <button
        onClick={() => setShowRoundDialog(true)}
        className="px-4 py-2 rounded-2xl shadow font-medium border hover:shadow-md"
      >
        + 录入一局
      </button>
    );
  }

  function SettingsButton() {
    return (
      <button
        onClick={() => setShowSettings(true)}
        className="px-3 py-2 rounded-2xl border text-sm hover:shadow"
      >
        设置
      </button>
    );
  }

  function GroupSetupButton() {
    const disabled = anyRounds; // lock grouping after games start
    return (
      <button
        onClick={() => setShowGroupSetup(true)}
        disabled={disabled}
        className={cls(
          "px-3 py-2 rounded-2xl border text-sm",
          disabled ? "opacity-50 cursor-not-allowed" : "hover:shadow"
        )}
      >
        {groupsEnabled ? "调整分组" : "分组(可选)"}
      </button>
    );
  }

  // ----------------- Dialogs -----------------
  function RoundDialog() {
    const [seat, setSeat] = useState(["", "", "", ""]); // E,S,W,N player ids
    const [raw, setRaw] = useState(["", "", "", ""]); // raw points (e.g., 34500)
    const [error, setError] = useState("");

    function validate() {
      // ensure 4 distinct players and valid numbers totaling near 120000 (not required though)
      const unique = new Set(seat.filter(Boolean));
      if (unique.size !== 4) return "请选择 4 位不同的玩家 (东南西北有且仅各一人)。";
      const nums = raw.map(v => Number(v));
      if (nums.some(n => !Number.isFinite(n))) return "请输入有效的分数(整数)。";
      // Mahjong usually sums to 100k/120k depending rules; we don't enforce exact sum
      return "";
    }

    function onSave() {
      const msg = validate();
      if (msg) return setError(msg);

      // Determine ranks by raw (higher is better). Stable sort by raw desc.
      const seatWithRaw = seat.map((pid, idx) => ({ pid, raw: Number(raw[idx]), idx }));
      const deltas = computeRoundDeltas(seatWithRaw, rankBonus);

      // Commit to state
      setRounds(prev => [
        ...prev,
        {
          id: `r${Date.now()}`,
          at: new Date().toISOString(),
          seat: [...seat],
          raw: raw.map(Number),
          breakdown: deltas,
        },
      ]);

      setPlayerScores(prev => {
        const next = { ...prev };
        for (const d of deltas) next[d.pid] = (next[d.pid] || 0) + d.delta;
        return next;
      });

      setShowRoundDialog(false);
    }

    const seatNames = ["东", "南", "西", "北"];

    return (
      <Modal title="录入一局" onClose={() => setShowRoundDialog(false)}>
        <div className="space-y-4">
          {seatNames.map((label, i) => (
            <div key={i} className="grid grid-cols-3 gap-3 items-center">
              <div className="text-sm text-gray-600">{label}：</div>
              <select
                className="col-span-1 border rounded-xl px-3 py-2"
                value={seat[i]}
                onChange={(e) => {
                  const v = e.target.value;
                  setSeat(s => {
                    const copy = [...s];
                    copy[i] = v;
                    return copy;
                  });
                }}
              >
                <option value="">选择玩家</option>
                {players.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input
                className="col-span-1 border rounded-xl px-3 py-2"
                placeholder="该位原始点数"
                value={raw[i]}
                onChange={e => {
                  const v = e.target.value.replace(/[^\d-]/g, "");
                  setRaw(r => { const c = [...r]; c[i] = v; return c; });
                }}
              />
            </div>
          ))}

          {error && <div className="text-red-600 text-sm">{error}</div>}

          <div className="flex justify-end gap-3 pt-2">
            <button className="px-3 py-2 rounded-xl border" onClick={() => setShowRoundDialog(false)}>取消</button>
            <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={onSave}>保存</button>
          </div>
        </div>
      </Modal>
    );
  }

  function SettingsDialog() {
    const [tempBonus, setTempBonus] = useState(rankBonus.map(String));

    function onSave() {
      const vals = tempBonus.map(Number);
      if (vals.some(v => !Number.isFinite(v))) return alert("请输入有效的数字");
      setRankBonus(vals);
      setShowSettings(false);
    }

    function revertToDefault() {
      if (!window.confirm("确定要恢复到默认状态吗？此操作不可撤销。")) return;
      // Remove all persisted keys and reset all state to default
      try {
        [
          "mt_players",
          "mt_playerScores",
          "mt_rounds",
          "mt_rankBonus",
          "mt_groupsEnabled",
          "mt_groups"
        ].forEach(k => localStorage.removeItem(k));
      } catch {}
      setPlayers(DEFAULT_PLAYERS);
      setPlayerScores(Object.fromEntries(DEFAULT_PLAYERS.map(p => [p.id, 0])));
      setRounds([]);
      setRankBonus(EMPTY_BONUS);
      setGroupsEnabled(false);
      setGroups([
        { id: "g1", name: "Group A", members: [] },
        { id: "g2", name: "Group B", members: [] },
        { id: "g3", name: "Group C", members: [] },
        { id: "g4", name: "Group D", members: [] },
      ]);
      setShowSettings(false);
    }

    return (
      <Modal title="设置：位次加减分" onClose={() => setShowSettings(false)}>
        <div className="space-y-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="grid grid-cols-2 gap-3 items-center">
              <div className="text-sm text-gray-600">第 {i+1} 名加减分：</div>
              <input
                className="border rounded-xl px-3 py-2"
                value={tempBonus[i]}
                onChange={(e)=>{
                  const v = e.target.value.replace(/[^\d-]/g, "");
                  setTempBonus(arr=>{const c=[...arr]; c[i]=v; return c;});
                }}
              />
            </div>
          ))}

          <div className="text-xs text-gray-500">说明：一局中每位玩家最终得分 = (原始点数 - 30000)/1000 + 对应名次加减分。
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <button className="px-4 py-2 rounded-xl border" onClick={onSave}>保存</button>
            <button className="px-4 py-2 rounded-xl border" onClick={resetAll}>清空数据</button>
            <button className="px-4 py-2 rounded-xl border bg-red-100 text-red-700" onClick={revertToDefault}>恢复默认（清除所有数据）</button>
            <button className="px-4 py-2 rounded-xl border" onClick={()=>setShowSettings(false)}>取消</button>
          </div>
        </div>
      </Modal>
    );
  }

  function GroupSetupDialog() {
    const [enabled, setEnabled] = useState(groupsEnabled);
    const [draftGroups, setDraftGroups] = useState(groups);

    function toggleMember(gid, pid) {
      setDraftGroups(prev => prev.map(g => {
        if (g.id !== gid) return g;
        const exists = g.members.includes(pid);
        return { ...g, members: exists ? g.members.filter(x => x !== pid) : g.members.length < 2 ? [...g.members, pid] : g.members };
      }));
    }

    // Ensure uniqueness across groups
    function isPicked(pid, targetGid) {
      return draftGroups.some(g => g.id !== targetGid && g.members.includes(pid));
    }

    function onSave() {
      // Validate: each group up to 2 members; if enabled, require all 8 assigned across four groups?
      if (enabled) {
        const total = draftGroups.reduce((a, g) => a + g.members.length, 0);
        if (total !== 8) {
          return alert("启用分组时需要把 8 位选手分成 4 组，每组 2 人。");
        }
      }
      setGroupsEnabled(enabled);
      setGroups(draftGroups.map(g => ({ ...g, members: [...g.members] })));
      setShowGroupSetup(false);
    }

    return (
      <Modal title="分组设置（可选，开始后即锁定）" onClose={() => setShowGroupSetup(false)}>
        <div className="space-y-4 max-w-5xl mx-auto">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
            <span>启用 2 人一组（共 4 组）</span>
          </label>

          {/* Only show group selection if enabled is true */}
          {enabled && (
            <div className={cls("grid", enabled ? "grid-cols-2 md:grid-cols-4" : "grid-cols-1", "gap-4")}> 
              {draftGroups.map(g => (
                <div key={g.id} className="border rounded-2xl p-3">
                  <div className="font-medium mb-2">{g.name}</div>
                  <div className="flex flex-col gap-2">
                    {players.map(p => (
                      <label key={p.id} className={cls(
                        "flex items-center gap-2 text-sm",
                        isPicked(p.id, g.id) && !g.members.includes(p.id) ? "opacity-30" : ""
                      )}>
                        <input
                          type="checkbox"
                          disabled={isPicked(p.id, g.id)}
                          checked={g.members.includes(p.id)}
                          onChange={() => toggleMember(g.id, p.id)}
                        />
                        <AvatarSmall player={p} />
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-gray-500 mt-2">{g.members.length}/2 已选择</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button className="px-3 py-2 rounded-xl border" onClick={()=>setShowGroupSetup(false)}>取消</button>
            <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={onSave}>保存</button>
          </div>
        </div>
      </Modal>
    );
  }

  // ----------------- UI Subcomponents -----------------
  function Modal({ title, children, onClose }) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
        <div className="bg-white rounded-3xl shadow-xl w-full max-w-5xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div className="font-semibold">{title}</div>
            <button onClick={onClose} className="px-2 py-1 rounded-xl hover:bg-gray-100">✕</button>
          </div>
          <div className="p-5 overflow-y-auto max-h-[70vh]">{children}</div>
        </div>
      </div>
    );
  }

  function Avatar({ player, size = 10 }) {
    const avatar = player.avatar?.trim();
    const sizeCls = `w-${size} h-${size}`;
    return (
      <div className="flex items-center gap-3">
        {avatar ? (
          <img src={avatar} alt={player.name} className={cls("rounded-full object-cover", sizeCls)} />
        ) : (
          <div className={cls("rounded-full bg-gray-200 flex items-center justify-center", sizeCls)}>
            <span className="text-xs font-semibold text-gray-600">{initials(player.name)}</span>
          </div>
        )}
        <div className="leading-tight">
          <div className="font-medium">{player.name}</div>
          {player.note ? <div className="text-xs text-gray-500">{player.note}</div> : null}
        </div>
      </div>
    );
  }

  function AvatarSmall({ player }) {
    const avatar = player.avatar?.trim();
    return (
      <div className="flex items-center gap-2">
        {avatar ? (
          <img src={avatar} alt={player.name} className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
            <span className="text-[10px] font-semibold text-gray-600">{initials(player.name)}</span>
          </div>
        )}
        <span>{player.name}</span>
      </div>
    );
  }

  // Leaderboard rows with divider after top 4
  function Leaderboard({ items, title, isGroup }) {
    return (
      <div className="border rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-gray-500">单位：分</div>
        </div>
        <div>
          {/* Only first two groups can win in group leaderboard */}
          {isGroup
            ? items.slice(0,2).map((it, idx) => (
                <GroupRow key={it.key} index={idx+1} it={it} highlight />
              ))
            : items.slice(0,4).map((it, idx) => (
                <Row key={it.key} index={idx+1} it={it} highlight />
              ))}
          <div className="my-2 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
          {isGroup
            ? items.slice(2).map((it, i) => (
                <GroupRow key={it.key} index={i+3} it={it} />
              ))
            : items.slice(4).map((it, i) => (
                <Row key={it.key} index={i+5} it={it} />
              ))}
        </div>
      </div>
    );
  }

  function Row({ index, it, highlight }) {
    return (
      <div className={cls("flex items-center justify-between py-2 px-2 rounded-2xl", highlight ? "bg-gray-50" : "") }>
        <div className="flex items-center gap-3">
          <div className="w-6 text-right tabular-nums text-gray-500">{index}</div>
          {it.avatar ? (
            <img src={it.avatar} alt={it.name} className="w-8 h-8 rounded-full object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-[11px] font-semibold text-gray-600">{initials(it.name)}</span>
            </div>
          )}
          <div className="font-medium">{it.name}</div>
        </div>
        <div className="font-semibold tabular-nums">{it.score.toFixed(1)}</div>
      </div>
    );
  }

  function GroupRow({ index, it, highlight }) {
    return (
      <div className={cls("flex items-center justify-between py-2 px-2 rounded-2xl", highlight ? "bg-gray-50" : "") }>
        <div className="flex items-center gap-3">
          <div className="w-6 text-right tabular-nums text-gray-500">{index}</div>
          {/* Show avatars of group members together */}
          <div className="flex items-center gap-1">
            {it.members.map((m, i) => (
              m && m.avatar ? (
                <img key={m.id || i} src={m.avatar} alt={m.name} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div key={m.id || i} className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <span className="text-[11px] font-semibold text-gray-600">{initials(m.name || m)}</span>
                </div>
              )
            ))}
          </div>
          {/* Show names of group members together */}
          <div className="flex items-center gap-2 ml-2">
            {it.members.map((m, i) => (
              <span key={m.id || i} className="font-medium">{m.name || m}</span>
            ))}
          </div>
        </div>
        <div className="font-semibold tabular-nums">{it.score.toFixed(1)}</div>
      </div>
    );
  }

  // --------------- Derived leaderboards ---------------
  const playerBoard = useMemo(() => {
    return players
      .map(p => ({ key: p.id, name: p.name, avatar: p.avatar, score: playerScores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);
  }, [players, playerScores]);

  const groupBoard = useMemo(() => {
    if (!groupsEnabled) return [];
    return groupScores
      .map(g => ({
        key: g.id,
        members: g.members.map(pid => playersById[pid]),
        score: g.score
      }))
      .sort((a, b) => b.score - a.score);
  }, [groupsEnabled, groupScores, playersById]);

  // ----------------- Developer Self Tests -----------------
  // function runSelfTests() {
  //   const results = [];

  //   function assertAlmostEqual(name, a, b, eps = 1e-6) {
  //     const ok = Math.abs(a - b) <= eps;
  //     results.push(`${ok ? "✅" : "❌"} ${name}: ${a} ${ok ? "≈" : "≠"} ${b}`);
  //     return ok;
  //   }

  //   // Test 1: basic ranking and deltas
  //   const tb1 = [20, 10, -10, -20];
  //   const seat1 = [
  //     { pid: "A", raw: 45000 }, // rank 1
  //     { pid: "B", raw: 33000 }, // rank 2
  //     { pid: "C", raw: 25000 }, // rank 3
  //     { pid: "D", raw: 20000 }, // rank 4
  //   ];
  //   const out1 = computeRoundDeltas(seat1, tb1);
  //   assertAlmostEqual("T1.A base", out1[0].base, 15);
  //   assertAlmostEqual("T1.A delta", out1[0].delta, 35);
  //   assertAlmostEqual("T1.B delta", out1[1].delta, (33-30)/1 + 10); // 3 + 10 = 13
  //   assertAlmostEqual("T1.C delta", out1[2].delta, (25-30)/1 - 10); // -5 -10 = -15
  //   assertAlmostEqual("T1.D delta", out1[3].delta, (20-30)/1 - 20); // -10 -20 = -30

  //   // Test 2: ties keep original order (stable sort)
  //   const seat2 = [
  //     { pid: "E", raw: 30000 },
  //     { pid: "F", raw: 30000 },
  //     { pid: "G", raw: 28000 },
  //     { pid: "H", raw: 12000 },
  //   ];
  //   const out2 = computeRoundDeltas(seat2, tb1);
  //   // E should outrank F due to stable sort; base 0
  //   assertAlmostEqual("T2.E delta", out2[0].delta, 0 + 20);
  //   assertAlmostEqual("T2.F delta", out2[1].delta, 0 + 10);

  //   // Test 3: negative base values handled
  //   const seat3 = [
  //     { pid: "I", raw: 15000 },
  //     { pid: "J", raw: 14000 },
  //     { pid: "K", raw: 13000 },
  //     { pid: "L", raw: 12000 },
  //   ];
  //   const out3 = computeRoundDeltas(seat3, tb1);
  //   assertAlmostEqual("T3.I base", out3[0].base, -15);

  //   setTestOutput(results.join("\n"));
  //   return results.every(line => line.startsWith("✅"));
  // }

  // --------------- Page -----------------
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold">麻将赛况追踪</h1>
        <div className="flex items-center gap-2">
          <GroupSetupButton />
          <SettingsButton />
          <AddRoundButton />
        </div>
      </header>

      {/* Players editor */}
      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {players.map(p => (
          <div key={p.id} className="border rounded-3xl p-4">
            <div className="flex items-center justify-center mb-2">
              {/* AvatarLarge, clickable for upload, centered */}
              <div
                className="cursor-pointer"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        handleUpdatePlayer(p.id, { avatar: ev.target.result });
                      };
                      reader.readAsDataURL(file);
                    }
                  };
                  input.click();
                }}
              >
                {/* Larger avatar, no name */}
                {p.avatar ? (
                  <img src={p.avatar} alt={p.name} className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-xl font-semibold text-gray-600">{initials(p.name)}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 space-y-2">
              <input
                className="w-full border rounded-xl px-3 py-2"
                value={p.name}
                onChange={e => handleUpdatePlayer(p.id, { name: e.target.value })}
              />
            </div>
          </div>
        ))}
      </section>

      {/* Boards */}
      <section className={cls("grid gap-4", groupsEnabled ? "md:grid-cols-2" : "md:grid-cols-1") }>
        <Leaderboard title="个人积分榜 (Top 4 分割线)" items={playerBoard} />
        {groupsEnabled && <Leaderboard title="小组积分榜" items={groupBoard} isGroup />}
      </section>

      {/* Rounds history */}
      <section className="mt-6">
        <div className="font-semibold mb-3">对局历史</div>
        {rounds.length === 0 ? (
          <div className="text-sm text-gray-500">暂无数据，点击“录入一局”开始。</div>
        ) : (
          <div className="space-y-3">
            {rounds.slice().reverse().map((r, idx) => (
              <div key={r.id} className="border rounded-3xl p-4">
                <div className="flex items-center justify-between text-sm text-gray-500 mb-2">
                  <div>#{rounds.length - idx}</div>
                  <div>{new Date(r.at).toLocaleString()}</div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {r.breakdown.map((b, i) => {
                    const p = playersById[b.pid];
                    const seatName = ["东","南","西","北"][i];
                    return (
                      <div key={b.pid} className="flex items-center justify-between rounded-2xl bg-gray-50 p-3">
                        <div className="flex items-center gap-3">
                          <div className="text-xs text-gray-500 w-5">{seatName}</div>
                          <AvatarSmall player={p} />
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-500 tabular-nums">原始：{b.raw}</div>
                          <div className="font-semibold tabular-nums">增减：{b.delta.toFixed(1)} （基础 {b.base.toFixed(1)}，名次 {b.bonus.toFixed(1)}）</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showRoundDialog && <RoundDialog />}
      {showSettings && <SettingsDialog />}
      {showGroupSetup && <GroupSetupDialog />}
    </div>
  );
}
