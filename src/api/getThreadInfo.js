'use strict';

const { createOperationExecutor } = require('./_operation');

function createGetThreadInfo(client, operations, outboundQueue = null) {
  const execute = createOperationExecutor(client, operations, outboundQueue);
  return async function getThreadInfo(threadID) {
    if (typeof threadID !== 'string' || !threadID) throw new TypeError('threadID is required.');
    return execute('getThreadInfo', { threadID });
  };
}

module.exports = { createGetThreadInfo };
