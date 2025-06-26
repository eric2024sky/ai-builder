import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json());

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.all('/api/stream', async (req, res) => {
  // GET/POST 모두 처리
  const message = req.method === 'GET'
    ? req.query.message
    : req.body.message;

  // 스트리밍 헤더
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders();



    // messages: [
    //   { role: 'system', content: '웹페이지 코드를 스트리밍 방식으로 전달하세요.' },
    //   { role: 'user',   content: message }
    // ]


    //   // 1) 순수 코드만 출력 (설명, 부연 금지)
    //   '당신은 “실행 가능한 HTML 문서”만 순수하게 출력해야 합니다.',
    //   '어떠한 부연 설명도, 마크다운 설명도, 리스트도 하지 마세요.',
    //   // 2) 꼭 전체 구조(<html>~</html>)를 포함
    //   '출력 예시: <html><head>…</head><body>…</body></html>',
    //   // 3) CSS 및 JS가 필요하면 <style> 또는 <script> 태그 안에 포함

//    model: 'gpt-4o',


  // AI 스트리밍 호출
  const stream = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    stream: true,


    messages: [
  {
    role: 'system',
    content: [
      '당신은 “실행 가능한 HTML 문서”만 순수하게 출력해야 합니다.',
      '어떠한 부연 설명도, 마크다운 설명도, 리스트도 하지 마세요.',
      '출력 예시: <html><head>…</head><body>…</body></html>',
    ].join(' ')
  },
  { role: 'user', content: message }
]



  });

  // 조각조각 전송
  for await (const chunk of stream) {
    const text = chunk.choices[0].delta?.content;
    if (text) res.write(`data: ${text}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
