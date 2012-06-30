(function () {
  "use strict";

  console.log('Hello from DropShare!');

  var $ = require('ender')
    , request = require('ahr2')
    , pure = require('pure').$p
    , sequence = require('sequence')()
    , Updrop = require('./vendor/updrop')
    , UiTabs = require('./vendor/ui-tabs')
    , warnOnLargeFiles = true
    , linkTpl
    ;

  function toByteCount(size) {
    // 102.4
    if (size < 102) {
      return size + ' B';
    }

    // 104857.6
    if (size < 104858) {
      return (size / 1024).toFixed(1) + ' KiB';
    }

    // 107374182.4
    if (size < 107374182) {
      return (size / (1024 * 1024)).toFixed(1) + ' MiB';
    }

    // 1099511627776
    return (size / (1024 * 1024 * 1024)).toFixed(1) + ' GiB';
  }

  function uploadMeta(files, meta) {
    // I was attaching directly files[i].link = link
    // but that failed (inconsistently) in Firefox
    // maybe buggy garbage collection?
    var fileData = []
      ;

    $('#js-drop .js-no-links').hide();

    // begin tempalte
    meta.forEach(function (m, i) {
      var link = $(linkTpl)
        ;

      link.find('.js-id').text('');
      link.find('.js-name').text(m.name);
      link.find('.js-ds-link').text(' ');
      link.find('.js-ds-link').attr('href', '#');
      link.find('.js-remove-file').hide();

      fileData[i] = {};
      fileData[i].link = link;
      fileData[i].file = files[i];

      $('#js-drop .js-uploadlist').append(link);
    });

    request.post(location.pathname + 'files/new', {}, meta).when(function (err, ahr, data) {
      var formData = new FormData()
        ;

      formData.append('secret', data.secret)

      // TODO data.result
      data.forEach(function (token, j) {
        var file = fileData[j].file
          , link = fileData[j].link
          , host = location.host
          , fullhost = location.protocol + '//' + host
          ;
        // TODO selectable target server

        formData.append(token, file);
        console.log('formData append', token, file.name);

        // TODO use data-meta-id
        link.find('.js-id').text(token);
        link.find('.js-progress').attr('max', file.size);
        link.find('.js-progress').find('.js-max').text(file.size);
        link.find('.js-name').remove();
        link.find('.js-ds-link').text(host + '#' + token); //encodeURIComponent(file.name));
        link.find('.js-ds-link').attr('href', fullhost + '#' + token); //encodeURIComponent(file.name));
      });
      // this hack forces Chrome / Safari to redraw
      $('#js-drop .js-uploadlist')[0].style.display = 'none';
      $('#js-drop .js-uploadlist')[0].offsetHeight;
      $('#js-drop .js-uploadlist')[0].style.display = 'block';

      // "global" upload queue
      sequence.then(function (next) {
        var emitter;
        emitter = request.post(location.pathname + 'files', {}, formData);
        emitter.when(function (err, ahr, data2) {
          console.log('data at data2', data);
          data.forEach(function (token, k) {
            console.log(fileData, k);
            var file = fileData[k].file
              , link = fileData[k].link
              ;

            console.log('file, link', file, link);

            // TODO
            link.find('.js-progress').remove();
            link.find('.js-byte-count').remove();
            // TODO
            //link.find('.js-remove-file').show();
          });
          next();
        });

        console.log(emitter);
        emitter.upload.on('progress', function (ev) {
          var totalLoaded = ev.loaded
            , i
            , file
            , bytesLeft
            , link
            , bytesLoaded
            ;

          fileData.forEach(function (fileDatum, i) {
          //for (i = 0; i < files.length; i += 1) {
            file = fileDatum.file;
            link = fileDatum.link;

            if (totalLoaded > 0) {
              bytesLeft = file.size - totalLoaded;
              if (bytesLeft > 0) {
                bytesLoaded = file.size - bytesLeft;
              } else {
                bytesLoaded = file.size;
                bytesLeft = 0;
              }
              totalLoaded -= bytesLoaded;
            } else {
              bytesLoaded = 0;
              bytesLeft = file.size;
            }

            link.find('.js-progress').attr('value', bytesLoaded);
            link.find('.js-progress').find('.js-val').text(bytesLoaded);
            // TODO use a hide/show on 'of'
            link.find('.js-byte-count').html(
                '<br>'
              + toByteCount(bytesLoaded)
              + ' of ' 
              + toByteCount(file.size)
            );
          //}
          });
          // TODO 

          console.log('progressEv', ev.loaded, ev.total);
        });
      });
    });
  }

  function handleDrop(files) {
    // handles both drop and file input change events
    var i
      , file
      , meta = []
      ;

    if (!files) {
      console.log('... looks drag-n-drop like litter to me.');
      return;
    }

    if (!files.length) {
      alert('looks like you tried to drop a folder, but your browser doesn\'t support that yet');
      return;
    }

    for (i = 0; i < files.length; i += 1) {
      file = files[i];
      console.log(files[i]);
      meta.push({
          "type": file.type
        , "name": file.name || file.fileName
        , "size": file.size || file.fileSize
        , "lastModifiedDate": file.lastModifiedDate
        , "path": file.mozFullPath || file.webkitRelativePath
      });
      //file.xyz = 'something';
      //$('.js-uploadlist').append('<li class=\'file-info\'></li>');
      if (warnOnLargeFiles) {
        warnOnLargeFiles = false;
        if (file.size >= (100 * 1024 * 1024)) {
          alert(''
            + 'Some browsers have issues with files as large as the ones you\'re trying to upload (100MiB+).'
            + 'If your browser becomes slow, unresponsive, or crashes; try using Chrome instead'
            );
        }
      }
    }

    console.log(JSON.stringify(files));

    uploadMeta(files, meta);
  }

  function onRemoveFile(ev) {
    var id = $(this).closest('.js-file-info').find('.js-id').text().trim()
      , imSure = confirm('Are you sure you want to delete this?')
      , self = this
      ;

    if (!imSure) {
      return;
    }

    request.delete(location.protocol + '//' + location.host + location.pathname + 'files/' + id).when(function (err, ahr, data) {
      console.log('prolly deleted:', err, ahr, data);
      $(self).closest('.js-file-info').remove();
      if (!$('#js-drop .js-uploadlist .js-file-info').length) {
        $('#js-drop .js-no-links').show();
      }
    });
  }

  function onDragOut(ev) {
    var url = $(this).attr('data-downloadurl')
      , result
      ;

    console.log('data-downloadurl', url);
    result = ev.dataTransfer && ev.dataTransfer.setData('DownloadURL', url);

    if (!result) {
      alert('Sad Day! Your browser doesn\'t support drag-downloading files');
    }
  }

  function switchToShare() {
    var resource = location.hash.substr(1).split('/');

    // convert #share/xzy and #/share/xyz to #xyz
    // TODO remove after a reasonable amount of time
    if (/\/(s|share)/.exec(resource[0] || resource[1])) {
      resource.shift(); // moves the '#' out
      resource.shift(); // moves 's[hare]' out
      location.hash = resource.join('/');
      return true;
    }

    // only handle short urls without leading '/'
    if ('' === resource[0]) {
      return false;
    }

    var id = resource[0]
      , name = resource[1]
      , backupName = 'dropshare-download.bin'
      , url = location.protocol + '//' + location.host + location.pathname + 'files/' + id + '/' + (name || backupName)
      , type = 'application/octet-stream'
      ;

    function updateInfo(err, ahr, data) {
      if (!data || !data.success) {
        alert('Sad day! Looks like a bad link.');
        return;
      }

      name = name || data.result.name || data.result.fileName;

      url = location.protocol + '//' + location.host + location.pathname + 'files/' + id + '/' + name;

      // if we already added something to #itemview, remove it.
      if( $('#itemview').children().length > 0 ) {
        $('#itemview').children().remove();
      }

      // show content based on type
      var filetype = url.split('.').pop();
      switch(filetype) {
        case 'jpg':
        case 'png':
        case 'gif':
        case 'tif':
          $('#itemview').prepend('<img src="' + url + '" />');
        break;
        case 'mp3':
          $('#itemview').prepend('<audio controls="controls"><source src="' + url + '" type="audio/mpeg" /></audio>');
        break;
        case 'm4a':
          $('#itemview').prepend('<audio controls="controls"><source src="' + url + '" /></audio>');
        break;
        case 'ogg':
          $('#itemview').prepend('<audio controls="controls"><source src="' + url + '" type="audio/ogg" /></audio>');
        break;
        case 'mp4':
          $('#itemview').prepend('<video controls="controls"><source src="' + url + '" type="video/mp4" /></video>');
        break;
      }

      $('.js-dnd').attr('href', url);
      $('.js-dnd').attr('data-downloadurl', type + ':' + decodeURIComponent(name) + ':' + url);
      $('#js-loading').hide();

      if (data.result.expired) {
        alert('Sad day! "' + (name || 'That file')  + '" is no longer available. :\'|');
        return;
      }

      if (!data.result.sha1checksum && !data.result.sha1sum && !data.result.md5sum) {
        alert('Wait for it... \njust. a. few. more. minutes... \nThe file is still uploading (or the upload failed{');
        return;
      }
    }

    request.get(location.pathname + 'meta/' + id).when(updateInfo);

    // TODO loading
    $('#js-loading').show();
    $('.js-dnd').attr('href', url);
    $('.js-dnd').attr('data-downloadurl', type + ':' + decodeURIComponent(name || backupName) + ':' + url);

    $('.js-uiview').hide();
    $('.js-share.js-uiview').show();

    return true;
  }

  function handleSpecialRoutes(oldHash, newHash, urlObj) {
    return switchToShare();
  }

  function addHandlers() {
    if (!location.host.match(/dropsha.re$/)) {
      $('.js-delete-notice').hide();
    }
    linkTpl = $('#js-drop .js-uploadlist').html();
    $('#js-drop .js-uploadlist').html('');

    // The input selector is created by updrop
    Updrop.create(handleDrop, '#js-drop', '.js-dropzone');
    Updrop.create(handleDrop, '#js-drop', '.js-uploadzone');
 
    // If the user mistakenly drops anywhere on the page, we'll catch it
    $('body').bind('dragover', Updrop.handleDrag);
    $('body').bind('drop', Updrop.abstract(handleDrop));
    
    $('body').delegate('.js-remove-file', 'click', onRemoveFile);

    $('body').delegate('.js-dnd', 'dragstart', onDragOut);
    $('.js-uiview').hide();
    UiTabs.create(handleSpecialRoutes, 'body', '.js-tab', '.js-uiview');
  }

  $.domReady(addHandlers);
}());
