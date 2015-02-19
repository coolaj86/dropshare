(function () {
  "use strict";
  /**
   * Module dependencies.
   */
  var PromiseA = require('bluebird').Promise
  var fs = require('fs.extra');
  var path = require('path');

  var express = require('express');
  var serveStatic = require('serve-static');
  var urlrouter = require('urlrouter');
  var CORS = require('connect-cors');
  var cookieParser = require('cookie-parser');
  var errorHandler = require('errorhandler');
  var bodyParser = require('body-parser');
  var compression = require('compression');
  var query = require('connect-query');

  var hri = require('human-readable-ids').hri;
  var mkdirp = require('mkdirp');
  var assert = require('assert');
  var forEachAsync = require('foreachasync').forEachAsync;
  var Formaline = require('formaline').Formaline;
  var FileDb = require('./file-db');
  var Sequence = require('sequence');
      // TODO use different strategies - friendly-ids / words
      // The DropShare Epoch -- 1320969600000 -- Fri, 11 Nov 2011 00:00:00 GMT
  var generateId = require('./gen-id').create(1320769600000);

  // http://stackoverflow.com/a/6969486/151312
  function escapeRegExp(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
  }

  function stringToRegExp(str) {
    var re
      , flags = 'gi'
      ;

    str = str.split('/');

    if ('' === str[0] && /^[gimy]{0,2}$/.test(str[str.length - 1])) {
      str.shift();
      flags = str.pop();
      re = new RegExp(str.join('/'), flags);
      //console.log('is regexp', re);
    } else {
      re = new RegExp(escapeRegExp(str.join('/')), 'gi');
      //return new RegExp("\\s*" + escapeRegExp(str) + "\\s*");
      //console.log('not regexp', re);
    }

    return re;
  }

  function Dropshare(options) {
    var self = this
      , filesDirStats
      , allowUserSpecifiedIds = false
      ;

    // TODO change filesMount regularly (but synchronously)
    self.filesMount = '/' + String(Math.floor(Math.random() * 1000000000));
    self.filesDir = path.join(__dirname, '..', 'files');
    self.filesDir = options.storageDir || options.files || options.filesDir;

    self.clientDir = options.client || (path.join(__dirname, '..', 'public'));
    self._fileDb = FileDb.create(self.filesDir, self.clientDir);

    options = options || {};
    options.databaseStrategy = options.databaseStrategy || 'redis';
    options[options.databaseStrategy] = options[options.databaseStrategy] || {};

    // there could potentially be a race condition here at startup
    // should be negligible
    self._storage = require('./db/' + options.databaseStrategy + '-wrapper').create(options[options.databaseStrategy]);


    // Make sure filesDir exists and is writable
    try {
      mkdirp.sync(self.filesDir);
      filesDirStats = fs.statSync(self.filesDir);
      if (!filesDirStats.isDirectory()) {
        throw new Error('Storage path is not a directory!');
      }
    }
    catch (e) {
      console.warn('Storage directory is not writeable or does not exist: ' + e.path);
      console.warn('error: ' + e.errno + ' code: ' + e.code);
      process.exit(1);
    }

    if (options.allowUserSpecifiedIds) {
      self._allowUserSpecifiedIds = true;
    }

    self._app = createApiServer(self);
  }
  Dropshare.create = function (a, b, c) {
    var dropshare = new Dropshare(a, b, c);
    return dropshare._app;
  };

  // Routes
  Dropshare.prototype.createIds = function (req, res, next) {
    var i
      , ids = []
      , id
      , meta
      , err
      , now = Date.now()
      , self = this
      ;

    // TODO use steve
    if (!Array.isArray(req.body)) {
      err = {
        "result": "error",
        "data": "Must be an array of file metadata."
      };

      res.end(JSON.stringify(err), 400);
      return;
    }

    return forEachAsync(req.body, function (meta, i) {
      function getId() {
        return new PromiseA(function (resolve) {
          //id = generateId();
          id = hri.random();
          self._storage.get(id, function (err, data, isJSON) {
            if (data) {
              return getId();
            } else {
              resolve(id);
            }
          });
        });
      }

      return new PromiseA(function (resolve) {
        meta.timestamp = now;
        if (self._allowUserSpecifiedIds && meta.id) {
          // XXX BUG check for the id first
          id = meta.id;
        }

        return getId(id).then(function () {
          self._storage.set(id, meta, function (err, data) {
            ids.push(id);
            resolve(id);
          });
        });
      });
    }).then(function () {
      res.writeHead(200, {'content-type': 'application/json'});
      res.write(JSON.stringify(ids));
      res.end();
    });
  };

  Dropshare.prototype.handleUploadedFiles = function (req, res, fields, files) {
    var responses = []
      , sequence = Sequence.create()
      , self = this
      ;

    forEachAsync(Object.keys(files), function (fieldname) {
      return new PromiseA(function (resolve) {
        var fileData = files[fieldname]
          ;

        function pushResponse(response) {
          responses.push(response);
          resolve();
        }

        self.handleUploadedFile(pushResponse, fileData);
      });
    }).then(function () {
      res.writeHead(200, {"content-type": "application/json"});
      res.end(formatFileUploadResponses(responses));
    });
  };

  Dropshare.prototype.handleUploadedFile = function (cb, formFile) {
    var self = this
      ;

    // Check that metadata exists for this ID
    self._storage.get(formFile.fieldname, function (err, result) {
      var response
        , res
        ;

      if (err !== null || result === null) {
        cb({
          "result": "error",
          "data": "No metadata for id '" + formFile.fieldname + "'."
        });
        return;
      }

      function onStored(err, fileStoreKey, file) {
        self._addSha1ToMetaData(formFile.fieldname, fileStoreKey, file);
        cb({
          "result": "success",
          "data": "File " + formFile.fieldname + " stored successfully."
        });
      }
      // If metadata exists, then move the file and update the metadata with the new path
      //console.log('formFile', formFile);
      res = self._fileDb.put(onStored, formFile);
    });
  };

  Dropshare.prototype._addSha1ToMetaData = function (id, fileStoreKey, file) {
    var self = this
      ;

    self._storage.get(id, function (err, data, isJSON) {
      assert.ok(isJSON, "Metadata is not JSON");

      data.sha1checksum = file.sha1;
      data.fileStoreKey = fileStoreKey;
      self._storage.set(id, data, function (err, res) {
        assert.deepEqual(err, null, "Error storing metadata again.");
      });
    });
  };

  function formatFileUploadResponses (responses) {
    return JSON.stringify(responses);
  }

  Dropshare.prototype.receiveFiles = function(req, res, next) {
    var form
      , config
      , self = this
      ;

    config = {
        hashes: ["sha1"]
      // treat all fields singularly
      , arrayFields: []
    };

    form = Formaline.create(req, config);
    form.on('end', function (fields, files) {
      /*
      console.log('\nfields are:');
      console.log(fields);
      console.log('files are:');
      console.log(files);
      console.log();
      */

      var args = Array.prototype.slice.call(arguments)
        ;

      try {
        self.handleUploadedFiles(req, res, fields, files);
      } catch ( err ) {
        console.error( 'error', err.stack );
      }
    });
    form.on('error', function (err) {
      console.error('[formaline error]');
      console.error(err && err.stack || err);
      console.error(arguments);
    });
  };

  Dropshare.prototype._isFileMarkedAsUploadSuccessful = function (req, res, err, data) {
    // backwards compat from when sha1checksum was the key
    if (data && !data.fileStoreKey) {
      data.fileStoreKey = data.sha1checksum || data.sha1;
    }

    if (!err && data && 'undefined' !== typeof data.fileStoreKey) {
      return true;
    }

    // TODO use steve
    res.writeHead(400, {'content-type': 'application/json'});
    res.write(JSON.stringify({
      "success": false,
      "errors": ["No file uploaded or upload incomplete for " + req.params.id + "."],
    }));
    res.end();
    return false;
  };

  Dropshare.prototype.redirectToFile = function (req, res, next) {
    //console.log('[ds] redirectToFile', req.url, req.params);
    var self = this
      ;

    self.sendFile(req, res, next);
  };

  Dropshare.prototype.sendFile = function (req, res, next) {
    var self = this
      , fileStoreKey = req.params.id
      , dbId = req.params.id
      ;

    self._storage.get(dbId, function (err, data) {
      if (!self._isFileMarkedAsUploadSuccessful(req, res, err, data)) {
        // TODO check for progress
        //next();
        return;
      }

      // backwards compat from when sha1checksum was the key
      if (!data.fileStoreKey) {
        data.fileStoreKey = data.sha1checksum || data.sha1;
      }

      req._preFilesMountUrl = req.url;
      req.url = self.filesMount + '/' + data.fileStoreKey;
      //console.log(req._preFilesMountUrl, req.url, req.params);
      next();
    });
  };

  function yes() {
    return true;
  }

  Dropshare.prototype.queryMetadata = function(req, res, next) {
    var self = this
      , matches
      , query = req.query || {}
      , keys
      , opts = {}
      ;

    function answerTheCall(err, matches) {
      if (err) {
        // TODO allow null and undefined without triggering an error
        res.error(err);
      }
      res.send(matches, opts);
    }

    if (query.debug || query.prettyprint) {
      opts.debug = true;
      delete query.debug;
      delete query.prettyprint;
    }

    keys = Object.keys(query);
    if (0 === keys.length) {
      self._storage.query({ alwaysTrue: yes }, answerTheCall);
      return;
    }

    keys.forEach(function (key) {
      query[key] = stringToRegExp(query[key]);
    });

    self._storage.query(query, answerTheCall);
  };


  Dropshare.prototype.getMetadata = function(req, res, next) {
    var self = this
      ;

    self._storage.get(req.params.id, function (err, data) {
      if (err !== null || data === null) {
        res.writeHead(400, {'content-type': 'application/json'});
        res.end(JSON.stringify({
            'error': true
          , 'result': 'error'
          , 'errors': ['No metadata for ' + req.params.id + '.']
        }));
        return;
      }

      res.writeHead(200, {'content-type': 'application/json'});
      var response = {
          'success': true
        , 'result': data
        , 'error': false
        , 'errors': []
      };
      res.end(JSON.stringify(response));
    });
  };

  // Delete both the metadata and the file on the FS.
  // NOTE: this will break stuff it multiple IDs refer to the same
  // file. For example, if the same file is uploaded multiple times,
  // it will have the same sha1 hash. If one ID is DELETEd, it will
  // delete the file that other IDs refer to, and then a GET is
  // issued for a different ID that refers to the same file,
  // it will explode.

  // This could be fixed by storing a list of IDs files keyed by
  // the SHA1 hash of the file the refer to.
  Dropshare.prototype.removeFile = function (req, res, next) {
    var id = req.params.id
      , self = this
      ;

    function error(res, data) {
        res.writeHead(500, {'content-type': 'application/json'});
        res.write(JSON.stringify({
          "result": "error",
          "data": "Error in deleting " + data.id + "."
        }));
        res.end();
        return;
    }

    self._storage.get(id, function (err, data) {
      //Delete from fs
      function onRemoved(err) {
        if (err) {
          error(res, data);
          return;
        }

        res.writeHead(200, {'content-type': 'application/json'});
        res.write(JSON.stringify({
          "result": "success",
          "data": "Successfully deleted " + req.params.id + "."
        }));
        res.end();
      }

      if (!self._isFileMarkedAsUploadSuccessful(req, res, err, data)) {
        return;
      }

      // backwards compat
      if (!data.fileStoreKey) {
        data.fileStoreKey = data.sha1checksum || data.sha1;
      }

      //Delete from Db
      self._storage.del(id, function (err) {
        if (err) {
          error(res, data);
          return;
        }

        self._fileDb.remove(onRemoved, data.fileStoreKey);
      });
    });
  };

  function createApiServer(dropshare) {
    var bP = bodyParser()
      , app
      , wrappedDropshare = {}
      ;

    function router(rest) {
      // TODO permanent files?
      rest.post('/meta/new', wrappedDropshare.createIds);
      rest.post('/meta', wrappedDropshare.createIds);
      //rest.patch('/meta/:id', wrappedDropshare.updateMetadata);
      rest.get('/meta/:id', wrappedDropshare.getMetadata);
      rest.get('/meta', wrappedDropshare.queryMetadata);
      rest.delete('/meta/:id', wrappedDropshare.removeFile);

      // deprecated
      rest.delete('/files/:id', wrappedDropshare.removeFile);
      rest.post('/files/new', wrappedDropshare.createIds);

      rest.post('/files', wrappedDropshare.receiveFiles);

      // this must remain hard-coded for now. it's tied to the logic for figuring out the mointpoint
      rest.get('/files/:id/:filename', wrappedDropshare.redirectToFile);
      rest.get('/files/:id\\.:format', wrappedDropshare.redirectToFile);
      rest.get('/files/:id', wrappedDropshare.redirectToFile);
    }

    // to prevent loss of this-ness
    [
        'createIds'
      , 'getMetadata'
      , 'queryMetadata'
      , 'updateMetadata'
      , 'removeFile'
      , 'receiveFiles'
      , 'redirectToFile'
    ].forEach(function (key) {
      wrappedDropshare[key] = function (req, res, next) {
        dropshare[key](req, res, next);
      };
    });

    app = express();
    app.use(CORS({ credentials: false }));
    app.use(serveStatic(dropshare.clientDir));
    app.use(bodyParser.json({
      strict: true // only objects and arrays
    , inflate: true
    , limit: 100 * 1024
    , reviver: undefined
    , type: 'json'
    , verify: undefined
    }));
    app.use(bodyParser.urlencoded({
      extended: true
    , inflate: true
    , limit: 100 * 1024
    , type: 'urlencoded'
    , verify: undefined
    }));
    app.use(query());
    //, connect.methodOverride()
    app.use(function (req, res, next) {
      //console.log('[ds] req.url', req.url);
      next();
    });
    app.use(urlrouter(router));
      // Development
    app.use(errorHandler({ dumpExceptions: true, showStack: true }));
      // Production
      //, connect.errorHandler()
    app.use(dropshare.filesMount, serveStatic(dropshare.filesDir));
    app.use(function (req, res, next) {
      // keep the filesMount undiscoverable, even in an error
      if (req._preFilesMountUrl) {
        req.url = req._preFilesMountURl;
      }
      //console.log('[ds] Final URL', req.url, dropshare.filesDir);
      next();
    });
    app.filesDir = dropshare.filesDir;

    return app;
  }

  module.exports = Dropshare;
}());
