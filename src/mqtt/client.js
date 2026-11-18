'use strict';

const { EventEmitter } = require('node:events');
const { TransportError, ConfigurationError } = require('../core/errors');
const { createProxyAgents } = require('../core/proxy');
const { serializeCookies } = require('../utils/cookies');
const { validateFacebookUrl } = require('../utils/url-security');
const { decodePayload } = require('./decoder');

function createMqttListener(options = {}) {
  const { endpoint, session, network = { mode: 'direct' }, topics = [], mqttOptions = {} } = options;
  validateFacebookUrl(endpoint, 'wss:', 'MQTT endpoint');
  if (!session?.userId || !Array.isArray(session.cookies)) {
    throw new ConfigurationError('An authenticated session is required before starting MQTT.');
  }
  if (!Array.isArray(topics) || topics.some(topic => typeof topic !== 'string' || !topic)) {
    throw new ConfigurationError('MQTT topics must be an array of non-empty strings.');
  }

  let mqtt;
  try { mqtt = require('mqtt'); } catch (cause) {
    throw new ConfigurationError('Install the mqtt dependency to enable the realtime listener.', { cause });
  }

  const emitter = new EventEmitter();
  const headers = { ...(mqttOptions.wsOptions?.headers || {}), cookie: serializeCookies(session.cookies) };
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

  connection.on('connect', () => {
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
    emitter.emit('message', { topic, payload: decoded, qos: packet?.qos ?? 0, retained: Boolean(packet?.retain) });
    if (decoded && typeof decoded === 'object' && typeof decoded.type === 'string') {
      emitter.emit(decoded.type, decoded);
    }
  });
  connection.on('reconnect', () => emitter.emit('reconnect'));
  connection.on('close', () => emitter.emit('close'));
  connection.on('offline', () => emitter.emit('offline'));
  connection.on('error', error => emitter.emit('error', new TransportError('MQTT connection error.', {
    code: 'ERR_MQTT_CONNECTION',
    details: { transportCode: typeof error.code === 'string' ? error.code : undefined }
  })));

  return Object.freeze({
    on: emitter.on.bind(emitter),
    once: emitter.once.bind(emitter),
    off: emitter.off.bind(emitter),
    subscribe(topicOrTopics) {
      return new Promise((resolve, reject) => connection.subscribe(topicOrTopics, (error, granted) => error ? reject(error) : resolve(granted)));
    },
    publish(topic, payload, publishOptions) {
      return new Promise((resolve, reject) => connection.publish(topic, typeof payload === 'string' ? payload : JSON.stringify(payload), publishOptions || {}, error => error ? reject(error) : resolve()));
    },
    close() {
      return new Promise(resolve => connection.end(false, {}, resolve));
    },
    get connected() { return connection.connected; }
  });
}

module.exports = { createMqttListener };
