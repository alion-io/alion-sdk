'use strict';

const { call } = require('../lib/api');

// the account's job orders (the vacancies it posted on Alion): the dropdown of the actions
module.exports = {
  key: 'job_order',
  noun: 'Job Order',
  display: { label: 'New Job Order', description: 'Triggers when your account posts a new vacancy on Alion (also feeds the job order dropdowns).', hidden: true },
  operation: {
    perform: async (z) => (await call(z, 'order.list', { status: 'all', limit: 100 })).items || [],
    sample: { id: 1234567, title: 'Senior Backend Engineer', status: 'live', url: 'https://alion.io/job/senior-backend-engineer-sample', people: 7 },
  },
};
