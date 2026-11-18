'use strict';

const { ConfigurationError, TransportError } = require('../core/errors');
const { validateFacebookUrl } = require('../utils/url-security');

function parseOperationResponse(raw, name = 'operation', status) {
  const normalized = typeof raw === 'string' ? raw.replace(/^for\\s*\\(;;\\);?\\s*/, '') : raw;
  let data = normalized;
  if (typeof normalized === 'string') {
    try { data = JSON.parse(normalized); } catch {
      throw new TransportError(`API operation "${name}" returned an unrecognized response.`, {
        code: 'ERR_API_RESPONSE_PARSE',
        details: { operation: name, status }
      });
    }
  }
  if (data?.errors?.length) {
    throw new TransportError(`API operation "${name}" returned an application error.`, {
      code: 'ERR_API_APPLICATION',
      details: { operation: name, errorCount: data.errors.length }
    });
  }
  return data;
}

function createOperationExecutor(client, operationMap = {}) {
  return async function execute(name, input) {
    const operation = operationMap[name];
    if (!operation || typeof operation !== 'object') {
      throw new ConfigurationError(`No verified API operation descriptor configured for "${name}".`);
    }
    if (typeof operation.docId !== 'string' || !operation.docId.trim()) {
      throw new ConfigurationError(`API operation "${name}" requires a verified docId.`);
    }
    const endpoint = operation.endpoint || 'https://www.facebook.com/api/graphql/';
    validateFacebookUrl(endpoint, 'https:', `API operation "${name}" endpoint`);
    let variables;
    if (typeof operation.buildVariables === 'function') {
      variables = await operation.buildVariables(input, client.session);
    } else if (operation.variables && typeof operation.variables === 'object') {
      variables = { ...operation.variables, input };
    } else {
      throw new ConfigurationError(`API operation "${name}" requires buildVariables() or a variables object.`);
    }
    if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
      throw new ConfigurationError(`API operation "${name}" produced invalid variables.`);
    }

    const session = client.session;
    if (!session?.userId || !session.tokens?.fb_dtsg) {
      throw new ConfigurationError('Login with an authorized appState session before calling Messenger API methods.');
    }

    const form = new URLSearchParams({
      doc_id: operation.docId,
      variables: JSON.stringify(variables),
      fb_dtsg: session.tokens.fb_dtsg,
      __user: session.userId,
      __a: '1'
    });
    if (session.tokens.lsd) form.set('lsd', session.tokens.lsd);
    if (session.tokens.jazoest) form.set('jazoest', session.tokens.jazoest);

    const response = await client.request({
      method: 'POST',
      url: endpoint,
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-fb-friendly-name': operation.friendlyName || name
      },
      data: form.toString(),
      responseType: 'text'
    });

    return parseOperationResponse(response.data, name, response.status);
  };
}

module.exports = { createOperationExecutor, parseOperationResponse };
