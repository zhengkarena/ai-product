# Emma · AI English Tutor 🎓

一个基于 Claude 的 AI 美式英语外教网页应用。和真人形象的外教 "Emma" 实时语音对话，练习听力和口语，支持中文翻译解释，分年龄段和主题授课。

## 功能特色

- 🎙️ **实时语音对话** - 浏览器端语音识别 (STT) + 美式英语语音合成 (TTS)
- 👩‍🏫 **Emma 外教形象** - 会动的卡通头像，说话时嘴巴动、有呼吸光环，营造真人感
- 💬 **智能回复** - Claude Haiku 4.5 驱动，根据你的回答动态调整难度
- 🌏 **中文翻译支持** - 听不懂时用中文解释：打字输入中文，或说 "I don't understand"，Emma 会切到中文再切回英文
- 📚 **28 个主题课程**:
  - **成人版 (15 课)**: 日常用品、校园生活、餐厅点餐、购物、旅行、工作、医疗、科技、休闲、天气、家庭、情绪、运动、寒暄、美式俚语
  - **儿童版 (13 课)**: 颜色、数字、动物、家庭、水果蔬菜、身体部位、日常作息、天气、玩具、学校、衣服、情绪、问候语
- 🎚️ **分级教学** - 儿童版用简单句子+鼓励；成人版包含地道俚语、缩读、习惯用语
- ⚡ **离线降级** - API 不可用时自动切换为"离线练习模式"，仍能练发音+跟读

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 API Key (可选但强烈推荐)

复制示例环境变量文件：

```bash
cp .env.example .env
```

编辑 `.env` 填入你的 Anthropic API Key（在 https://console.anthropic.com/ 获取）：

```
ANTHROPIC_API_KEY=sk-ant-xxx...
```

> 如果没有 API Key，应用会自动以**离线练习模式**运行，你依然可以跟 Emma 练发音、学单词，但对话不是智能的。

### 3. 启动服务

```bash
npm start
```

然后打开 http://localhost:3000

## 浏览器要求

- **推荐 Chrome 或 Edge 最新版** - 语音识别和最好音色的 TTS 需要它们
- Firefox 的语音合成可用但音色稍差
- Safari 基本可用
- 第一次使用时浏览器会请求**麦克风权限**，请允许

## 使用方法

1. 打开页面后选择 **Adult（成人）** 或 **Kid（儿童）** 版本
2. 从课程列表中选一课（如 "Lesson 3 · Food & Restaurants"）
3. 点击 **Start Class**
4. 点击 🎤 Tap to speak 按钮说英文；或直接打字
5. 听不懂时可以：
   - 打中文 → Emma 会中英文混合解释
   - 点 **🌐 Translate** 让 Emma 翻译上一句
   - 点 **🔁 Repeat** 让 Emma 重复
   - 点 **🐢 Slower** 让 Emma 放慢语速再说一遍

## 项目结构

```
.
├── server.js              # Express 后端（Claude API 代理）
├── package.json
├── .env.example
├── public/
│   ├── index.html         # 主页面
│   ├── styles.css         # 样式
│   ├── app.js             # 前端逻辑（语音+对话）
│   └── lessons.js         # 课程数据
└── README.md
```

## 后续可优化方向

目前这个 MVP 用的是浏览器内置 TTS，音色已经尽量挑选最像真人的（Google US English / Microsoft Aria 等）。如果想进一步拟真可以：

1. **接入 ElevenLabs / OpenAI TTS** - 真正 "人类级" 的语音，在 `server.js` 加一个 `/api/tts` 代理端点
2. **接入 Deepgram Nova / Whisper** - 比浏览器语音识别更准
3. **加入进度追踪** - 记录已完成课程、答题正确率
4. **Lip-sync 真人头像** - 用 Ready Player Me + 口型动画替代卡通头像
5. **WebSocket 流式响应** - 现在是请求-响应式，改成流式会更接近"实时"

## 已知限制

- Web Speech API 在不同浏览器的音色差异较大；若觉得声音不够自然，推荐装 Chrome + 安装中文 TTS 扩展以获取 "Google US English" 音色
- Firefox 和部分移动端浏览器的 `SpeechRecognition` 不稳定，必要时请改用打字
