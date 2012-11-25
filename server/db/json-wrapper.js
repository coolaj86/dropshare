/*jshint node:true es5:true laxcomma:true laxbreak:true*/ 
(function () {
  "use strict";

  var Storage = require('dom-storage')
    , JsonStorage = require('json-storage')
    ;

  function JsonDb(opts) {
    var dbFile = opts.dbFile || __dirname + '/db.json'
      ;

    this._store = JsonStorage.create(Storage.create(dbFile));
  }
 
  JsonDb.prototype.get = function (key, cb) {
    var self = this
      , val = self._store.get(key)
      ;

    val._id = key;
    process.nextTick(function () {
      cb(null, val, true);
    });
  };

  JsonDb.prototype.set = function (key, val, cb) {
    this._store.set(key, val);
    process.nextTick(function () {
      cb(null);
    });
  };

  JsonDb.prototype.del = function (key, cb) {
    this._store.remove(key);
    process.nextTick(function () {
      cb(null);
    });
  };

  JsonDb.prototype.quit = function (cb) {
    process.nextTick(function () {
      if (cb) {
        cb();
      }
    });
  };

  JsonDb.prototype.query = function (query, cb) {
    var matches = []
      , self = this
      ;

    function queryEach(key) {
      /*jshint validthis:true*/
      var obj = this._store.get(key)
        ;

      obj._id = key;
 
      function matchEach(key) {
        var q = query[key]
          , v = obj[key]
          ;

        if (('function' === typeof q && q(v)) || q.test(v)) {
          matches.push(obj);
          return true;
        }
      }

      Object.keys(query).some(matchEach);
    }

    this._store.keys().forEach(queryEach, this);

    process.nextTick(function () {
      cb(null, matches);
    });
  };

  JsonDb.create = function (opts) {
    return new JsonDb(opts);
  };

  module.exports = JsonDb;
}());
