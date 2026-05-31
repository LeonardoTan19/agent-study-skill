# Agent Study Skill Marketplace

学习资料整理工具集 — 从视频/音频中提取学习内容，自动生成学习笔记与总结报告。

## 安装

```bash
# 添加 marketplace
/plugin marketplace add https://github.com/LeonardoTan19/agent-study-skill

# 安装插件
/plugin install agent-study-skill@agent-study-skill-marketplace
```

## 包含的插件

### agent-study-skill

视频/音频学习资料整理全流程工具：

```
视频文件 → 提取音频 → 语音转文字 → 生成学习笔记 + 总结报告 → 人性化审查
```

**Skills:**
- `video-to-audio` — 从视频中提取音频
- `speech-recognize` — 语音转文字
- `study-doc-generator` — 生成学习笔记与总结
- `use-agent-study` — 一键全流程执行

**Agents:**
- `humanizer-reviewer` — 去 AI 痕迹审查