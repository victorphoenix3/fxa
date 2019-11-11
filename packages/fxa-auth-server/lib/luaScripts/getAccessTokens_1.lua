local userId = KEYS[1]
local value = redis.call('smembers', userId)
local result = {}
if value then
  for i, tokenId in ipairs(value) do
    result[i] = redis.call('get', tokenId)
  end
end
return result
