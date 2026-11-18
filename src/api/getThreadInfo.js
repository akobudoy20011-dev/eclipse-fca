'use strict';

const { createOperationExecutor } = require('./_operation');

function createGetThreadInfo(client, operations) {
  const execute = createOperationExecutor(client, operations);
  return async function getThreadInfo(threadID) {
    if (typeof threadID !== 'string' || !threadID) throw new TypeError('threadID is required.');
    return execute('getThreadInfo', { threadID });
  };
}

module.exports = { createGetThreadInfo };
