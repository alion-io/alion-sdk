'use strict';

const { call } = require('../lib/api');

const STAGES = { new: 'New', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' };

module.exports = {
  key: 'move_on_shortlist',
  noun: 'Shortlist Entry',
  display: { label: 'Move Person on Shortlist', description: "Moves a person of a job order's shortlist to another stage, or removes a person you added." },
  operation: {
    inputFields: [
      { key: 'order_id', label: 'Job Order', required: true, dynamic: 'job_order.id.title' },
      { key: 'person', label: 'Person', required: true, helpText: 'The person_id (p_...), the Alion handle or the alion.io/user/... link.' },
      { key: 'stage', label: 'Stage', choices: STAGES, helpText: 'A person who applied hears of the move, as on the site.' },
      { key: 'remove', label: 'Remove Instead', type: 'boolean', default: 'false', helpText: 'Remove a person your account added (an application stays: move it to Rejected).' },
    ],
    perform: (z, bundle) => {
      const d = bundle.inputData;
      const remove = d.remove === true || d.remove === 'true' || d.remove === 'yes';
      if (!remove && !d.stage) throw new z.errors.Error('Pick a stage, or set Remove Instead.', 'InvalidData', 400);
      return remove
        ? call(z, 'shortlist.remove', { order_id: d.order_id, person: d.person })
        : call(z, 'shortlist.stage', { order_id: d.order_id, person: d.person, stage: d.stage });
    },
    sample: { order_id: 1234567, person_id: 'p_3f9a1c2e7b6d4a80', stage: 'interview', was: 'screening' },
  },
};
