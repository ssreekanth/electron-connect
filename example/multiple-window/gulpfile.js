'use strict';

var gulp = require('gulp');
var electron = require('../../').server.create();

gulp.task('serve', function () {
  // Start browser process
  electron.start();

  // Restart browser process
  gulp.watch('app.js', ['restart:electron']);

  gulp.watch('*.html', ['reload:renderer']);

});

gulp.task('restart:electron', function (done) {
  // Reload renderer process
  electron.restart();
  done();
});

gulp.task('reload:renderer', function (done) {
  // Reload renderer process
  electron.reload();
  setTimeout(function () {
    electron.broadcast('myNotification');
    done();
  });
});

gulp.task('default', ['serve']);

