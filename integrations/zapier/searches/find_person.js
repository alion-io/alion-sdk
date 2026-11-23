'use strict';

const { call } = require('../lib/api');

module.exports = {
  key: 'find_person',
  noun: 'Person',
  display: { label: 'Find Person', description: "Finds a person's open profile on Alion by person_id, handle or link. Contacts come only where the person gave them to your account; never the email." },
  operation: {
    inputFields: [{ key: 'person', label: 'Person', required: true, helpText: 'The person_id (p_...), the Alion handle or the alion.io/user/... link.' }],
    perform: async (z, bundle) => {
      try {
        const p = await call(z, 'people.get', { person: bundle.inputData.person });
        return [{ ...p, id: p.person_id }];
      } catch (e) {
        // (a person not found, or not open to your account, is an empty search, not a failed Zap)
        // (zapier's Error carries its status inside the message: {"message","code","status"})
        if (e.status === 404 || /"status":404/.test(String(e.message))) return [];
        throw e;
      }
    },
    sample: { id: 'p_3f9a1c2e7b6d4a80', person_id: 'p_3f9a1c2e7b6d4a80', person: 'sample-backend-engineer', name: 'Sam P.', headline: 'Backend · senior', url: 'https://alion.io/user/sample-backend-engineer' },
  },
};
