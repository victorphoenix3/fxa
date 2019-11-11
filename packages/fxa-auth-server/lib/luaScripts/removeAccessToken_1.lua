local tokenId = KEYS[1]
local value = redis.call('get', tokenId)
if value then
  local token = cjson.decode(value)
  redis.call('srem', token.userId, tokenId)
  return redis.call('del', tokenId)
end
