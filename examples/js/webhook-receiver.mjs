// A webhook receiver for Alion watches and agent events. It checks the X-Alion-Signature of every delivery before
// trusting it.
//
//   npm install @alion-io/sdk
//   ALION_WEBHOOK_SECRET=... node webhook-receiver.mjs     # listens on :8080; put it behind https
import { createServer } from 'node:http';
import { verifyWebhook } from '@alion-io/sdk';

const secret = process.env.ALION_WEBHOOK_SECRET ?? '';

createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    if (req.method !== 'POST' || !(await verifyWebhook(body, req.headers['x-alion-signature'], secret))) {
        res.writeHead(401).end();
        return;
    }
    console.log(req.headers['x-alion-event'], body.toString('utf8').slice(0, 300));
    res.writeHead(204).end();
}).listen(Number(process.env.PORT ?? 8080));
