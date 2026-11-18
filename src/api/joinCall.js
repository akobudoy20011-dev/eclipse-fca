'use strict';

const { createOperationExecutor } = require('./_operation');

function createJoinCall(client, operations, hooks = {}) {
  const execute = createOperationExecutor(client, operations);
  return async function joinCall(input = {}) {
    if (!input.threadID || typeof input.threadID !== 'string') throw new TypeError('threadID is required.');
    if (typeof hooks.onSignal !== 'function') {
      throw new Error('joinCall requires an application-provided onSignal WebRTC signaling hook.');
    }
    const result = await execute('joinCall', { threadID: input.threadID, callType: input.callType || 'audio' });
    if (result?.signaling != null) await hooks.onSignal(result.signaling, { threadID: input.threadID });
    return result;
  };
}

module.exports = { createJoinCall };
