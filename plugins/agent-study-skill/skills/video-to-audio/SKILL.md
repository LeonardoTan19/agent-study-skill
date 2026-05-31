---
name: video-to-audio
description: "从视频文件中提取音频。当用户需要从 mp4、mkv、webm 等视频中提取音频用于后续语音识别时使用。使用 ffmpeg 处理。"
---

# Video-to-Audio Skill

## 前置检查

执行前先确认 ffmpeg 可用：

```bash
ffmpeg -version
```

若未安装，提示用户安装：`sudo apt install ffmpeg`（Linux）或 `brew install ffmpeg`（macOS）。

## 工作流程

### 第 1 步：确认输入

如果用户未提供视频文件路径，先询问。支持本地文件和远程 URL（先下载再处理）。

### 第 2 步：询问是否 1.5x 倍速

询问用户是否需要 1.5 倍速播放以节约后续 API 费用。若用户选择是，在提取音频时应用 `atempo=1.5` 滤镜。

### 第 3 步：检查文件大小

```bash
ls -l <video_path> | awk '{print $5}'
# 或
stat -c%s <video_path>
```

### 第 4 步：提取音频

**输出文件名从输入视频文件名自动派生**：取输入视频的文件名（不含扩展名）作为音频文件名。例如 `my_course.mp4` → `audios/my_course.mp3`。

先创建输出目录：

```bash
mkdir -p audios
```

**基本命令（优先保证人声质量，兼顾文件大小）：**

```bash
ffmpeg -i <video_path> -vn -acodec libmp3lame -q:a 2 -ac 1 -ar 22050 audios/<output.mp3>
```

参数说明：
- `-vn`：去除视频流
- `-acodec libmp3lame`：MP3 编码（文件小）
- `-q:a 2`：VBR 质量 2（约 190kbps，人声清晰）
- `-ac 1`：单声道（人声不需要立体声）
- `-ar 22050`：22kHz 采样率（人声足够，比 44.1kHz 节省一半）

**1.5 倍速版本：**

```bash
ffmpeg -i <video_path> -vn -acodec libmp3lame -q:a 2 -ac 1 -ar 22050 -filter:a "atempo=1.5" audios/<output.mp3>
```

### 第 5 步：检查输出大小，必要时分段

提取完成后，检查输出音频文件大小。若大于 25MB：

```bash
# 先获取音频时长（秒）
DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 audios/<output.mp3>)
# 计算每段时长：总时长 / ceil(文件大小 / 25MB)
# 假设文件大小 60MB，则分 3 段，每段 = DURATION / 3
SEGMENTS=$(( ($(stat -c%s audios/<output.mp3>) + 26214399) / 26214400 ))
SEGMENT_DURATION=$(echo "$DURATION / $SEGMENTS" | bc -l)

# 用 ffmpeg segment 分段
ffmpeg -i audios/<output.mp3> -f segment -segment_time $SEGMENT_DURATION -c copy audios/<output_base>_%03d.mp3
```

分段后输出多个文件：`audios/<output_base>_000.mp3`, `audios/<output_base>_001.mp3`, ...，后续逐个调用 speech-recognize。

## 输出

- 提取完成报告输出文件路径和大小
- 若分了段，列出所有分段文件
- 告知用户下一步可调用 speech-recognize
