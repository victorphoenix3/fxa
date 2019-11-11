/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const unbuf = require('buf').unbuf.hex;
const buf = require('buf').hex;

const P = require('../../promise');

const config = require('../../../config');
const encrypt = require('../encrypt');
const logger = require('../logging')('db');
const mysql = require('./mysql');
const unique = require('../unique');
const redis = require('../../redis');
const MAX_TTL = config.get('oauthServer.expiration.accessToken');

class OauthDB {
  constructor() {
    this.mysql = mysql.connect(config.get('oauthServer.mysql'));
    this.mysql.then(async db => {
      await preClients();
      await scopes();
    });
    this.redis = redis({ enabled: true, prefix: 'oauth:' }, logger); //TODO oauth redis config
    Object.keys(mysql.prototype).forEach(key => {
      const self = this;
      this[key] = async function() {
        const db = await self.mysql;
        return db[key].apply(db, Array.from(arguments));
      };
    });
  }
  disconnect() {}

  async generateAccessToken(vals) {
    // TODO wtf are the types
    const uniqueToken = unique.token();
    const t = {
      clientId: vals.clientId.toString('hex'),
      userId: vals.userId.toString('hex'),
      email: vals.email,
      scope: vals.scope.toString(),
      token: uniqueToken.toString('hex'),
      type: 'bearer',
      expiresAt:
        vals.expiresAt || new Date(Date.now() + (vals.ttl * 1000 || MAX_TTL)),
      profileChangedAt: vals.profileChangedAt || 0,
    };
    const tokenId = encrypt.hash(uniqueToken).toString('hex');
    await this.redis.setAccessToken(tokenId, t);
    t.token = uniqueToken;
    return t;
  }

  async getAccessToken(id) {
    const tokenId = id.toString('hex');
    let t = await this.redis.getAccessToken(tokenId);
    if (t) {
      return t;
    }
    // some might only be in mysql
    // we can remove this code after all mysql tokens have expired
    const db = await this.mysql;
    return db._getAccessToken(id);
  }

  async removeAccessToken(id) {
    const tokenId = id.toString('hex');
    await this.redis.removeAccessToken(tokenId);
    // some might only be in mysql
    // we can remove this code after all mysql tokens have expired
    const db = await this.mysql;
    return db._removeAccessToken(id);
  }

  async getActiveClientsByUid(uid) {
    const tokens = await this.redis.getAccessTokens(uid.toString('hex'));
    const activeClientTokens = [];
    const now = Date.now();
    for (const token of tokens) {
      if (token.expiredAt > now) {
        // TODO > ? <
        const client = await this.getClient(token.clientId);
        if (client.canGrant === false) {
          token.name = client.name;
          activeClientTokens.push(token);
        }
      }
    }
    const db = await this.mysql;
    const refreshTokens = await db.getRefreshTokensByUid(uid);
    for (const token of refreshTokens) {
      const client = await this.getClient(token.clientId);
      activeClientTokens.push({
        id: token.clientId,
        createdAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
        name: client.name,
        scope: token.scope,
      });
    }
    // some might only be in mysql
    // we can remove this code after all mysql tokens have expired
    const olderTokens = await db._getActiveClientsByUid(uid);
    return activeClientTokens.concat(olderTokens);
  }

  async getAccessTokensByUid(uid) {
    const tokens = await this.redis.getAccessTokens(uid.toString('hex'));
    for (const token of tokens) {
      const client = await this.getClient(token.clientId);
      // token.accessTokenId = buf(token.tokenId)
      token.clientName = client.name;
      token.clientCanGrant = client.canGrant;
    }
    // some might only be in mysql
    // we can remove this code after all mysql tokens have expired
    const db = await this.mysql;
    const olderTokens = await db._getAccessTokensByUid(uid);
    return tokens.concat(olderTokens);
  }

  removePublicAndCanGrantTokens(userId) {
    return Promise.reject(new Error('not implemented'));
  }
}

function clientEquals(configClient, dbClient) {
  var props = Object.keys(configClient);
  for (var i = 0; i < props.length; i++) {
    var prop = props[i];
    var configProp = unbuf(configClient[prop]);
    var dbProp = unbuf(dbClient[prop]);
    if (configProp !== dbProp) {
      logger.debug('clients.differ', {
        prop: prop,
        configProp: configProp,
        dbProp: dbProp,
      });
      return false;
    }
  }
  return true;
}

function convertClientToConfigFormat(client) {
  var out = {};

  for (var key in client) {
    if (key === 'hashedSecret' || key === 'hashedSecretPrevious') {
      out[key] = unbuf(client[key]);
    } else if (key === 'trusted' || key === 'canGrant') {
      out[key] = !!client[key]; // db stores booleans as 0 or 1.
    } else if (typeof client[key] !== 'function') {
      out[key] = unbuf(client[key]);
    }
  }
  return out;
}

function preClients() {
  var clients = config.get('oauthServer.clients');
  if (clients && clients.length) {
    logger.debug('predefined.loading', { clients: clients });
    return P.all(
      clients.map(function(c) {
        if (c.secret) {
          // eslint-disable-next-line no-console
          console.error(
            'Do not keep client secrets in the config file.' + // eslint-disable-line no-console
              ' Use the `hashedSecret` field instead.\n\n' +
              '\tclient=%s has `secret` field\n' +
              '\tuse hashedSecret="%s" instead',
            c.id,
            unbuf(encrypt.hash(c.secret))
          );
          return P.reject(
            new Error('Do not keep client secrets in the config file.')
          );
        }

        // ensure the required keys are present.
        var err = null;
        var REQUIRED_CLIENTS_KEYS = [
          'id',
          'hashedSecret',
          'name',
          'imageUri',
          'redirectUri',
          'trusted',
          'canGrant',
        ];
        REQUIRED_CLIENTS_KEYS.forEach(function(key) {
          if (!(key in c)) {
            var data = { key: key, name: c.name || 'unknown' };
            logger.error('client.missing.keys', data);
            err = new Error('Client config has missing keys');
          }
        });
        if (err) {
          return P.reject(err);
        }

        // ensure booleans are boolean and not undefined
        c.trusted = !!c.trusted;
        c.canGrant = !!c.canGrant;
        c.publicClient = !!c.publicClient;

        // Modification of the database at startup in production and stage is
        // not preferred. This option will be set to false on those stacks.
        if (!config.get('oauthServer.db.autoUpdateClients')) {
          return P.resolve();
        }

        return module.exports.getClient(c.id).then(function(client) {
          if (client) {
            client = convertClientToConfigFormat(client);
            logger.info('client.compare', { id: c.id });
            if (clientEquals(client, c)) {
              logger.info('client.compare.equal', { id: c.id });
            } else {
              logger.warn('client.compare.differs', {
                id: c.id,
                before: client,
                after: c,
              });
              return module.exports.updateClient(c);
            }
          } else {
            return module.exports.registerClient(c);
          }
        });
      })
    );
  } else {
    return P.resolve();
  }
}

/**
 * Insert pre-defined list of scopes into the DB
 */
function scopes() {
  var scopes = config.get('oauthServer.scopes');
  if (scopes && scopes.length) {
    logger.debug('scopes.loading', JSON.stringify(scopes));

    return P.all(
      scopes.map(function(s) {
        return module.exports.getScope(s.scope).then(function(existing) {
          if (existing) {
            logger.verbose('scopes.existing', s);
            return;
          }

          return module.exports.registerScope(s);
        });
      })
    );
  }
}

module.exports = new OauthDB();
