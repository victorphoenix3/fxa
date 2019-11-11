/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use strict';

const Redis = require('ioredis');
const ScopeSet = require('../../fxa-shared').oauth.scopes;
const { readdirSync, readFileSync } = require('fs');
const { basename, extname, resolve } = require('path');

const scriptNames = readdirSync(resolve(__dirname, 'luaScripts'), {
  withFileTypes: true,
})
  .filter(de => de.isFile() && extname(de.name) === '.lua')
  .map(de => basename(de.name, '.lua'));

function readScript(name) {
  return readFileSync(resolve(__dirname, 'luaScripts', `${name}.lua`), {
    encoding: 'utf8',
  });
}

class FxaRedis {
  constructor(config, log) {
    config.keyPrefix = config.prefix;
    this.log = log;
    this.redis = new Redis(config);
    scriptNames.forEach(name => this.defineCommand(name));
  }

  defineCommand(scriptName) {
    const [name, numberOfKeys] = scriptName.split('_');
    this.redis.defineCommand(name, {
      lua: readScript(scriptName),
      numberOfKeys: +numberOfKeys,
    });
  }

  touchSessionToken(uid, token) {
    return this.redis.touchSessionToken(uid, JSON.stringify(token));
  }

  pruneSessionTokens(uid, tokenIds) {
    return this.redis.pruneSessionTokens(uid, JSON.stringify(tokenIds));
  }

  async getSessionTokens(uid) {
    try {
      const value = await this.redis.getSessionTokens(uid);
      return JSON.parse(value);
    } catch (e) {
      this.log.error('redis', e);
      return {};
    }
  }

  async getAccessToken(tokenId) {
    try {
      const value = await this.redis.getAccessToken(tokenId);
      const token = JSON.parse(value);
      token.userId = Buffer.from(token.userId, 'hex');
      token.clientId = Buffer.from(token.clientId, 'hex');
      token.scope = ScopeSet.fromString(token.scope);
      token.token = Buffer.from(token.token, 'hex');
      return token;
    } catch (e) {
      this.log.error('redis', e);
      return null;
    }
  }

  async getAccessTokens(uid) {
    try {
      const values = await this.redis.getAccessTokens(uid);
      return values.map(v => JSON.parse(v));
    } catch (e) {
      this.log.error('redis', e);
      return [];
    }
  }

  setAccessToken(tokenId, token) {
    return this.redis.setAccessToken(
      token.userId,
      tokenId,
      JSON.stringify(token)
    );
  }

  removeAccessToken(tokenId) {
    return this.redis.removeAccessToken(tokenId);
  }

  close() {
    return this.redis.quit();
  }

  del(key) {
    return this.redis.del(key);
  }

  get(key) {
    return this.redis.get(key);
  }

  set(key, val) {
    return this.redis.set(key, val);
  }
  zadd(key, ...args) {
    return this.redis.zadd(key, ...args);
  }
  zrange(key, start, stop, withScores) {
    if (withScores) {
      return this.redis.zrange(key, start, stop, 'WITHSCORES');
    }
    return this.redis.zrange(key, start, stop);
  }
  zrangebyscore(key, min, max) {
    return this.redis.zrangebyscore(key, min, max);
  }
  zrem(key, ...members) {
    return this.redis.zrem(key, members);
  }
  zrevrange(key, start, stop) {
    return this.redis.zrevrange(key, start, stop);
  }
  zrevrangebyscore(key, min, max) {
    return this.redis.zrevrangebyscore(key, min, max);
  }

  async zpoprangebyscore(key, min, max) {
    const args = Array.from(arguments);
    const results = await this.redis
      .multi()
      .zrangebyscore(...args)
      .zremrangebyscore(key, min, max)
      .exec();
    return results[0][1];
  }
}

module.exports = (config, log) => {
  if (!config.enabled) {
    return;
  }
  return new FxaRedis(config, log);
};
