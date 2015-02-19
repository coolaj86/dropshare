(function () {
  "use strict";

  var PromiseA = require('bluebird').Promise;
  var dropshare = require('./server/index');
  var config = require('./config');
  var options = {
          "tmp": "/tmp"
        , "storageDir": __dirname + "/files"
        , "client": __dirname + "/public"
        , "databaseStrategy": "redis"
        //, "databaseStrategy": "json"
      };
  var app;
  var key;


  // Use the options provided in the config.js file
  for (key in config) {
    options[key] = config[key];
  }

  module.exports.create = function (server, hostname, securePort, config) {
    if (config) {
      for (key in config) {
        options[key] = config[key];
      }
    }
    app = dropshare.create(options);

    return PromiseA.resolve(app);
  };
}());
