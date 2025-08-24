import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";

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
  { id: "p9", name: "Abgnegplt", avatar: "/avatars/Abgnegplt.jpg", note: "" }
];

const EMPTY_BONUS = [35, 10, -10, -20]; // example default rank bonus (1st..4th)

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
  const [players, setPlayers] = useState(() => loadPersisted("mt_players", []));
  const [showSharkySelect, setShowSharkySelect] = useState(false);
  const [sharkySelected, setSharkySelected] = useState([]);
  const [playerScores, setPlayerScores] = useState(() => loadPersisted("mt_playerScores", Object.fromEntries(DEFAULT_PLAYERS.map(p => [p.id, 0]))));
  const [rounds, setRounds] = useState(() => loadPersisted("mt_rounds", []));
  const [rankBonus, setRankBonus] = useState(() => loadPersisted("mt_rankBonus", EMPTY_BONUS));
  const [topK, setTopK] = useState(() => loadPersisted("mt_topK", 4));
  // ...group feature removed...

  // UI state
  const [showRoundDialog, setShowRoundDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // ...group feature removed...

  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerAvatar, setNewPlayerAvatar] = useState("");
  const newPlayerInputRef = React.useRef(null);
  // Persist
  useEffect(() => savePersisted("mt_players", players), [players]);
  useEffect(() => savePersisted("mt_playerScores", playerScores), [playerScores]);
  useEffect(() => savePersisted("mt_rounds", rounds), [rounds]);
  useEffect(() => savePersisted("mt_rankBonus", rankBonus), [rankBonus]);
  useEffect(() => savePersisted("mt_topK", topK), [topK]);
  // ...group feature removed...

  const playersById = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players]);

  // ...group feature removed...

  // --------------- Handlers ---------------
  function resetAll() {
    if (!window.confirm("确定要清空所有数据吗？此操作不可撤销。")) return;
    try {
      ["mt_playerScores", "mt_rounds"].forEach(k => localStorage.removeItem(k));
    } catch {}
    setPlayerScores(Object.fromEntries(players.map(p => [p.id, 0])));
    setRounds([]);
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

  // ...group feature removed...

  // ----------------- Dialogs -----------------
  function RoundDialog() {
    const [seat, setSeat] = useState(["", "", "", ""]); // E,S,W,N player ids
    const [raw, setRaw] = useState(["", "", "", ""]); // raw points (e.g., 34500)
    const [error, setError] = useState("");

    function validate() {
      // ensure 4 distinct players and valid numbers totaling exactly 100000
      const unique = new Set(seat.filter(Boolean));
      if (unique.size !== 4) return "请选择 4 位不同的玩家 (东南西北有且仅各一人)。";
      const nums = raw.map(v => Number(v));
      if (nums.some(n => !Number.isFinite(n))) return "请输入有效的分数(整数)。";
      const sum = nums.reduce((a, b) => a + b, 0);
      if (sum !== 100000) return `分数总和必须为 100000，目前为 ${sum}`;
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
    const playerOptions = players.map(p => ({ value: p.id, label: p.name }));

    const selectStyles = {
      menuPortal: base => ({
        ...base,
        zIndex: 9999,
        maxHeight: 300,
      }),
      menu: base => ({
        ...base,
        zIndex: 9999,
        maxHeight: 300,
      }),
    };

    return (
      <Modal title="录入一局" onClose={() => setShowRoundDialog(false)}>
        <div className="space-y-4">
          {seatNames.map((label, i) => (
            <div key={i} className="grid grid-cols-3 gap-3 items-center">
              <div className="text-sm text-gray-600">{label}：</div>
              <Select
                className="col-span-1"
                options={playerOptions}
                value={playerOptions.find(opt => opt.value === seat[i]) || null}
                onChange={opt => {
                  setSeat(s => {
                    const copy = [...s];
                    copy[i] = opt ? opt.value : "";
                    return copy;
                  });
                }}
                isClearable
                placeholder="选择玩家"
                menuPlacement="auto"
                menuPortalTarget={document.body}
                menuPosition="fixed"
                styles={selectStyles}
              />
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
  const [tempTopK, setTempTopK] = useState(topK.toString());

    function onSave() {
      const vals = tempBonus.map(Number);
      if (vals.some(v => !Number.isFinite(v))) return alert("请输入有效的数字");
  const k = Number(tempTopK);
  if (!Number.isFinite(k) || k < 1 || k > players.length) return alert("请输入有效的Top K (1~玩家数)");
  setRankBonus(vals);
  setTopK(k);
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
      setPlayers([]);
      setPlayerScores({});
      setRounds([]);
      setRankBonus(EMPTY_BONUS);
  setTopK(4);
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
          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="text-sm text-gray-600">排行榜Top K：</div>
            <input
              className="border rounded-xl px-3 py-2"
              value={tempTopK}
              onChange={e => {
                const v = e.target.value.replace(/[^\d]/g, "");
                setTempTopK(v);
              }}
              placeholder="Top K"
            />
          </div>
          <div className="text-xs text-gray-500">说明：一局中每位玩家最终得分 = (原始点数 - 30000)/1000 + 对应名次加减分。排行榜Top K用于分割线显示。</div>
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

  // ...group feature removed...

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
    // Use topK for player leaderboard
    const k = isGroup ? 2 : topK;
    return (
      <div className="border rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">{title}</div>
          <div className="text-xs text-gray-500">单位：分</div>
        </div>
        <div>
          {isGroup
            ? items.slice(0,2).map((it, idx) => (
                <GroupRow key={it.key} index={idx+1} it={it} highlight />
              ))
            : items.slice(0,k).map((it, idx) => (
                <Row key={it.key} index={idx+1} it={it} highlight />
              ))}
          <div className="my-2 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
          {isGroup
            ? items.slice(2).map((it, i) => (
                <GroupRow key={it.key} index={i+3} it={it} />
              ))
            : items.slice(k).map((it, i) => (
                <Row key={it.key} index={i+k+1} it={it} />
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

  // ...group feature removed...

  // --------------- Derived leaderboards ---------------
  const playerBoard = useMemo(() => {
    return players
      .map(p => ({ key: p.id, name: p.name, avatar: p.avatar, score: playerScores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);
  }, [players, playerScores]);

  // Add Player Modal UI state

  function handleAddPlayer() {
    setShowAddPlayer(true);
    setNewPlayerName("");
    setNewPlayerAvatar("");
    setTimeout(() => {
      if (newPlayerInputRef.current) newPlayerInputRef.current.focus();
    }, 0);
  }

  // SHA-256 hash of the password (replace with your own hash)
  const SHARKY_HASH = "67a205d59cd42fee958c8f6e3c383c82f299e5acff92ab6583794dfb50a9706d";

  async function checkPassword(input) {
    const encoder = new TextEncoder();
    const data = encoder.encode(input.trim());
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === SHARKY_HASH;
  }

  async function handleConfirmAddPlayer() {
    if (!newPlayerName.trim()) return;
    if (await checkPassword(newPlayerName.trim())) {
      setShowAddPlayer(false);
      setShowSharkySelect(true);
      setSharkySelected([]);
      return;
    }
    const id = `p${Date.now()}`;
    setPlayers(prev => {
      const next = [...prev, { id, name: newPlayerName.trim(), avatar: newPlayerAvatar, note: "" }];
      setTopK(Math.ceil(next.length / 2));
      return next;
    });
    setPlayerScores(prev => ({ ...prev, [id]: 0 }));
    setShowAddPlayer(false);
  }

  // --------------- Page -----------------
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-6xl mx-auto">
      {/* Sharky special page: select default players to add */}
      {showSharkySelect && (
        <Modal title="选择默认玩家加入比赛" onClose={() => { setShowSharkySelect(false); setSharkySelected([]); }}>
          <div className="flex flex-col gap-4 items-center">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {DEFAULT_PLAYERS.map(p => {
                const selected = sharkySelected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    className={cls(
                      "border rounded-2xl p-4 flex flex-col items-center hover:bg-gray-50 transition",
                      selected ? "bg-blue-100 border-blue-500" : ""
                    )}
                    onClick={() => {
                      setSharkySelected(sel =>
                        sel.includes(p.id)
                          ? sel.filter(id => id !== p.id)
                          : [...sel, p.id]
                      );
                    }}
                  >
                    {p.avatar ? (
                      <img src={p.avatar} alt={p.name} className="w-16 h-16 rounded-full object-cover mb-2" />
                    ) : (
                      <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mb-2">
                        <span className="text-lg font-semibold text-gray-600">{initials(p.name)}</span>
                      </div>
                    )}
                    <span className="font-medium">{p.name}</span>
                    {selected && <span className="mt-2 text-xs text-blue-600">已选择</span>}
                  </button>
                );
              })}
            </div>
            <button
              className={cls("mt-4 px-4 py-2 rounded-xl border", sharkySelected.length === 0 ? "opacity-50 cursor-not-allowed" : "")}
              disabled={sharkySelected.length === 0}
              onClick={() => {
                const selectedPlayers = DEFAULT_PLAYERS.filter(p => sharkySelected.includes(p.id));
                setPlayers(prev => {
                  const next = [...prev, ...selectedPlayers];
                  setTopK(Math.ceil(next.length / 2));
                  return next;
                });
                setPlayerScores(prev => {
                  const next = { ...prev };
                  for (const p of selectedPlayers) next[p.id] = 0;
                  return next;
                });
                setShowSharkySelect(false);
                setSharkySelected([]);
              }}
            >完成</button>
          </div>
        </Modal>
      )}
      <header className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-bold">麻将赛况追踪</h1>
        <div className="flex items-center gap-2">
          <SettingsButton />
          <AddRoundButton />
        </div>
      </header>

      {/* Players editor */}
      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {players.map(p => (
          <div key={p.id} className="border rounded-3xl p-4 relative">
            {/* Remove player button */}
            <button
              className="absolute top-2 right-2 w-7 h-7 rounded-full bg-red-100 text-red-700 flex items-center justify-center hover:bg-red-200"
              title="移除玩家"
              onClick={() => {
                if (window.confirm(`确定要移除玩家 ${p.name} 吗？`)) {
                  setPlayers(prev => prev.filter(pl => pl.id !== p.id));
                  setPlayerScores(prev => {
                    const next = { ...prev };
                    delete next[p.id];
                    return next;
                  });
                }
              }}
            >✕</button>
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
        <div className="border-dashed border-2 rounded-3xl p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50" onClick={handleAddPlayer}>
          <span className="text-2xl">＋</span>
          <span className="text-sm mt-2">添加玩家</span>
        </div>
      </section>

      {/* Add Player Modal */}
      {showAddPlayer && (
        <Modal title="添加新玩家" onClose={() => setShowAddPlayer(false)}>
          <div className="flex flex-col items-center gap-4">
            <div className="flex flex-col items-center">
              <div
                className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center cursor-pointer mb-2 relative"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = 'image/*';
                  input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => {
                        setNewPlayerAvatar(ev.target.result);
                      };
                      reader.readAsDataURL(file);
                    }
                  };
                  input.click();
                }}
              >
                {newPlayerAvatar ? (
                  <img src={newPlayerAvatar} alt="avatar" className="w-20 h-20 rounded-full object-cover" />
                ) : (
                  <span className="text-4xl text-gray-400">＋</span>
                )}
                {!newPlayerAvatar && (
                  <span className="absolute inset-0 flex items-center justify-center text-4xl text-gray-400">＋</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mb-2">点击上传头像（可选）</div>
            </div>
            <input
              ref={newPlayerInputRef}
              autoFocus
              className="w-48 border rounded-xl px-3 py-2 text-center"
              placeholder="玩家名字"
              value={newPlayerName}
              onChange={e => setNewPlayerName(e.target.value)}
            />
            <div className="flex gap-3 mt-2">
              <button className="px-4 py-2 rounded-xl border" onClick={() => setShowAddPlayer(false)}>取消</button>
              <button className="px-4 py-2 rounded-xl bg-black text-white" onClick={handleConfirmAddPlayer}>添加</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Boards */}
      <section className="grid gap-4 md:grid-cols-1">
        <Leaderboard title="个人积分榜" items={playerBoard} />
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
    </div>
  );
}
