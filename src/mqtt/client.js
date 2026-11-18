'use strict';

const { EventEmitter } = require('node:events');
const { TransportError, ConfigurationError } = require('../core/errors');
const { createProxyAgents } = require('../core/proxy');
const { serializeCookies } = require('../utils/cookies');
const { validateFacebookUrl } = require('../utils/url-security');
const { decodePayload } = require('./decoder');
const { createBrowserHeaders } = require('../utils/browser-profile');
const { createAcknowledgementDispatcher } = require('./acknowledgements');

function expiryReasonFromPayload(decoded, topic) {
  const text = typeof decoded === 'string' ? decoded : JSON.stringify(decoded ?? '');
  if (/\/checkpoint(?:\/|\?|["'\s]|$)/i.test(text)) return 'checkpoint';
  if (/(?:1357001|1357004)/.test(text)) return 'auth_error';
  if (decoded && typeof decoded === 'object' &&
      ['session_expired', 'auth_error', 'logged_out', 'checkpoint'].includes(decoded.type)) {
    return decoded.type === 'checkpoint' ? 'checkpoint' : 'auth_error';
  }
  return null;
}

function createMqttListener(options = {}) {
  const {
    endpoint, session, network = { mode: 'direct' }, topics = [], mqttOptions = {},
    browserProfile, hooks = {}, acknowledgements = {}
  } = options;
  validateFacebookUrl(endpoint, 'wss:', 'MQTT endpoint');
  if (!session?.userId || !Array.isArray(session.cookies)) {
    throw new ConfigurationError('An authenticated session is required before starting MQTT.');
  }
  if (!Array.isArray(topics) || topics.some(topic => typeof topic !== 'string' || !topic)) {
    throw new ConfigurationError('MQTT topics must be an array of non-empty strings.');
  }

  const onSessionExpired = typeof options.onSessionExpired === 'function' ? options.onSessionExpired : () => {};
  let mqtt;
  try { mqtt = require('mqtt'); } catch {
    throw new ConfigurationError('Install the mqtt dependency to enable the realtime listener.');
  }

  const emitter = new EventEmitter();
  const headers = {
    ...(mqttOptions.wsOptions?.headers || {}),
    ...createBrowserHeaders(browserProfile),
    cookie: serializeCookies(session.cookies)
  };
  const wsOptions = { ...(mqttOptions.wsOptions || {}), headers };
  if (network.mode === 'proxy') {
    const agents = createProxyAgents(network.proxy);
    wsOptions.agent = agents.httpsAgent;
  }

  const connection = mqtt.connect(endpoint, {
    protocolVersion: 4,
    reconnectPeriod: 0,
    ...mqttOptions,
    wsOptions
  });
  const acknowledgementDispatcher = createAcknowledgementDispatcher({
    config: acknowledgements,
    hooks,
    onError: event => emitter.emit('acknowledgement_error', event)
  });
  let expiryHandled = false;
  const trip = reason => {
    if (expiryHandled) return;
    expiryHandled = true;
    Promise.resolve(onSessionExpired(reason)).catch(() => {});
  };

  connection.on('connect', packet => {
    if (packet?.returnCode === 4 || packet?.returnCode === 5) {
      trip('mqtt_auth_rejected');
      connection.end(true);
      return;
    }
    emitter.emit('connect');
    if (topics.length) connection.subscribe(topics, error => {
      if (error) emitter.emit('error', new TransportError('MQTT topic subscription failed.', {
        code: 'ERR_MQTT_SUBSCRIBE',
        details: { transportCode: typeof error.code === 'string' ? error.code : undefined }
      }));
      else emitter.emit('subscribed', topics.slice());
    });
  });
  connection.on('message', (topic, payload, packet) => {
    const decoded = decodePayload(payload);
    const expiry = expiryReasonFromPayload(decoded, topic);
    if (expiry) {
      trip(expiry);
      connection.end(true);
      return;
    }
    const event = { topic, payload: decoded, qos: packet?.qos ?? 0, retained: Boolean(packet?.retain) };
    emitter.emit('message', event);
    acknowledgementDispatcher.dispatch(event);
    if (decoded && typeof decoded === 'object' && typeof decoded.type === 'string') {
      emitter.emit(decoded.type, decoded);
    }
  });
  connection.on('reconnect', () => emitter.emit('reconnect'));
  connection.on('close', () => {
    acknowledgementDispatcher.close();
    emitter.emit('close');
  });
  connection.on('offline', () => emitter.emit('offline'));
  connection.on('error', error => {
    if (['1357001', '1357004'].includes(String(error?.code))) trip('mqtt_auth_rejected');
    emitter.emit('error', new TransportError('MQTT connection error.', {
      code: 'ERR_MQTT_CONNECTION',
      details: { transportCode: typeof error.code === 'string' ? error.code : undefined }
    }));
  });

  return Object.freeze({
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    subscribe(topicOrTopics) {
      return new Promise((resolve, reject) => connection.subscribe(topicOrTopics, (error, granted) => error ? reject(new TransportError('MQTT subscription failed.', { code: 'ERR_MQTT_SUBSCRIBE' })) : resolve(granted)));
    },
    publish(topic, payload, publishOptions) {
      return new Promise((resolve, reject) => connection.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), publishOptions || {}, error => error ? reject(new TransportError('MQTT publish failed.', { code: 'ERR_MQTT_PUBLISH' })) : resolve()));
    },
    close() {
      acknowledgementDispatcher.close();
      return new Promise(resolve => connection.end(false, {}, resolve));
    },
    get connected() { return connection.connected; }
  });
}

module.exports = { createMqttListener, expiryReasonFromPayload };
