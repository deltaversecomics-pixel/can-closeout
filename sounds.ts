type Vol = "mute" | "low" | "med" | "high";
const VOL_MAP: Record<Vol, number> = { mute: 0, low: 0.08, med: 0.16, high: 0.28 };

let ctx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function beep(kind: "key" | "add" | "del" | "restore", vol: Vol, tone: number) {
  const v = VOL_MAP[vol];
  if (v === 0) return;

  const c = getCtx();
  const o = c.createOscillator();
  const g = c.createGain();

  const base = 220 + tone * 30;
  const freq =
    kind === "key" ? base + 180 :
    kind === "add" ? base + 320 :
    kind === "del" ? base + 40 :
    base + 260;

  o.type = "square";
  o.frequency.value = freq;

  g.gain.value = v;

  o.connect(g);
  g.connect(c.destination);

  const now = c.currentTime;
  const dur = kind === "key" ? 0.03 : 0.06;
  o.start(now);
  o.stop(now + dur);
}
