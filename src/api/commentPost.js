'use strict';

const { createOperationExecutor } = require('./_operation');

function createCommentPost(client, operations, outboundQueue = null) {
  const execute = createOperationExecutor(client, operations, outboundQueue);
  return async function commentPost(input = {}) {
    if (!input.postID || typeof input.postID !== 'string') throw new TypeError('postID is required.');
    if (typeof input.message !== 'string' || !input.message.trim()) throw new TypeError('message is required.');
    if (input.parentCommentID != null && typeof input.parentCommentID !== 'string') {
      throw new TypeError('parentCommentID must be a string when replying to a comment.');
    }
    return execute('commentPost', {
      postID: input.postID,
      message: input.message,
      parentCommentID: input.parentCommentID || null
    });
  };
}

module.exports = { createCommentPost };
