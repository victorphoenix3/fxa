local REDIS_SESSION_TOKEN_PROPERTIES = {
  'lastAccessTime',
  'location',
  'uaBrowser',
  'uaBrowserVersion',
  'uaOS',
  'uaOSVersion',
  'uaDeviceType',
  'uaFormFactor'
}
local REDIS_SESSION_TOKEN_LOCATION_PROPERTIES = {
  'city',
  'state',
  'stateCode',
  'country',
  'countryCode'
}

local function packToken(token)
  local result = {}
  for i, name in ipairs(REDIS_SESSION_TOKEN_PROPERTIES) do
    if name == 'location' and type(token[name]) == 'table' then
      local location = token[name]
      local r = {}
      for j, n in ipairs(REDIS_SESSION_TOKEN_LOCATION_PROPERTIES) do
        r[j] = location[n]
      end
      result[i] = r
    else
      result[i] = token[name]
    end
  end
  return result
end

local function decode(value)
  if not value then
    return {}
  end
  return cjson.decode(value)
end

local update = cjson.decode(ARGV[1])
local tokens = decode(redis.call('get', KEYS[1]))

tokens[update.id] = packToken(update)

local result = cjson.encode(tokens)
return redis.call('set', KEYS[1], result)
