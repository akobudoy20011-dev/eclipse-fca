'use strict';

const { createOperationExecutor } = require('./_operation');

function createCreatePoll(client, operations, outboundQueue = null) {
  const execute = createOperationExecutor(client, operations, outboundQueue);
  return async function createPoll(input = {}) {
    if (!input.threadID || typeof input.threadID !== 'string') throw new TypeError('threadID is required.');
    if (typeof input.question !== 'string' || !input.question.trim()) throw new TypeError('question is required.');
    if (!Array.isArray(input.options) || input.options.length < 2 ||
        input.options.some(option => typeof option !== 'string' || !option.trim())) {
      throw new TypeError('options must contain at least two non-empty strings.');
    }
    return execute('createPoll', {
      threadID: input.threadID,
      question: input.question.trim(),
      options: input.options.map(option => option.trim()),
      allowMultiple: Boolean(input.allowMultiple)
    });
  };
}

module.exports = { createCreatePoll };
