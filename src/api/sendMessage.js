'use strict';

const { createOperationExecutor } = require('./_operation');

function normalizeMentions(mentions = []) {
  if (!Array.isArray(mentions)) throw new TypeError('mentions must be an array.');
  return mentions.map((mention, index) => {
    if (!mention || typeof mention !== 'object') throw new TypeError(`mentions[${index}] must be an object.`);
    const tag = String(mention.tag ?? '');
    const id = String(mention.id ?? '');
    const fromIndex = Number(mention.fromIndex);
    if (!tag || !id || !Number.isInteger(fromIndex) || fromIndex < 0) {
      throw new TypeError(`mentions[${index}] requires tag, id, and a non-negative fromIndex.`);
    }
    return { tag, id, fromIndex, length: tag.length };
  });
}

function createSendMessage(client, operations, hooks = {}, outboundQueue = null) {
  const execute = createOperationExecutor(client, operations, outboundQueue);
  return async function sendMessage(input = {}) {
    if (!input.threadID || typeof input.threadID !== 'string') throw new TypeError('threadID is required.');
    if (typeof input.body !== 'string' || !input.body.length) throw new TypeError('body must be a non-empty string.');
    const mentions = normalizeMentions(input.mentions || []);
    for (const mention of mentions) {
      if (input.body.slice(mention.fromIndex, mention.fromIndex + mention.length) !== mention.tag) {
        throw new TypeError('Each mention tag must match the message body at its fromIndex.');
      }
    }
    const beforeSend = input.typingIndicator === true
      ? async () => {
        if (typeof hooks.sendTypingIndicator !== 'function') {
          throw new TypeError('typingIndicator requires an application-provided sendTypingIndicator hook.');
        }
        await hooks.sendTypingIndicator({ threadID: input.threadID, state: 'typ' });
      }
      : undefined;
    return execute('sendMessage', {
      threadID: input.threadID,
      body: input.body,
      mentions: mentions.map(({ tag, id, fromIndex, length }) => ({ tag, id, fromIndex, length }))
    }, { beforeSend });
  };
}

module.exports = { createSendMessage, normalizeMentions };
