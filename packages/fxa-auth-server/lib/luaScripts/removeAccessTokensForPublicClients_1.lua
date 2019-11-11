local uid = KEYS[1]
local ids = redis.call('smembers', uid)
local tokens = {}

for _, id in ipairs(ids) do
  local v = redis.call('get', id)
  local t = cjson.decode(v)
end
