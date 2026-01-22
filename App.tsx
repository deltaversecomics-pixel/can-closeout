import { useEffect, useMemo, useState } from "react";
import "./app.css";
import {
  db,
  uid,
  type Entry,
  type Session,
  dollarsToCents,
  centsToDollars,
  roundToWholeDollars,
  type PaymentType,
  type PricingType,
  type BoardAdjType
} from "./db";
import { beep } from "./sounds";

type Vol = "mute" | "low" | "med" | "high";
type Hand = "right" | "left";

function todayTitle() {
  return new Date().toDateString();
}

// Credit card rule (FINAL): per trip, compute 10% fee, truncate fee to cents, subtract.
// Example: $23.65 -> fee = $2.365 -> $2.36 -> after = $21.29
function afterFeeCents(fareCents: number) {
  const feeCents = Math.floor(fareCents * 0.10);
  return fareCents - feeCents;
}

export default function App() {
  const [mode, setMode] = useState<"entry" | "closeout" | "trash" | "settings">("entry");

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [trash, setTrash] = useState<Entry[]>([]);

  const [paymentType, setPaymentType] = useState<PaymentType>("cash");
  const [pricingType, setPricingType] = useState<PricingType>("metered");
  const [amount, setAmount] = useState<string>(""); // cash/account total OR card fare
  const [tip, setTip] = useState<string>(""); // card only
  const [tipMode, setTipMode] = useState(false);

  const [editing, setEditing] = useState<Entry | null>(null);
  const [editFare, setEditFare] = useState<string>("");
  const [editTip, setEditTip] = useState<string>("");

  const [gasPaid, setGasPaid] = useState<string>("");
  const [boardAdjType, setBoardAdjType] = useState<BoardAdjType>("none");
  const [boardAdj, setBoardAdj] = useState<string>("");

  const [dark, setDark] = useState(true);

  const [vol, setVol] = useState<Vol>("med");
  const [tone, setTone] = useState(0);
  const [hand, setHand] = useState<Hand>("right");

  useEffect(() => {
    (async () => {
      const open = await db.sessions.where("closedAt").equals(null).first();
      if (open) setActiveSession(open);
      else {
        const s: Session = { id: uid("sess"), createdAt: Date.now(), closedAt: null, title: todayTitle() };
        await db.sessions.add(s);
        setActiveSession(s);
      }
    })();
  }, []);

  useEffect(() => {
    if (!activeSession) return;
    (async () => {
      const list = await db.entries
        .where("sessionId")
        .equals(activeSession.id)
        .and(e => e.trashedAt === null)
        .reverse()
        .sortBy("createdAt");
      setEntries(list.reverse());

      const tr = await db.entries
        .where("sessionId")
        .equals(activeSession.id)
        .and(e => e.trashedAt !== null)
        .reverse()
        .sortBy("createdAt");
      setTrash(tr.reverse());
    })();
  }, [activeSession]);

  useEffect(() => {
    if (paymentType === "account") setPricingType("flat");
    else setPricingType("metered");

    if (paymentType !== "card") {
      setTip("");
      setTipMode(false);
    }
  }, [paymentType]);

  function doBeep(kind: "key" | "add" | "del" | "restore") {
    beep(kind, vol, tone);
  }

  function tapKey(k: string) {
    doBeep("key");
    if (k === "C") {
      setAmount("");
      setTip("");
      return;
    }
    if (k === "⌫") {
      if (paymentType === "card" && tipMode) setTip(prev => prev.slice(0, -1));
      else setAmount(prev => prev.slice(0, -1));
      return;
    }
    if (k === ".") {
      if (paymentType === "card" && tipMode) setTip(prev => (prev.includes(".") ? prev : (prev || "0") + "."));
      else setAmount(prev => (prev.includes(".") ? prev : (prev || "0") + "."));
      return;
    }
    // digits
    if (paymentType === "card" && tipMode) setTip(prev => (prev + k).slice(0, 10));
    else setAmount(prev => (prev + k).slice(0, 10));
  }

  async function addEntry() {
    if (!activeSession) return;

    const fareC = dollarsToCents(amount);
    if (fareC === null) return;

    let tipC = 0;
    if (paymentType === "card") {
      const t = dollarsToCents(tip || "0");
      if (t === null) return;
      tipC = t;
    }

    const totalC = paymentType === "card" ? fareC + tipC : fareC;

    const e: Entry = {
      id: uid("ent"),
      sessionId: activeSession.id,
      createdAt: Date.now(),
      paymentType,
      pricingType,
      fareCents: fareC,
      tipCents: tipC,
      totalCents: totalC,
      trashedAt: null
    };

    await db.entries.add(e);
    setEntries(prev => [...prev, e]);
    setAmount("");
    setTip("");
    setTipMode(false);
    doBeep("add");
  }

  function openEdit(e: Entry) {
    setEditing(e);
    setEditFare(centsToDollars(e.fareCents).replace("$", ""));
    setEditTip(centsToDollars(e.tipCents).replace("$", ""));
  }

  async function saveEdit() {
    if (!editing) return;
    const fareC = dollarsToCents(editFare);
    if (fareC === null) return;
    const tipC = editing.paymentType === "card" ? (dollarsToCents(editTip || "0") ?? 0) : 0;
    const totalC = editing.paymentType === "card" ? fareC + tipC : fareC;

    const updated: Entry = { ...editing, fareCents: fareC, tipCents: tipC, totalCents: totalC };
    await db.entries.put(updated);
    setEntries(prev => prev.map(x => (x.id === updated.id ? updated : x)));
    setEditing(null);
  }

  async function trashEntry(e: Entry) {
    const updated = { ...e, trashedAt: Date.now() };
    await db.entries.put(updated);
    setEntries(prev => prev.filter(x => x.id !== e.id));
    setTrash(prev => [...prev, updated]);
    doBeep("del");
  }

  async function restoreEntry(e: Entry) {
    const updated = { ...e, trashedAt: null };
    await db.entries.put(updated);
    setTrash(prev => prev.filter(x => x.id !== e.id));
    setEntries(prev => [...prev, updated].sort((a, b) => a.createdAt - b.createdAt));
    doBeep("restore");
  }

  async function permanentDelete(e: Entry) {
    await db.entries.delete(e.id);
    setTrash(prev => prev.filter(x => x.id !== e.id));
    doBeep("del");
  }

  const totals = useMemo(() => {
    const all = entries;
    const gross = all.reduce((sum, e) => sum + e.totalCents, 0);

    const cardEntries = all.filter(e => e.paymentType === "card");
    const cardFare = cardEntries.reduce((sum, e) => sum + e.fareCents, 0);
    const cardTip = cardEntries.reduce((sum, e) => sum + e.tipCents, 0);

    const accounts = all.filter(e => e.paymentType === "account").reduce((sum, e) => sum + e.totalCents, 0);

    const ccAfterFee = cardEntries.reduce((sum, e) => sum + afterFeeCents(e.fareCents), 0);

    return { gross, cardFare, cardTip, accounts, ccAfterFee, tripCount: all.length };
  }, [entries]);

  const closeoutCalc = useMemo(() => {
    const gross = totals.gross;

    const gasPaidC = dollarsToCents(gasPaid || "0") ?? 0;
    const gasCap = Math.floor(gross * 0.20);
    const gasApplied = Math.min(gasPaidC, gasCap);
    const gasOverCap = Math.max(0, gasPaidC - gasApplied);

    const totalAfterGas = gross - gasApplied;

    // Boss line: round half to whole dollars using standard rounding.
    const halfRoundedWhole = roundToWholeDollars(Math.round(totalAfterGas / 2)); // safe integer cents

    // CCs/Accts: card fares after fee + accounts. Tips excluded.
    const ccsAccts = totals.ccAfterFee + totals.accounts;

    const net = halfRoundedWhole - ccsAccts;

    const boardAdjC = dollarsToCents(boardAdj || "0") ?? 0;
    let final = net;
    if (boardAdjType === "credit") final = net - boardAdjC;
    if (boardAdjType === "short") final = net + boardAdjC;

    const owedDriver = final < 0 ? -final : 0;
    const owedCompany = final > 0 ? final : 0;

    return {
      gross,
      gasPaidC,
      gasApplied,
      gasOverCap,
      totalAfterGas,
      halfRoundedWhole,
      ccsAccts,
      net,
      final,
      owedDriver,
      owedCompany
    };
  }, [totals, gasPaid, boardAdj, boardAdjType]);

  async function closeSession() {
    if (!activeSession) return;
    const now = Date.now();
    await db.sessions.put({ ...activeSession, closedAt: now });

    const s: Session = { id: uid("sess"), createdAt: now, closedAt: null, title: todayTitle() };
    await db.sessions.add(s);

    setActiveSession(s);
    setEntries([]);
    setTrash([]);
    setGasPaid("");
    setBoardAdjType("none");
    setBoardAdj("");
    setMode("entry");
  }

  const themeClass = dark ? "theme-dark" : "theme-light";

  return (
    <div className={`root ${themeClass}`}>
      <DeviceShell title="CAB CLOSEOUT" dark={dark}>
        <TopBar mode={mode} setMode={setMode} dark={dark} setDark={setDark} />

        {mode === "entry" && (
          <>
            <ScreenBlock>
              <div className="readout">
                <label>{paymentType === "card" ? (tipMode ? "TIP" : "FARE") : "AMOUNT"}</label>
                <BigLCD value={paymentType === "card" ? (tipMode ? tip : amount) : amount} />
              </div>

              <div className="row">
                <SegButton active={paymentType === "cash"} onClick={() => setPaymentType("cash")}>CASH</SegButton>
                <SegButton active={paymentType === "card"} onClick={() => setPaymentType("card")}>CARD</SegButton>
                <SegButton active={paymentType === "account"} onClick={() => setPaymentType("account")}>ACCT</SegButton>
              </div>

              <div className="row">
                <SegButton active={pricingType === "metered"} onClick={() => setPricingType("metered")}>METERED</SegButton>
                <SegButton active={pricingType === "flat"} onClick={() => setPricingType("flat")}>FLAT</SegButton>
                {paymentType === "card" ? (
                  <SegButton active={tipMode} onClick={() => setTipMode(v => !v)}>TIP MODE</SegButton>
                ) : (
                  <div className="spacer" />
                )}
              </div>

              {paymentType === "card" && (
                <div className="cardTotals">
                  <div>Fare: <b>{centsToDollars(dollarsToCents(amount || "0") ?? 0)}</b></div>
                  <div>Tip: <b>{centsToDollars(dollarsToCents(tip || "0") ?? 0)}</b></div>
                  <div>Total: <b>{centsToDollars((dollarsToCents(amount || "0") ?? 0) + (dollarsToCents(tip || "0") ?? 0))}</b></div>
                </div>
              )}

              <div className="stats">
                <div>GROSS: <b>{centsToDollars(totals.gross)}</b></div>
                <div>TRIPS: <b>{totals.tripCount}</b></div>
              </div>
            </ScreenBlock>

            <Keypad onKey={tapKey} />
            <div className={`addRow ${hand === "right" ? "righty" : "lefty"}`}>
              <button className="addBtn" onClick={addEntry}>ADD</button>
              <button className="miniBtn" onClick={() => setHand(h => (h === "right" ? "left" : "right"))}>
                {hand === "right" ? "RIGHT" : "LEFT"}
              </button>
              <button className="miniBtn" onClick={() => setTone(t => (t + 1) % 6)}>TONE</button>
              <select className="miniBtn" value={vol} onChange={e => setVol(e.target.value as Vol)}>
                <option value="mute">MUTE</option>
                <option value="low">LOW</option>
                <option value="med">MED</option>
                <option value="high">HIGH</option>
              </select>
            </div>

            <ListBlock title="ENTRIES">
              {entries.length === 0 ? (
                <div className="muted">No entries yet.</div>
              ) : (
                <ul className="list">
                  {entries.map(e => (
                    <li key={e.id} className="listItem">
                      <button className="listTap" onClick={() => openEdit(e)}>
                        <span className="tag">{e.paymentType.toUpperCase()}</span>
                        <span className="amt">{centsToDollars(e.totalCents)}</span>
                      </button>
                      <button className="del" onClick={() => trashEntry(e)}>DEL</button>
                    </li>
                  ))}
                </ul>
              )}
            </ListBlock>
          </>
        )}

        {mode === "closeout" && (
          <>
            <ScreenBlock>
              <div className="closeInputs">
                <div className="field">
                  <label>GAS PAID</label>
                  <input value={gasPaid} onChange={e => setGasPaid(e.target.value)} placeholder="26.33" inputMode="decimal" />
                </div>
                <div className="field">
                  <label>BOARD</label>
                  <select value={boardAdjType} onChange={e => setBoardAdjType(e.target.value as BoardAdjType)}>
                    <option value="none">None</option>
                    <option value="credit">Credit</option>
                    <option value="short">Short</option>
                  </select>
                </div>
                <div className="field">
                  <label>AMOUNT</label>
                  <input value={boardAdj} onChange={e => setBoardAdj(e.target.value)} placeholder="0.00" inputMode="decimal" />
                </div>
              </div>
            </ScreenBlock>

            <ListBlock title="CLOSEOUT (AUTO)">
              <table className="sheet">
                <tbody>
                  <Row label="Gross" v={centsToDollars(closeoutCalc.gross)} />
                  <Row label="Gas Paid" v={centsToDollars(closeoutCalc.gasPaidC)} />
                  <Row label="Gas Applied (cap 20%)" v={centsToDollars(closeoutCalc.gasApplied)} />
                  <Row label="Gas Over Cap" v={centsToDollars(closeoutCalc.gasOverCap)} />
                  <Row label="Total" v={centsToDollars(closeoutCalc.totalAfterGas)} />
                  <Row label="50% (boss rounded)" v={centsToDollars(closeoutCalc.halfRoundedWhole)} />
                  <Row label="CC’s/Accts" v={centsToDollars(closeoutCalc.ccsAccts)} />
                  <Row label="Net" v={centsToDollars(closeoutCalc.net)} />
                  <Row label="Credit/Short" v={`${boardAdjType.toUpperCase()} ${centsToDollars(dollarsToCents(boardAdj || "0") ?? 0)}`} />
                  <Row label="Final" v={centsToDollars(closeoutCalc.final)} />
                  <Row label="Owed Driver" v={centsToDollars(closeoutCalc.owedDriver)} />
                  <Row label="Owed Company" v={centsToDollars(closeoutCalc.owedCompany)} />
                </tbody>
              </table>

              <div className="note">
                CC fee rule: per card fare, take 10% fee, truncate fee to cents, subtract. Tips excluded from CC’s/Accts.
              </div>
            </ListBlock>

            <div className="closeRow">
              <button className="miniBtn" onClick={closeSession}>CLOSE SESSION</button>
            </div>
          </>
        )}

        {mode === "trash" && (
          <ListBlock title="TRASH">
            {trash.length === 0 ? (
              <div className="muted">Trash is empty.</div>
            ) : (
              <ul className="list">
                {trash.map(e => (
                  <li key={e.id} className="listItem">
                    <span className="tag">{e.paymentType.toUpperCase()}</span>
                    <span className="amt">{centsToDollars(e.totalCents)}</span>
                    <button className="miniBtn" onClick={() => restoreEntry(e)}>RESTORE</button>
                    <button className="del" onClick={() => permanentDelete(e)}>PURGE</button>
                  </li>
                ))}
              </ul>
            )}
          </ListBlock>
        )}

        {mode === "settings" && (
          <ListBlock title="SETTINGS">
            <div className="row">
              <button className="miniBtn" onClick={() => setDark(d => !d)}>{dark ? "DARK" : "LIGHT"}</button>
              <button className="miniBtn" onClick={() => setTone(t => (t + 1) % 6)}>CYCLE TONE</button>
              <select className="miniBtn" value={vol} onChange={e => setVol(e.target.value as Vol)}>
                <option value="mute">MUTE</option>
                <option value="low">LOW</option>
                <option value="med">MED</option>
                <option value="high">HIGH</option>
              </select>
            </div>
          </ListBlock>
        )}

        {editing && (
          <div className="modal">
            <div className="modalCard">
              <div className="modalTitle">EDIT ENTRY</div>
              <div className="field">
                <label>Fare</label>
                <input value={editFare} onChange={e => setEditFare(e.target.value)} inputMode="decimal" />
              </div>
              {editing.paymentType === "card" && (
                <div className="field">
                  <label>Tip</label>
                  <input value={editTip} onChange={e => setEditTip(e.target.value)} inputMode="decimal" />
                </div>
              )}
              <div className="modalRow">
                <button className="miniBtn" onClick={() => setEditing(null)}>CANCEL</button>
                <button className="addBtn" onClick={saveEdit}>SAVE</button>
              </div>
            </div>
          </div>
        )}
      </DeviceShell>
    </div>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return (
    <tr>
      <td className="k">{label}</td>
      <td className="v">{v}</td>
    </tr>
  );
}

function TopBar(props: { mode: string; setMode: (m: any) => void; dark: boolean; setDark: (v: any) => void }) {
  const { mode, setMode, dark, setDark } = props;
  return (
    <div className="topbar">
      <button className={`tab ${mode === "entry" ? "on" : ""}`} onClick={() => setMode("entry")}>ENTRY</button>
      <button className={`tab ${mode === "closeout" ? "on" : ""}`} onClick={() => setMode("closeout")}>CLOSEOUT</button>
      <button className={`tab ${mode === "trash" ? "on" : ""}`} onClick={() => setMode("trash")}>TRASH</button>
      <button className={`tab ${mode === "settings" ? "on" : ""}`} onClick={() => setMode("settings")}>SET</button>
      <button className="tab" onClick={() => setDark((d: boolean) => !d)}>{dark ? "DARK" : "LIGHT"}</button>
    </div>
  );
}

function DeviceShell({ title, children, dark }: { title: string; children: any; dark: boolean }) {
  return (
    <div className={`device ${dark ? "d" : "l"}`}>
      <div className="bezel">
        <div className="brand">{title}</div>
        <div className="screenWindow">
          <div className="screenInner">{children}</div>
        </div>
        <div className="fakeButtons">
          <div className="pill" />
          <div className="pill" />
          <div className="pill" />
        </div>
      </div>
    </div>
  );
}

function ScreenBlock({ children }: { children: any }) {
  return <div className="screenBlock">{children}</div>;
}

function ListBlock({ title, children }: { title: string; children: any }) {
  return (
    <div className="listBlock">
      <div className="blockTitle">{title}</div>
      {children}
    </div>
  );
}

function SegButton({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: any }) {
  return (
    <button className={`segBtn ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ["1","2","3","4","5","6","7","8","9",".","0","⌫","C"];
  return (
    <div className="keypad">
      {keys.map(k => (
        <button key={k} className={`key ${k === "C" ? "wide" : ""}`} onClick={() => onKey(k)}>
          {k}
        </button>
      ))}
    </div>
  );
}

function BigLCD({ value }: { value: string }) {
  const show = value ? (value.startsWith("$") ? value : `$${value}`) : "$0.00";
  return <div className="lcd">{show}</div>;
}
