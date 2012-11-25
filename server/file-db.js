/*jshint laxcomma:true es5:true node:true onevar:true*/
(function () {
  "use strict";

  var fs = require('fs.extra')
    , path = require('path')
    , assert = require('assert')
    ;

  function FileDb(privateDir) {
    var self = this
      ;

    self._privateDir = privateDir;
  }
  FileDb.prototype.exists = function (cb, key) {
    var self = this
      ;

    // path.exists
    fs.stat(path.join(self._privateDir, key), function (e, data) {
      if (!e || !data) {
        cb(false);
        return;
      }

      cb(true);
    });
  };
  FileDb.prototype.put = function (cb, fileStat) {
    var self = this
      , newFilePath = self._privateDir + '/' + (fileStat.sha1checksum || fileStat.sha1)
      ;

    fs.stat(fileStat.path, function (err, stat) {
      assert.strictEqual(err, null, "tried to move a non-existent file");

      //check if file with same checksum already exists
      fs.stat(newFilePath, function (statErr, stat) {
        if (typeof stat === "undefined") {
          // File does not exist already, so move it in to place
          fs.move(fileStat.path, newFilePath, function (movErr) {
            if (movErr) {
              console.warn('Error moving file to storage: ' + movErr.toString());
              //throw err;
            }
          });
        }
        else {
          // TODO check that they aren't each other
          fs.unlink(fileStat.path);
        }

        cb(null, fileStat.sha1checksum, fileStat);
      });
    });
  };
  FileDb.prototype.remove = function (cb, fileStoreKey) {
    fs.unlink(path.join(this._privateDir, fileStoreKey), cb);
  };
  FileDb.prototype.link = function (cb, fileStoreKey, toDir, toFilename) {
    var self = this
      , curFile = path.join(self._privateDir, fileStoreKey)
      , newFile = path.join(toDir, toFilename)
      , newDir = path.join(toDir)
      ;

    fs.mkdirp(toDir, function (err) {
      if (err) {
        cb(err);
        return;
      }
      fs.stat(newFile, function (err) {
        if (!err) {
          // the place already exists
          // (and we happen to know it's unique)
          cb();
          return;
        }
        fs.link(curFile, newFile, cb);
      });
    });
  };
  FileDb.create = function (a, b, c) {
    return new FileDb(a, b, c);
  };

  module.exports = FileDb;
}());
