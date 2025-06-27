// server/index.js
import dotenv   from 'dotenv';
import express  from 'express';
import cors     from 'cors';
import mongoose from 'mongoose';
import OpenAI   from 'openai';

// 0) 환경변수 로드
dotenv.config();

// 1) MongoDB 연결
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser:    true,
  useUnifiedTopology: true,
})
.then(() => console.log('🔗 MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// 2) Mongoose 모델 정의
const PageSchema = new mongoose.Schema({
  prompt:  { type: String },
  html:    { type: String, required: true },
  created: { type: Date,   default: Date.now },
});
const Page = mongoose.models.Page || mongoose.model('Page', PageSchema);

// 3) Express 앱 설정
const app = express();
app.use(cors());
app.use(express.json());

// 4) Health-check 루트
app.get('/', (_req, res) => {
  res.send('OK');
});

// 5) SSE 스트리밍 엔드포인트
app.all('/api/stream', async (req, res) => {
  // GET/POST 메시지 모두 처리
  const message = req.method === 'GET'
    ? req.query.message
    : req.body.message;

  // SSE 헤더
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();

  // OpenAI 설정
  const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // 프롬프트: 오직 전체 HTML 문서만 내보내도록 system 지시
  const systemPrompt = [
    '당신은 “실행 가능한 HTML 문서”만 순수하게 출력해야 합니다.',
    '어떠한 부연 설명도, 마크다운 설명도, 리스트도 하지 마세요.',
    '출력 예시: <html><head>…</head><body>…</body></html>',
  ].join(' ');

  // 스트리밍 생성
  let fullHtml = '';
  const stream = await ai.chat.completions.create({
    model:  'gpt-4o-mini',
    stream: true,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: message }
    ],
  });

  // 조각을 받아서 SSE로 보내고, fullHtml에 누적
  for await (const chunk of stream) {
    const text = chunk.choices[0].delta?.content;
    if (text) {
      res.write(`data: ${text}\n\n`);
      fullHtml += text;
    }
  }
  // Done 신호
  res.write('data: [DONE]\n\n');
  res.end();

  // — 스트림 완료 시점: fullHtml 누적이 끝난 상태 —
  // 이곳에 바로 DB 저장 로직을 넣어도 되지만,
  // 클라이언트에서 별도 /api/save 호출을 권장합니다.
});

// 6) 생성된 HTML 저장용 엔드포인트
app.post('/api/save', async (req, res) => {
  try {
    const { prompt, html } = req.body;
    const doc = await Page.create({ prompt, html });
    return res.json({ id: doc._id.toString() });
  } catch (err) {
    console.error('Save error:', err);
    return res.status(500).json({ error: '저장 실패' });
  }
});

// 7) 고유 ID로 저장된 HTML 펼쳐 보기
app.get('/preview/:id', async (req, res) => {
  try {
    const doc = await Page.findById(req.params.id);
    if (!doc) return res.status(404).send('Not found');
    // 전체 HTML 문서를 그대로 반환
    return res.send(doc.html);
  } catch (err) {
    console.error('Preview error:', err);
    return res.status(500).send('Error');
  }
});

// 8) 포트 바인딩 (Render용 process.env.PORT 지원)
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
