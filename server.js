/*jshint node:true strict:true es5:true laxcomma:true*/
(function () {
  "use strict";

  var dropshare = require('./server/index')
    , config = require('./config')
    , options = {
          "tmp": "/tmp"
        , "storageDir": __dirname + "/files"
        , "client": __dirname + "/public"
        , "databaseStrategy": "redis"
        //, "databaseStrategy": "json"
      }
    , app
    , key
    ;


  // Use the options provided in the config.js file
  for (key in config) {
    options[key] = config[key];
  }

  app = dropshare.create(options);

  module.exports = app;
}());
