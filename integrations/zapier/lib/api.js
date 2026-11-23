'use strict';

const crypto = require('crypto');

// Alion's REST API (https://alion.io/developers/docs). ALION_BASE points the tests at another copy of the server.
const BASE = (process.env.ALION_BASE || 'https://alion.io').replace(/\/+$/, '');
const VERSION = require('../package.json').version;

// one route of /api: the envelope {success, response} unwrapped, a refusal raised with Alion's own words
async function call(z, route, body = {}) {
  const response = await z.request({
    url: `${BASE}/api/${route}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
    skipThrowForStatus: true,
  });
  return unwrap(z, response, route);
}

function unwrap(z, response, route) {
  let json = response.data;
  if (json === undefined || typeof json === 'string') {
    try {
      json = JSON.parse(response.content);
    } catch (e) {
      throw new z.errors.Error(`Alion answered ${route} with HTTP ${response.status} and no JSON`, 'AlionError', response.status);
    }
  }
  if (json && json.success === true) return json.response || {};
  const err = (json && json.error) || {};
  const data = err.error_data || {};
  const first = Array.isArray(data) && data[0] ? Object.values(data[0])[0] : undefined;
  const message = String(data.message || first || err.error_msg || `Alion refused ${route}`);
  if (response.status === 401) throw new z.errors.Error(`Your Alion API key was refused: ${message}`, 'AuthenticationError', 401);
  throw new z.errors.Error(message, 'AlionError', response.status);
}

// X-Alion-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">, within five minutes
function verify(raw, header, secret, now = Math.floor(Date.now() / 1000)) {
  const parts = {};
  for (const kv of String(header || '').split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = Number(parts.t);
  if (!t || Math.abs(now - t) > 300 || !/^[0-9a-f]{64}$/.test(parts.v1 || '')) return false;
  const want = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(parts.v1));
}

// an event's envelope as one Zap item: the event's data with its id, name and time on top
function flatten(envelope) {
  const env = envelope || {};
  return { id: env.id, event: env.event, created: env.created, test: env.test === true, ...(env.data || {}) };
}

module.exports = { BASE, VERSION, call, unwrap, verify, flatten };
