---
name: use-agent-study
description: "视频/音频学习资料整理全流程。当用户说「整理这个视频」「帮我做学习笔记」「把这个课程转成笔记」「学习资料整理」时使用。"
---

# Use Agent Study Skill

## 全流程概览

```
视频文件
  ↓ [video-to-audio]
音频文件 (.mp3) → audios/
  ↓ [speech-recognize]
JSON 结果 → output/results/
transcript.md → output/transcripts/
  ↓ [study-doc-generator]
学习笔记 + 学习总结汇报
  ↓ [humanizer-reviewer]
人性化版本（原地覆盖）
```

## 执行规则

- **严格按顺序执行**，不可跳过中间步骤（除非用户已有中间产物）
- **任一步骤失败则立即中断**，报告失败原因，不执行后续步骤
- 每步完成后简要报告进度
- **每个步骤的具体实现由对应的子 skill/agent 负责，本 skill 只做编排，不重复其指令**

## 工作流程

### 第 0 步：确认起点

询问用户提供视频/音频文件，或检查当前目录是否已有中间产物。

根据用户提供的内容判断从哪个步骤开始：
- **提供了视频文件** → 从第 1 步开始
- **提供了音频文件** → 从第 2 步开始
- **已有 transcript.md** → 从第 3 步开始
- **已有学习笔记/报告** → 从第 4 步开始

### 第 1 步：提取音频

调用 **video-to-audio** skill 完成音频提取。该 skill 会处理：
- 确认 ffmpeg 可用
- 询问 1.5x 倍速
- 提取 mp3
- 文件 > 25MB 时自动分段

记录输出的音频文件路径，失败则中断。

### 第 2 步：语音转文字

对第 1 步产生的每个音频文件，依次调用 **speech-recognize** skill。该 skill 会处理：
- 调用 ASR API（自动处理凭证）
- 生成时间线 Markdown
- 多分段时自动合并

若只有一个音频文件则跳过合并步骤。失败则中断。

### 第 3 步：生成学习文档

调用 **study-doc-generator** skill，传入 `output/transcripts/<name>.md`。该 skill 会生成：
- `*-学习笔记.txt`
- `*-学习总结汇报.txt`

### 第 4 步：人性化审查

将第 3 步生成的两个文件路径传递给 **humanizer-reviewer** agent，进行去 AI 痕迹审查，原地覆盖。

完成后列出最终输出文件。
