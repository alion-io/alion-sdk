'use strict';

const zapier = require('zapier-platform-core');
const { BASE, VERSION } = require('./lib/api');
const events = require('./triggers/events');
const jobOrder = require('./triggers/job_orders');
const addToShortlist = require('./creates/add_to_shortlist');
const moveOnShortlist = require('./creates/move_on_shortlist');
const findPerson = require('./searches/find_person');

// the key on every request (Authorization: Bearer), and the client named in Alion's journal
const addKey = (request, z, bundle) => {
  request.headers = request.headers || {};
  if (bundle.authData && bundle.authData.api_key) request.headers.Authorization = `Bearer ${bundle.authData.api_key}`;
  request.headers['User-Agent'] = `alion-zapier/${VERSION}`;
  return request;
};

const triggers = {};
for (const t of [...events.triggers, jobOrder]) triggers[t.key] = t;

module.exports = {
  version: VERSION,
  platformVersion: zapier.version,
  authentication: {
    type: 'custom',
    fields: [{ key: 'api_key', label: 'API Key', required: true, type: 'password', helpText: 'A key from [alion.io/developers/keys](https://alion.io/developers/keys).' }],
    test: { url: `${BASE}/api/webhook.list`, method: 'POST', body: {}, headers: { 'Content-Type': 'application/json' } },
  },
  beforeRequest: [addKey],
  triggers,
  creates: { [addToShortlist.key]: addToShortlist, [moveOnShortlist.key]: moveOnShortlist },
  searches: { [findPerson.key]: findPerson },
};
