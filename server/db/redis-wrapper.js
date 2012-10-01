/*jshint strict:true node:true es5:true onevar:true laxcomma:true laxbreak:true*/
(function () {
  "use strict";

  var redis = require('redis')
    ;

  function RedisWrapper(opts) {

    var client
      , connectionAttempts = 0
      , maxAttempts = 4
      ;

    function createClient(opts) {
      client = redis.createClient(opts.socket);
      client.on('connect', selectDb);
      client.on('error', handleError);
    }

    function selectDb() {
      client.select(opts.database || 0, function (err, res) {
        if (err) {
          handleError(err);
        }
      });
    }

    function handleError(err) {
      connectionAttempts += 1;
      console.error("[dropshare redis]", err.message);

      if (connectionAttempts > maxAttempts) {
        console.error(
            "[dropshare redis] could not connect to redis database after"
          , connectionAttempts
          , "attempts"
        );
        client.quit();
        return;
      }

      // Wait for 1 second then try to reconnect to redis.
      setTimeout(createClient(opts), 1000);
    }

    createClient(opts);

    return {
      set: function (id, val, cb) {
        if (typeof(cb) === 'undefined') {
          cb = function (err, data) {};
        }

        if (typeof(val) !== "string") {
          val = JSON.stringify(val);
        }

        client.set(id, val, cb);
      },

      get: function (id, cb) {
        client.get(id, function (err, data) {
          var isJSON = true;
          if (data) {
            // If JSON was not stored, then what to do? we need to catch it somehow
            try {
              data = JSON.parse(data);
            }
            catch (e) {
              console.warn('data was not json. hope that is okay');
              isJSON = false;
            }
          }
          cb(err, data, isJSON);
        });
      },

      query: function (query, cb) {
        var matches = []
          , self = this
          , keys
          ;

        function queryEach(key, obj) {
     
          function matchEach(key) {
            var q = query[key]
              , v = obj[key]
              ;

            if (('function' === typeof q && q(v)) || q.test(v)) {
              matches.push(obj);
              return true;
            }
          }

          obj._id = key;
          Object.keys(query).some(matchEach);
        }

        function doQuery(key, i) {
          /*jshint validthis:true*/
          try {
            this[i] = JSON.parse(this[i]);
          } catch(e) {
            // ignore
            console.warn('failed to parse', this[i]);
          }

          if (!this[i] || 'object' !== typeof this[i]) {
            // invalid stuff from other db
            return;
          }
          queryEach(key, this[i]);
        }

        function doMget(err, keys) {
          function doMatching(err, responses) {
            keys.forEach(doQuery, responses);
            cb(null, matches);
          }

          // TODO only get 1000 at a time
          client.mget(keys, doMatching);
        }

        client.keys('*', doMget);
      },

      del: function (id, cb) {
        client.del(id, cb);
      },

      quit: function () {
        client.quit();
      }
    };
  }

  function create(opts) {
    return new RedisWrapper(opts);
  }

  module.exports.create = create;
}());
