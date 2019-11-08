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

local function unpackArray(keys, values)
  local result = {}
  for i, k in ipairs(keys) do
    result[k] = values[i]
  end
  return result
end

local function unpack(value)
  if not value then
    return {}
  end
  local result = {}
  local tokens = cjson.decode(value)
  for id, values in pairs(tokens) do
    if type(values) == 'table' and values[1] then
      -- it's an array
      local token = unpackArray(REDIS_SESSION_TOKEN_PROPERTIES, values)
      if type(token.location) == 'table' then
        token.location = unpackArray(REDIS_SESSION_TOKEN_LOCATION_PROPERTIES, token.location)
      end
      result[id] = token
    else
      -- it's a value or object
      result[id] = values
    end
  end
  return result
end

local value = redis.call('get', KEYS[1])
local result = cjson.encode(unpack(value))
return result
-- TODO delete on unpack error
