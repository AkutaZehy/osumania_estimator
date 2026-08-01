import { describe, it, expect } from "vitest";
import { parseModsFromData } from "../src/tosu/mods.js";

function mods(data: Record<string, unknown>) {
  return parseModsFromData(data);
}

describe("parseModsFromData", () => {
  it("nomod: speedRate 1.0, no flags", () => {
    const r = mods({
      play: { mods: { checksum: "x", number: 0, name: "NM", array: [], rate: 1 } },
    });
    expect(r.speedRate).toBe(1.0);
    expect(r.odFlag).toBeNull();
    expect(r.cvtFlag).toBeNull();
    expect(r.hasModInfo).toBe(false);
    expect(r.hasExplicitNoMod).toBe(true);
  });

  it("stable DT (number bit 64): speedRate 1.5", () => {
    const r = mods({ play: { mods: { number: 64, name: "DT" } } });
    expect(r.speedRate).toBe(1.5);
    expect(r.modSignature).toBe("1.50000|none|none");
  });

  it("stable NC (number bit 512): speedRate 1.5", () => {
    const r = mods({ play: { mods: { number: 512, name: "NC" } } });
    expect(r.speedRate).toBe(1.5);
  });

  it("stable HT (number bit 256): speedRate 0.75", () => {
    const r = mods({ play: { mods: { number: 256, name: "HT" } } });
    expect(r.speedRate).toBe(0.75);
  });

  it("FL only (number bit 1024): speedRate stays 1.0 (FL bug regression)", () => {
    const r = mods({ play: { mods: { number: 1024, name: "FL" } } });
    expect(r.speedRate).toBe(1.0);
  });

  it("combined stable DT+HR (number 64|16=80, name DTHR)", () => {
    const r = mods({ play: { mods: { number: 80, name: "DTHR" } } });
    expect(r.speedRate).toBe(1.5);
    expect(r.odFlag).toBe("HR");
  });

  it("lazer DT with speed_change: rate 1.5", () => {
    const r = mods({
      play: {
        mods: {
          name: "DT",
          array: [{ acronym: "DT", settings: { speed_change: 1.5 } }],
        },
      },
    });
    expect(r.speedRate).toBe(1.5);
  });

  it("lazer DC (Double Time custom) 1.3x: speedRate from speed_change", () => {
    const r = mods({
      play: {
        mods: {
          name: "DC",
          array: [{ acronym: "DC", settings: { speed_change: 1.3 } }],
        },
      },
    });
    expect(r.speedRate).toBeCloseTo(1.3, 5);
  });

  it("tosu rate field wins over code heuristic", () => {
    const r = mods({
      play: { mods: { number: 64, name: "DT", rate: 1.3 } },
    });
    expect(r.speedRate).toBeCloseTo(1.3, 5);
  });

  it("IN mod: cvtFlag IN, speedRate 1.0", () => {
    const r = mods({ play: { mods: { name: "IN", array: [{ acronym: "IN" }] } } });
    expect(r.cvtFlag).toBe("IN");
    expect(r.speedRate).toBe(1.0);
    expect(r.hasModInfo).toBe(true);
  });

  it("HO mod: cvtFlag HO", () => {
    const r = mods({ play: { mods: { name: "HO", array: [{ acronym: "HO" }] } } });
    expect(r.cvtFlag).toBe("HO");
  });

  it("IN takes precedence over HO", () => {
    const r = mods({
      play: {
        mods: { name: "INHO", array: [{ acronym: "IN" }, { acronym: "HO" }] },
      },
    });
    expect(r.cvtFlag).toBe("IN");
  });

  it("partial packet without mods payload: hasModInfo false", () => {
    const r = mods({ beatmap: { md5: "abc" }, play: { score: 123 } });
    expect(r.hasModPayload).toBe(false);
    expect(r.hasModInfo).toBe(false);
  });

  it("different speeds produce different signatures", () => {
    const a = mods({ play: { mods: { name: "DT" } } }).modSignature;
    const b = mods({ play: { mods: { name: "HT" } } }).modSignature;
    const c = mods({ play: { mods: { name: "FL" } } }).modSignature;
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
  });

  it("HR vs EZ produce different OD flag", () => {
    const hr = mods({ play: { mods: { name: "HR" } } });
    const ez = mods({ play: { mods: { name: "EZ" } } });
    expect(hr.odFlag).toBe("HR");
    expect(ez.odFlag).toBe("EZ");
  });

  it("DT -> nomod closes the loop: explicit no-mod must re-trigger", () => {
    const dt = mods({ play: { mods: { number: 64, name: "DT" } } });
    const nm = mods({ play: { mods: { number: 0, name: "NM" } } });

    expect(dt.hasModInfo).toBe(true);
    expect(nm.hasExplicitNoMod).toBe(true);
    expect(dt.modSignature).not.toBe(nm.modSignature);
    // websocket gate: (hasModInfo || hasExplicitNoMod) && sig changed
    const gate = (cur: ReturnType<typeof parseModsFromData>, prevSig: string) =>
      (cur.hasModInfo || cur.hasExplicitNoMod) && cur.modSignature !== prevSig;
    expect(gate(dt, "")).toBe(true);   // opening DT triggers
    expect(gate(nm, dt.modSignature)).toBe(true);  // closing back to NM triggers
  });
});
