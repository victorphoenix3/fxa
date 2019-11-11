-- maybe store as msgpack?
local userId = KEYS[1]
local tokenId = KEYS[2]
redis.call('set', tokenId, ARGV[1])
return redis.call('sadd', userId, tokenId)
