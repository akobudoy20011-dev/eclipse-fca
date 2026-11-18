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
    sendMessage: createSendMessage(client, operations),
    createPoll: createCreatePoll(client, operations),
    commentPost: createCommentPost(client, operations),
    joinCall: createJoinCall(client, operations, hooks),
    getThreadInfo: createGetThreadInfo(client, operations)
  });
}

module.exports = { loadApi };
