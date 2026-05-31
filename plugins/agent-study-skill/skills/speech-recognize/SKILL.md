---
name: speech-recognize
description: "语音识别 / 音频转文字。当用户需要将音频文件（mp3、wav、m4a 等）转为文字、做会议录音转写、或者提到语音识别、ASR、音频转文本时使用此 skill。底层使用火山引擎（ByteDance）大模型语音识别 API。"
---

# Speech Recognize Skill

## 工作流程

每次语音识别请求，必须完整执行以下两步：

如果用户未提供音频文件路径或 URL，请先主动询问文件位置再执行第 1 步。

### 第 1 步：调用 ASR API

```bash
# 本地文件
npx tsx ${CLAUDE_PLUGIN_ROOT}/skills/speech-recognize/scripts/recognize.ts --filePath audios/my_audio.mp3

# 远程 URL
npx tsx ${CLAUDE_PLUGIN_ROOT}/skills/speech-recognize/scripts/recognize.ts --fileUrl https://example.com/audio.mp3
```

输出自动写入 `output/results/<音频文件名>.json`。脚本会根据输入文件名自动派生输出路径。

如果第 1 步执行失败或报错，请立即中止流程并向用户解释原因，不要执行第 2 步。

### 第 2 步：生成时间线 Markdown（必须执行）

```bash
npx tsx ${CLAUDE_PLUGIN_ROOT}/skills/speech-recognize/scripts/to-markdown.ts --input output/results/my_audio.json
```

输出自动写入 `output/transcripts/<输入文件名>.md`。生成后请向用户简要总结部分内容，并告知文件生成路径；无需将全部完整文本打印在对话框中。

## 参数参考

### recognize.ts

| 参数 | 说明 | 来源 |
|------|------|------|
| `--filePath` | 本地音频文件路径 | 与 `--fileUrl` 二选一 |
| `--fileUrl` | 远程音频文件 URL | 与 `--filePath` 二选一 |
| `--appId` | 火山引擎 App ID（数字 ID） | 或设 `BYTEDANCE_APP_ID` 环境变量 |
| `--accessToken` | 火山引擎 Access Token | 或设 `BYTEDANCE_ACCESS_TOKEN` 环境变量 |
| `--output` | 输出 JSON 路径 | 默认 `output/results/<输入文件名>.json` |

### to-markdown.ts

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--input` | 输入 JSON 路径 | `output/results/<name>.json` |
| `--output` | 输出 Markdown 路径 | `output/transcripts/<输入文件名>.md` |

## 凭证获取

语音识别 API 使用火山引擎控制台中的两个凭证：

| 控制台字段 | 环境变量 / 参数 | 说明 |
|-----------|-----------------|------|
| App ID | `BYTEDANCE_APP_ID` / `--appId` | 数字 ID，如 `1234567890` |
| Access Token | `BYTEDANCE_ACCESS_TOKEN` / `--accessToken` | 长字符串 |

注意：控制台还有一个 **Secret Key** 字段，但语音识别 API 仅需上述两个凭证，请勿将 Secret Key 混用。

若环境变量未设置且用户未提供，请明确询问用户以上两项凭证（App ID 和 Access Token）。

## 环境变量（推荐）

```bash
export BYTEDANCE_APP_ID="你的App ID（数字）"
export BYTEDANCE_ACCESS_TOKEN="你的Access Token"
```

## 输出示例

`transcript.md` 的格式：

- **转写时间** / **音频时长** 元信息
- **完整文本** — 全文，方便复制
- **时间线** — 逐句带时间戳，格式 `00:01.2 - 00:04.5  文本内容`

### 合并多个 transcript

当音频被分段识别后产生多个 `transcript_*.md` 时，使用 merge 脚本合并并保留分段标记：

```bash
npx tsx ${CLAUDE_PLUGIN_ROOT}/skills/speech-recognize/scripts/merge-transcripts.ts output/transcripts/<name>_000.md output/transcripts/<name>_001.md output/transcripts/<name>_002.md
```

- 每个分段以 `### 文件名` 标题标记，清晰区分不同音频来源
- 时间线中的时间戳自动累加为绝对时间（从 0 开始）
- 完整文本和时间线均按分段分组展示

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--output` | 输出 Markdown 路径 | `output/transcripts/<公共前缀>.md` |

## 依赖

- Node.js ≥ 18（内置 `fetch`、`crypto`、`fs`）
- `npx tsx` — 自动下载 TypeScript 执行器，无需预装
