import * as fs from "fs";
import * as path from "path";

interface Word {
  text: string;
  start_time: number;
  end_time: number;
  blank_duration: number;
}

interface Utterance {
  text: string;
  start_time: number;
  end_time: number;
  definite: boolean;
  words: Word[];
}

interface ResultItem {
  text: string;
  utterances?: Utterance[];
}

interface AsrResponse {
  result?: ResultItem[] | ResultItem;
  audio_info?: { duration: number };
}

function msToTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = ms % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(Math.floor(millis / 100))}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
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
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  const inputPath = args.input || "result.json";

  // 从输入文件名自动派生输出路径到 output/transcripts/ 目录
  const inputBasename = path.basename(inputPath, path.extname(inputPath));
  const defaultOutput = path.join("output", "transcripts", `${inputBasename}.md`);
  const outputPath = args.output || defaultOutput;

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!fs.existsSync(inputPath)) {
    console.error(`Error: ${inputPath} not found`);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf-8");
  const data: AsrResponse = JSON.parse(raw);

  if (!data.result) {
    console.error("Error: no result in response");
    process.exit(1);
  }

  // 兼容两种格式：数组和单个对象
  const items: ResultItem[] = Array.isArray(data.result) ? data.result : [data.result];

  const lines: string[] = [];

  lines.push("# 语音转写结果");
  lines.push("");

  const transcribeTime = new Date().toLocaleString("zh-CN");
  lines.push(`**转写时间**: ${transcribeTime}`);

  if (data.audio_info?.duration) {
    lines.push(`**音频时长**: ${formatDuration(data.audio_info.duration)}`);
  }
  lines.push("");

  // 收集所有 utterances
  const allUtterances: Utterance[] = [];
  for (const item of items) {
    if (item.utterances) {
      allUtterances.push(...item.utterances);
    }
  }

  if (allUtterances.length > 0) {
    // 完整文本
    lines.push("---");
    lines.push("");
    lines.push("## 完整文本");
    lines.push("");
    const fullText = allUtterances.map((u) => u.text).join("");
    lines.push(fullText);
    lines.push("");

    // 时间线
    lines.push("---");
    lines.push("");
    lines.push("## 时间线");
    lines.push("");

    for (const u of allUtterances) {
      const start = msToTimestamp(u.start_time);
      const end = msToTimestamp(u.end_time);
      lines.push(`**${start} - ${end}**  ${u.text}`);
      lines.push("");
    }
  } else {
    // 没有 utterances，只输出完整文本
    lines.push("---");
    lines.push("");
    lines.push("## 转写文本");
    lines.push("");
    for (const item of items) {
      if (item.text) {
        lines.push(item.text);
        lines.push("");
      }
    }
  }

  fs.writeFileSync(outputPath, lines.join("\n"), "utf-8");
  console.log(`Markdown saved to: ${outputPath}`);
}

main();
