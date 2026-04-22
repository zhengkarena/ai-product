require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = 'claude-haiku-4-5-20251001';

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;
const client = hasApiKey
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

app.get('/api/health', (req, res) => {
  res.json({ ok: true, aiEnabled: hasApiKey, model: MODEL });
});

function buildSystemPrompt({ lesson, level, nativeLanguage }) {
  const levelGuide =
    level === 'kid'
      ? 'The student is a CHILD learner (age 5-12). Use very simple words, short sentences, lots of encouragement, and fun examples. Repeat key vocabulary often.'
      : 'The student is an ADULT learner with some English basics. Use natural, everyday American English including common idioms, phrasal verbs, and slang. Keep sentences at intermediate level.';

  const lessonBlock = lesson
    ? `\n\n# Today's lesson: ${lesson.title}\nTopic: ${lesson.topic}\nKey vocabulary to teach: ${lesson.vocab.join(', ')}\nExample phrases: ${lesson.phrases.join(' | ')}\nGoal: help the student practice these until they can use them naturally in conversation.`
    : '';

  return `You are Emma, a friendly and patient American English tutor from California. You are having a live voice conversation with a student whose native language is ${nativeLanguage}.

# Your style
- Speak like a real person: warm, encouraging, casual. Use contractions (I'm, you're, let's).
- Keep each reply SHORT (1-3 sentences max) so the student can respond - this is a CONVERSATION, not a lecture.
- Always end with a question or prompt to keep the student talking.
- Use authentic American expressions and correct the student gently when they make mistakes (repeat the correct version naturally instead of lecturing).
- Praise real effort: "Nice!", "Good one!", "You got it!"

# ${levelGuide}

# Native-language support (IMPORTANT)
If the student writes in ${nativeLanguage}, or says things like "I don't understand", "什么意思", "translate", "听不懂", "不会说", then:
1. Briefly explain/translate in ${nativeLanguage} (1-2 short sentences).
2. Immediately switch back to English and give them an easy way to continue.
Wrap any ${nativeLanguage} explanation in [[NATIVE]] ... [[/NATIVE]] tags so the app can render it differently. Example:
   "No worries! [[NATIVE]]"grab a bite" 意思是"随便吃点东西"。[[/NATIVE]] So, wanna grab a bite with me?"

# Output format
- Plain conversational text only. No markdown, no lists, no stage directions.
- Do not include emoji.
- Output ONLY what you would say out loud (plus [[NATIVE]] tags when translating).${lessonBlock}`;
}

app.post('/api/chat', async (req, res) => {
  if (!client) {
    return res.status(503).json({
      error: 'no_api_key',
      message: 'Server is missing ANTHROPIC_API_KEY. App is running in offline practice mode.',
    });
  }

  const { messages = [], lesson, level = 'adult', nativeLanguage = 'Chinese' } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'bad_request', message: 'messages required' });
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: buildSystemPrompt({ lesson, level, nativeLanguage }),
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 4000),
      })),
    });

    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    res.json({ reply: text, usage: response.usage });
  } catch (err) {
    console.error('Claude API error:', err?.message || err);
    res.status(502).json({
      error: 'upstream_error',
      message: err?.message || 'Claude API call failed',
    });
  }
});

app.listen(PORT, () => {
  console.log(`\nAI English Tutor running at http://localhost:${PORT}`);
  console.log(`AI mode: ${hasApiKey ? 'ENABLED' : 'DISABLED (set ANTHROPIC_API_KEY in .env to enable)'}\n`);
});
