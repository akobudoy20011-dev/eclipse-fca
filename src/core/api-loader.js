'use strict';

const { createSendMessage } = require('../api/sendMessage');
const { createCreatePoll } = require('../api/createPoll');
const { createCommentPost } = require('../api/commentPost');
const { createJoinCall } = require('../api/joinCall');
const { createGetThreadInfo } = require('../api/getThreadInfo');

function loadApi(client, options = {}) {
  const operations = options.operations || {};
  const hooks = options.hooks || {};
  return Object.freeze({
    sendMessage: createSendMessage(client, operations, hooks, options.outboundQueue),
    createPoll: createCreatePoll(client, operations, options.outboundQueue),
    commentPost: createCommentPost(client, operations, options.outboundQueue),
    joinCall: createJoinCall(client, operations, hooks, options.outboundQueue),
    getThreadInfo: createGetThreadInfo(client, operations, options.outboundQueue)
  });
}

module.exports = { loadApi };
