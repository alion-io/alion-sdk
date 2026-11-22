// An agent with the Vercel AI SDK that researches companies with Alion's tools. Without ALION_API_KEY it gets the free
// tools; the model needs its own key (here through the AI Gateway: AI_GATEWAY_API_KEY).
//
//   npm install @alion-io/sdk ai
//   AI_GATEWAY_API_KEY=... node ai-agent.mjs "Which fintech startups in Germany are hiring engineers?"
import { generateText, stepCountIs } from 'ai';
import { alionTools } from '@alion-io/sdk/ai-sdk';

const prompt = process.argv[2] ?? 'Find five fintech startups in Germany that are hiring, and say what each one does.';

const { text, steps } = await generateText({
    model: process.env.MODEL ?? 'anthropic/claude-sonnet-5-5',
    tools: alionTools({ maxCredits: 10 }),
    stopWhen: stepCountIs(6),
    prompt,
});
console.log(text);
console.error(`${steps.length} steps, tools used: ${[...new Set(steps.flatMap((s) => s.toolCalls.map((c) => c.toolName)))].join(', ')}`);
