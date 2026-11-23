'use strict';

const { call } = require('../lib/api');

module.exports = {
  key: 'add_to_shortlist',
  noun: 'Shortlist Entry',
  display: { label: 'Add Person to Shortlist', description: 'Adds a person to the shortlist of one of your job orders, at the stage New. The person is told they are on a shortlist.' },
  operation: {
    inputFields: [
      { key: 'order_id', label: 'Job Order', required: true, dynamic: 'job_order.id.title', helpText: 'One of the vacancies your account posted on Alion.' },
      { key: 'person', label: 'Person', required: true, helpText: 'The person_id (p_...), the Alion handle or the alion.io/user/... link.' },
    ],
    perform: (z, bundle) => call(z, 'shortlist.add', { order_id: bundle.inputData.order_id, person: bundle.inputData.person }),
    sample: { order_id: 1234567, person_id: 'p_3f9a1c2e7b6d4a80', person: 'sample-backend-engineer', added: true, stage: 'new', match_percent: 84 },
  },
};
