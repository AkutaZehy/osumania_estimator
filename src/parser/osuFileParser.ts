import type { ParsedBeatmap, BeatmapMetadata, TimingPoint, BreakPeriod } from "../types/beatmap.js";

// ============================================================
// Helper functions (ported exactly from JS reference)
// ============================================================

function stringToInt(value: string): number {
    return Math.trunc(Number.parseFloat(value));
}

function bisectRight(arr: number[], target: number): number {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        // mid is always in [lo, hi) so index is safe
        if (arr[mid]! <= target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

// ============================================================
// OsuFileParser — parses .osu beatmap files
// ============================================================

export class OsuFileParser {
    private osuText: string;
    private od: number = -1;
    private columnCount: number = -1;
    private columns: number[] = [];
    private noteStarts: number[] = [];
    private noteEnds: number[] = [];
    private noteTypes: number[] = [];
    private gameMode: string | null = null;
    private status: string = "init";
    private lnRatio: number = 0;
    // Internal state matching JS reference — assigned by process()/mods
    // @ts-ignore TS6133 — kept for external consumers that may read it
    private noteTimes: Record<number, number[]> = {};
    private metaData: Record<string, string> = {};
    private breaks: Array<[number, number]> = [];
    // @ts-ignore TS6133 — kept for external consumers that may read it
    private objectIntervals: Array<[number, number]> = [];
    private timingPoints: Array<[number, number]> = [];

    constructor(osuText: string) {
        this.osuText = osuText;
    }

    // --------------------------------------------------------
    // Public: return parsed data conforming to the TS interface
    // --------------------------------------------------------

    getParsedData(): ParsedBeatmap {
        const sortedStarts = [...this.noteStarts].sort((a, b) => a - b);
        let firstNote = 0;
        let lastNote = 0;
        if (sortedStarts.length > 0) {
            firstNote = sortedStarts[0]!;
            lastNote = sortedStarts[sortedStarts.length - 1]!;
        }
        const duration = (() => {
          // Duration spans from the first red line to the end of all notes.
          // Using firstNote as start would cut off break/lead-in before the first note,
          // causing the timeline to not cover the full beat structure.
          const durStart = this.timingPoints.length > 0 ? this.timingPoints[0]![0] : firstNote;

          // Find absolute last time (including LN tails)
          let lastEnd = lastNote;
          for (const end of this.noteEnds) {
            if (end > lastEnd) lastEnd = end;
          }

          return Math.max(1, lastEnd - durStart);
        })();

        const metadata: BeatmapMetadata = {
            title: this.metaData["Title"] ?? "",
            artist: this.metaData["Artist"] ?? "",
            creator: this.metaData["Creator"] ?? "",
            version: this.metaData["Version"] ?? "",
            beatmapId: Number.parseInt(this.metaData["BeatmapID"] ?? "0", 10),
            setId: Number.parseInt(this.metaData["BeatmapSetID"] ?? "0", 10),
        };

        const timingPoints: TimingPoint[] = this.timingPoints.map(([time, beatLength]) => ({
            time,
            beatLength,
            meter: 4,
            sampleSet: 0,
            sampleIndex: 0,
            volume: 0,
            uninherited: true,
            effects: 0,
        }));

        const breaks: BreakPeriod[] = this.breaks.map(([startTime, endTime]) => ({
            startTime,
            endTime,
        }));

        const gameMode = this.gameMode != null ? Number.parseInt(this.gameMode, 10) : 0;

        return {
            columnCount: this.columnCount,
            columns: this.columns,
            noteStarts: this.noteStarts,
            noteEnds: this.noteEnds,
            noteTypes: this.noteTypes,
            od: this.od,
            metadata,
            timingPoints,
            breaks,
            lnRatio: this.lnRatio,
            gameMode,
            firstNote,
            lastNote,
            duration,
        };
    }

    // --------------------------------------------------------
    // Main parse entry point
    // --------------------------------------------------------

    process(): void {
        const lines = this.osuText.split(/\r?\n/);
        let inMetadataSection = false;
        let inEventsSection = false;
        let inTimingSection = false;

        for (let i = 0; i < lines.length; i += 1) {
            const line = lines[i]!.trim();
            if (!line) continue;

            if (line === "[Metadata]") { inMetadataSection = true; inEventsSection = false; inTimingSection = false; continue; }
            if (line === "[Events]") { inMetadataSection = false; inEventsSection = true; inTimingSection = false; continue; }
            if (line === "[TimingPoints]") { inMetadataSection = false; inEventsSection = false; inTimingSection = true; continue; }
            if (line.startsWith("[") && line.endsWith("]")) { inMetadataSection = false; inEventsSection = false; inTimingSection = false; }

            if (inMetadataSection && line.includes(":")) {
                const splitIdx = line.indexOf(":");
                const key = line.slice(0, splitIdx).trim();
                const value = line.slice(splitIdx + 1).trim();
                this.metaData[key] = value;
            }

            if (inEventsSection) this.parseEventLine(line);
            if (inTimingSection) this.parseTimingPointLine(line);

            if (line.includes("OverallDifficulty:")) {
                const odPart = line.split(":")[1];
                if (odPart != null) {
                    const parsed = Number.parseFloat(odPart.trim());
                    if (!Number.isNaN(parsed)) this.od = parsed;
                }
            }

            if (line.includes("CircleSize:")) {
                const csPart = line.split(":")[1];
                if (csPart != null) {
                    const cs = csPart.trim();
                    this.columnCount = cs === "0" ? 10 : stringToInt(cs);
                }
            }

            if (line.includes("Mode:")) {
                const modePart = line.split(":")[1];
                if (modePart != null) {
                    const mode = modePart.trim();
                    this.gameMode = mode;
                    if (mode !== "3") this.status = "NotMania";
                }
            }

            if (line === "[HitObjects]") {
                for (let j = i + 1; j < lines.length; j += 1) {
                    const objLine = lines[j]!.trim();
                    if (!objLine) continue;
                    this.parseHitObject(objLine);
                }
                break;
            }
        }

        this.lnRatio = this.getLNRatio();
        this.noteTimes = this.getNoteTimes();
        this.objectIntervals = this.getObjectIntervals();

        if (!this.timingPoints.length) this.timingPoints = [[0, 500.0]];
        this.timingPoints.sort((a, b) => a[0] - b[0]);

        if (this.status !== "Fail" && this.status !== "NotMania") this.status = "OK";
    }

    // --------------------------------------------------------
    // Section sub-parsers
    // --------------------------------------------------------

    parseEventLine(eventLine: string): void {
        if (!eventLine || eventLine.startsWith("//")) return;
        const params = eventLine.split(",").map(p => p.trim());
        if (params.length < 3) return;
        if (params[0] !== "2" && params[0] !== "Break") return;
        const breakStart = Number.parseInt(params[1]!, 10);
        const breakEnd = Number.parseInt(params[2]!, 10);
        if (Number.isNaN(breakStart) || Number.isNaN(breakEnd)) return;
        if (breakEnd > breakStart) this.breaks.push([breakStart, breakEnd]);
    }

    parseHitObject(objectLine: string): void {
        const params = objectLine.split(",");
        if (params.length < 5) return;
        try {
            const x = stringToInt(params[0]!);
            let column = 0;
            if (this.columnCount > 0) {
                column = Math.trunc((x * this.columnCount) / 512);
                column = Math.min(this.columnCount - 1, Math.max(0, column));
            }
            this.columns.push(column);
            const noteStart = Number.parseInt(params[2]!, 10);
            const noteType = Number.parseInt(params[3]!, 10);
            this.noteStarts.push(noteStart);
            this.noteTypes.push(noteType);
            let noteEnd = noteStart;
            if ((noteType & 128) !== 0 && params.length >= 6) {
                const lastParamChunk = params[5]!.split(":");
                noteEnd = Number.parseInt(lastParamChunk[0]!, 10);
            }
            this.noteEnds.push(noteEnd);
        } catch { this.status = "Fail"; }
    }

    parseTimingPointLine(timingLine: string): void {
        if (!timingLine || timingLine.startsWith("//")) return;
        const parts = timingLine.split(",").map(item => item.trim());
        if (parts.length < 2) return;
        const t = Math.trunc(Number.parseFloat(parts[0]!));
        const beatLength = Number.parseFloat(parts[1]!);
        const uninherited = parts.length > 6 && parts[6] ? Number.parseInt(parts[6]!, 10) : 1;
        if (!Number.isNaN(t) && !Number.isNaN(beatLength) && uninherited === 1 && beatLength > 0) {
            this.timingPoints.push([t, beatLength]);
        }
    }

    // --------------------------------------------------------
    // Derived data computation
    // --------------------------------------------------------

    getBeatLengthAt(timeMs: number): number {
        if (!this.timingPoints.length) return 500.0;
        const times = this.timingPoints.map(tp => tp[0]);
        const idx = bisectRight(times, Math.trunc(timeMs)) - 1;
        if (idx < 0) return this.timingPoints[0]![1];
        return this.timingPoints[idx]![1];
    }

    getLNRatio(): number {
        const totalNotes = this.noteTypes.length;
        if (!totalNotes) return 0;
        let lnCount = 0;
        for (const t of this.noteTypes) { if ((t & 128) !== 0) lnCount += 1; }
        return lnCount / totalNotes;
    }

    getNoteTimes(): Record<number, number[]> {
        const noteTimes: Record<number, number[]> = {};
        for (let i = 0; i < this.columns.length; i += 1) {
            const col = this.columns[i]!;
            const time = this.noteStarts[i]!;
            if (!noteTimes[col]) noteTimes[col] = [];
            noteTimes[col]!.push(time);
        }
        for (const key of Object.keys(noteTimes)) {
            const col = Number(key);
            noteTimes[col] = noteTimes[col]!.sort((a, b) => a - b);
        }
        return noteTimes;
    }

    getObjectIntervals(): Array<[number, number]> {
        if (!this.noteStarts.length) return [];
        const sortedStarts = [...this.noteStarts].sort((a, b) => a - b);
        const intervals: Array<[number, number]> = [];
        let prevStart: number | null = null;
        for (const startTime of sortedStarts) {
            const interval = prevStart == null ? 0 : startTime - prevStart;
            intervals.push([startTime, interval]);
            prevStart = startTime;
        }
        intervals.sort((a, b) => { if (b[1] !== a[1]) return b[1] - a[1]; return a[0] - b[0]; });
        return intervals;
    }

    // --------------------------------------------------------
    // Mods
    // --------------------------------------------------------

    modIN(): void {
        const startsByCol: Record<number, number[]> = {};
        for (let i = 0; i < this.columns.length; i += 1) {
            const col = this.columns[i]!;
            const start = this.noteStarts[i]!;
            if (!startsByCol[col]) startsByCol[col] = [];
            startsByCol[col]!.push(Number(start));
        }
        const newObjects: Array<[number, number, number]> = [];
        for (const colText of Object.keys(startsByCol)) {
            const col = Number.parseInt(colText, 10);
            const locations = startsByCol[col]!;
            locations.sort((a, b) => a - b);
            for (let i = 0; i < locations.length - 1; i += 1) {
                const startTime = locations[i]!;
                const nextTime = locations[i + 1]!;
                let duration = nextTime - startTime;
                const beatLength = this.getBeatLengthAt(nextTime);
                duration = Math.max(duration / 2, duration - beatLength / 4);
                const endTime = startTime + duration;
                newObjects.push([Math.round(startTime), col, Math.round(endTime)]);
            }
        }
        newObjects.sort((a, b) => { if (a[0] !== b[0]) return a[0] - b[0]; return a[1] - b[1]; });
        this.columns = newObjects.map(obj => obj[1]);
        this.noteStarts = newObjects.map(obj => obj[0]);
        this.noteTypes = newObjects.map(() => 128);
        this.noteEnds = newObjects.map(obj => obj[2]);
        this.breaks = [];
        this.lnRatio = this.getLNRatio();
        this.noteTimes = this.getNoteTimes();
        this.objectIntervals = this.getObjectIntervals();
    }

    modHO(): void {
        for (let i = 0; i < this.noteTypes.length; i += 1) {
            if ((this.noteTypes[i]! & 128) !== 0) { this.noteTypes[i] = 1; this.noteEnds[i] = 0; }
        }
        this.lnRatio = this.getLNRatio();
        this.noteTimes = this.getNoteTimes();
        this.objectIntervals = this.getObjectIntervals();
    }
}
