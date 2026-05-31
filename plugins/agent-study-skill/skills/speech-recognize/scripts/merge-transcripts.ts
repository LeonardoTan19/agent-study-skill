import * as fs from "fs";
import * as path from "path";

function parseDurationToMs(duration: string): number {
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) {
    return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
  }
  return (parts[0] * 60 + parts[1]) * 1000;
}

function timestampToMs(ts: string): number {
  const [minSec, tenths] = ts.split(".");
  const [min, sec] = minSec.split(":").map(Number);
  return (min * 60 + sec) * 1000 + (parseInt(tenths) || 0) * 100;
}

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(Math.floor(millis / 100))}`;
}

function formatDurationMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

interface ParsedTranscript {
  source: string;
  transcribeTime: string;
  durationMs: number;
  durationLabel: string;
  fullText: string;
  timeline: { startMs: number; endMs: number; text: string }[];
}

function parseTranscript(filePath: string): ParsedTranscript {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  let transcribeTime = "";
  let durationLabel = "";
  let durationMs = 0;
  let fullText = "";
  const timeline: { startMs: number; endMs: number; text: string }[] = [];

  let section: "header" | "fulltext" | "timeline" = "header";

  for (const line of lines) {
    if (line.startsWith("**转写时间**:")) {
      transcribeTime = line.replace("**转写时间**: ", "").trim();
    } else if (line.startsWith("**音频时长**:")) {
      durationLabel = line.replace("**音频时长**: ", "").trim();
      durationMs = parseDurationToMs(durationLabel);
    } else if (line === "## 完整文本" || line === "## 转写文本") {
      section = "fulltext";
    } else if (line === "## 时间线") {
      section = "timeline";
    } else if (section === "fulltext" && line.trim()) {
      fullText += line.trim();
    } else if (section === "timeline") {
      const match = line.match(/^\*\*(\d{2,}:\d{2}\.\d)\s*-\s*(\d{2,}:\d{2}\.\d)\*\*\s+(.+)/);
      if (match) {
        timeline.push({
          startMs: timestampToMs(match[1]),
          endMs: timestampToMs(match[2]),
          text: match[3],
        });
      }
    }
  }

  return {
    source: path.basename(filePath),
    transcribeTime,
    durationMs,
    durationLabel,
    fullText,
    timeline,
  };
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 2; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1];
      if (!val || val.startsWith("--")) {
        args[key] = "true";
      } else {
        args[key] = val;
        i++;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return { args, positional };
}

function main() {
  const { args, positional } = parseArgs(process.argv);
  const inputs = positional;

  // 从输入文件名自动派生输出路径到 transcripts/ 目录
  let defaultOutput = "merged_transcript.md";
  if (inputs.length > 0) {
    const basenames = inputs.map((p) => path.basename(p, path.extname(p)));
    // 去掉通用数字后缀如 _000, _001 找公共前缀
    const commonBase = basenames[0].replace(/_\d+$/, "") || basenames[0];
    defaultOutput = path.join("output", "transcripts", `${commonBase}.md`);
  }
  const outputPath = args.output || defaultOutput;

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (inputs.length < 2) {
    console.error("Usage: npx tsx merge-transcripts.ts [--output merged.md] file1.md file2.md ...");
    console.error("  At least 2 transcript files required.");
    process.exit(1);
  }

  const parsed = inputs.map((p) => {
    if (!fs.existsSync(p)) {
      console.error(`Error: ${p} not found`);
      process.exit(1);
    }
    return parseTranscript(p);
  });

  let cumulativeOffset = 0;
  let totalDurationMs = 0;
  const segments: { label: string; timeRange: string; text: string; timeline: string[] }[] = [];

  for (const p of parsed) {
    const segStart = cumulativeOffset;
    cumulativeOffset += p.durationMs;
    const segEnd = cumulativeOffset;
    totalDurationMs += p.durationMs;

    const timeRange = `${msToTimestamp(segStart)} → ${msToTimestamp(segEnd)}（${p.durationLabel}）`;

    const segTimeline = p.timeline.map((t) => {
      const absStart = t.startMs + segStart;
      const absEnd = t.endMs + segStart;
      return `**${msToTimestamp(absStart)} - ${msToTimestamp(absEnd)}**  ${t.text}`;
    });

    segments.push({
      label: `### ${path.basename(p.source, ".md")}`,
      timeRange,
      text: p.fullText,
      timeline: segTimeline,
    });
  }

  const out: string[] = [];
  out.push("# 语音转写结果（合并）");
  out.push("");
  out.push(`**转写时间**: ${new Date().toLocaleString("zh-CN")}`);
  out.push(`**音频总时长**: ${formatDurationMs(totalDurationMs)}`);
  out.push(`**来源分段**: ${inputs.length} 个`);
  out.push("");
  out.push("---");
  out.push("");

  // 完整文本 — 分段展示
  out.push("## 完整文本");
  out.push("");
  for (const seg of segments) {
    out.push(seg.label);
    out.push("");
    out.push(`> ${seg.timeRange}`);
    out.push("");
    out.push(seg.text);
    out.push("");
  }

  out.push("---");
  out.push("");

  // 时间线 — 分段展示，时间戳已累加为绝对时间
  out.push("## 时间线（绝对时间）");
  out.push("");
  for (const seg of segments) {
    out.push(seg.label);
    out.push("");
    out.push(`> ${seg.timeRange}`);
    out.push("");
    for (const entry of seg.timeline) {
      out.push(entry);
      out.push("");
    }
  }

  fs.writeFileSync(outputPath, out.join("\n"), "utf-8");
  console.log(`合并完成: ${inputs.length} 个分段 → ${outputPath}`);
  console.log(`总时长: ${formatDurationMs(totalDurationMs)}`);
}

main();
