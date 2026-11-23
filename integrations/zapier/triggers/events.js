'use strict';

const { call, verify, flatten } = require('../lib/api');

// Alion's live webhook events, each a REST hook trigger: turning a Zap on subscribes its address at Alion (webhook.subscribe,
// shown on alion.io/developers/webhooks marked Zapier), turning it off removes it. Every delivery's X-Alion-Signature is checked
// with the secret Alion gave that subscription.
const EVENTS = [
  ['candidate.replied', 'Candidate Replied', 'Triggers when a person answers in a conversation you started in Alion Messages.', 'Reply'],
  ['candidate.consented', 'Candidate Shared Contacts', 'Triggers when a person gives you their contacts: shares them in Messages, or applies to your vacancy.', 'Consent'],
  ['candidate.consent_revoked', 'Candidate Stopped Sharing Contacts', 'Triggers when a person stops sharing their contacts with you: remove the phone and messengers you got from them.', 'Consent'],
  ['candidate.erased', 'Candidate Asked to Be Forgotten', 'Triggers when a person your account was given deletes their account, hides their profile or says no to recruitment agencies: delete them.', 'Erasure'],
  ['shortlist.candidate_added', 'Candidate Added to Shortlist', 'Triggers when a person joins the shortlist of one of your job orders: they applied, or you added them.', 'Shortlist Entry'],
  ['order.new_matches', 'New Matches for Job Order', 'Triggers when new people fit one of your live job orders (checked daily).', 'Match'],
  ['role.became_hard', 'Role Became Hard to Fill', 'Triggers when roles of a saved Recruiting selection become hard to fill (open 61+ days, or re-posted).', 'Hard Role'],
  ['window.opened', 'Buying Window Opened', 'Triggers when a buying window opens at a company of your Leads list.', 'Buying Window'],
];

// the header as Zapier hands it (its raw request names headers "Http-X-Alion-Signature")
function header(raw, name) {
  const headers = (raw && raw.headers) || {};
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want || k.toLowerCase() === `http-${want}`) return v;
  return '';
}

// each event's data as Alion's own sample has it (the shapes of WebhookEvents::sample, taken from alion.io): the sample of the Zap
// editor and the output fields Zapier compares a live event with
const SAMPLES = require('./samples.json');

function sampleOf(event) {
  return flatten({ id: `evt_sample_${event.replace(/\./g, '_')}`, event, created: '2026-11-23T12:00:00Z', test: true, data: SAMPLES[event] || {} });
}

// the fields of a sample, as Zapier names them (nested keys joined by "__", the rows of a list as "list[]key")
function fieldsOf(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const key = `${prefix}${k}`;
    if (Array.isArray(v)) {
      if (v.length && v[0] && typeof v[0] === 'object') for (const [ik, iv] of Object.entries(v[0])) { if (iv === null || typeof iv !== 'object') out.push({ key: `${key}[]${ik}`, label: `${label(k)} ${label(ik)}`, ...typeOf(iv) }); }
      else out.push({ key: `${key}[]`, label: label(k) });
    } else if (v && typeof v === 'object') fieldsOf(v, `${key}__`, out);
    else out.push({ key, label: label(key.replace(/__/g, ' ')), ...typeOf(v) });
  }
  return out;
}

function typeOf(v) {
  return Number.isInteger(v) ? { type: 'integer' } : typeof v === 'number' ? { type: 'number' } : typeof v === 'boolean' ? { type: 'boolean' } : {};
}

function label(k) {
  return String(k).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bId\b/g, 'ID').replace(/\bUrl\b/g, 'URL').replace(/\bUsd\b/g, 'USD');
}

function hookTrigger([event, label, description, noun]) {
  return {
    key: event.replace(/\./g, '_'),
    noun,
    display: { label, description },
    operation: {
      type: 'hook',
      performSubscribe: (z, bundle) => call(z, 'webhook.subscribe', { url: bundle.targetUrl, events: event, source: 'zapier' }),
      performUnsubscribe: (z, bundle) => call(z, 'webhook.unsubscribe', { id: bundle.subscribeData.id }),
      perform: (z, bundle) => {
        const secret = bundle.subscribeData && bundle.subscribeData.secret;
        const raw = bundle.rawRequest;
        if (secret && raw && raw.content !== undefined && !verify(raw.content, header(raw, 'X-Alion-Signature'), secret)) {
          z.console.log('Alion: a delivery with a wrong X-Alion-Signature was dropped');
          return [];
        }
        return [flatten(bundle.cleanedRequest)];
      },
      performList: async (z) => ((await call(z, 'webhook.samples', { event })).items || []).map(flatten),
      sample: sampleOf(event),
      outputFields: fieldsOf(sampleOf(event)),
    },
  };
}

module.exports = { EVENTS, triggers: EVENTS.map(hookTrigger) };
