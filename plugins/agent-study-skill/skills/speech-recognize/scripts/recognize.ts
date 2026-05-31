import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

function fileToBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString("base64");
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

function printUsage() {
  console.log(`Usage: npx tsx recognize.ts --filePath <path> [--appId <id>] [--accessToken <token>] [--output <path>]
       npx tsx recognize.ts --fileUrl <url> [--appId <id>] [--accessToken <token>] [--output <path>]

Options:
  --filePath     Local audio file path
  --fileUrl      Remote audio file URL
  --appId        ByteDance App ID (numeric, e.g. 1234567890) or set BYTEDANCE_APP_ID env
  --accessToken  ByteDance Access Token (long string) or set BYTEDANCE_ACCESS_TOKEN env
  --output       Output JSON path (default: result.json)

凭证获取说明:
  使用火山引擎控制台中的两个字段：
    App ID      → --appId 或 BYTEDANCE_APP_ID（数字 ID）
    Access Token → --accessToken 或 BYTEDANCE_ACCESS_TOKEN（长字符串）
  注意：控制台的 Secret Key 字段本 API 不使用，请勿混入。
`);
}

interface RecognizeRequest {
  user: { uid: string };
  audio: { url?: string; data?: string };
  request: {
    model_name: string;
  };
}

async function recognizeTask(
  appId: string,
  accessToken: string,
  audio: { fileUrl?: string; filePath?: string },
): Promise<Response> {
  const recognizeUrl =
    "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";

  const headers: Record<string, string> = {
    "X-Api-App-Key": appId,
    "X-Api-Access-Key": accessToken,
    "X-Api-Resource-Id": "volc.bigasr.auc_turbo",
    "X-Api-Request-Id": randomUUID(),
    "X-Api-Sequence": "-1",
  };

  let audioData: { url?: string; data?: string };
  if (audio.fileUrl) {
    audioData = { url: audio.fileUrl };
  } else if (audio.filePath) {
    audioData = { data: fileToBase64(audio.filePath) };
  } else {
    throw new Error("必须提供 fileUrl 或 filePath 其中之一");
  }

  const request: RecognizeRequest = {
    user: { uid: appId },
    audio: audioData,
    request: {
      model_name: "bigmodel",
      show_utterances: true,
    },
  };

  const response = await fetch(recognizeUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (response.headers.has("X-Api-Status-Code")) {
    console.log(
      `X-Api-Status-Code: ${response.headers.get("X-Api-Status-Code")}`,
    );
    console.log(
      `X-Api-Message: ${response.headers.get("X-Api-Message")}`,
    );
    console.log(
      `X-Tt-Logid: ${response.headers.get("X-Tt-Logid")}`,
    );
    const cloned = response.clone();
    const json = await cloned.json();
    // 只输出摘要信息，避免完整转录文本占用 agent 上下文
    const result = json?.result;
    if (result) {
      const items = Array.isArray(result) ? result : [result];
      const utteranceCount = items.reduce((sum: number, item: any) => sum + (item.utterances?.length || 0), 0);
      const textLen = items.reduce((sum: number, item: any) => sum + (item.text?.length || 0), 0);
      console.log(`转写结果: ${items.length} 段, ${utteranceCount} 句, 文本总长度 ${textLen} 字符`);
    }
    if (json?.audio_info?.duration) {
      console.log(`音频时长: ${(json.audio_info.duration / 1000).toFixed(1)}s`);
    }
    console.log();
  } else {
    console.log(
      `Request failed, headers: ${JSON.stringify(Object.fromEntries(response.headers.entries()))}\n`,
    );
    process.exit(1);
  }
  return response;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.filePath && !args.fileUrl) {
    printUsage();
    process.exit(1);
  }

  const appId = args.appId || process.env.BYTEDANCE_APP_ID;
  const accessToken = args.accessToken || process.env.BYTEDANCE_ACCESS_TOKEN;

  // 从输入文件名自动派生输出路径到 output/results/ 目录
  let defaultOutput = "result.json";
  if (args.filePath) {
    const basename = path.basename(args.filePath, path.extname(args.filePath));
    defaultOutput = path.join("output", "results", `${basename}.json`);
  } else if (args.fileUrl) {
    try {
      const urlPath = new URL(args.fileUrl).pathname;
      const basename = path.basename(urlPath, path.extname(urlPath)) || "result";
      defaultOutput = path.join("output", "results", `${basename}.json`);
    } catch {
      // URL 解析失败，保持默认
    }
  }
  const outputPath = args.output || defaultOutput;

  // 确保输出目录存在
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (!appId || !accessToken) {
    console.error("Error: appId and accessToken required. Set via --appId/--accessToken or BYTEDANCE_APP_ID/BYTEDANCE_ACCESS_TOKEN env vars.\n\n" +
      "Get them from ByteDance Volcano Engine console:\n" +
      "  App ID      → --appId or BYTEDANCE_APP_ID (numeric, e.g. 1234567890)\n" +
      "  Access Token → --accessToken or BYTEDANCE_ACCESS_TOKEN (long string)\n" +
      "  Note: Secret Key is NOT used by this API.");
    process.exit(1);
  }

  const startTime = performance.now();
  console.log(`${new Date().toLocaleString()} START!`);

  const response = await recognizeTask(appId, accessToken, {
    fileUrl: args.fileUrl,
    filePath: args.filePath,
  });

  const code = response.headers.get("X-Api-Status-Code");
  const logid = response.headers.get("X-Tt-Logid");

  if (code === "20000000") {
    const json = await response.json();
    fs.writeFileSync(outputPath, JSON.stringify(json, null, 4), "utf-8");
    console.log(`${new Date().toLocaleString()} SUCCESS!`);
    console.log(`耗时: ${((performance.now() - startTime) / 1000).toFixed(3)}s`);
    console.log(`结果已保存到: ${outputPath}`);
  } else if (code !== "20000001" && code !== "20000002") {
    console.log(
      `${new Date().toLocaleString()} FAILED! code: ${code}, logid: ${logid}`,
    );
  }
}

main();
