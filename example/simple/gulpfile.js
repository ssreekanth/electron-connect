'use strict';

var gulp = require('gulp');
var electron = require('../../').server.create();

// var electron = require('../../').server.create({
//   useGlobalElectron: true,
//   logLevel: 2
// });

gulp.task('serve', function () {
  // Start browser process
  electron.start();

  // // Add an argument
  // electron.start('Hoge!');

  // // Add list of arguments
  // electron.start(['Hoge', 'foo']);

  // // Callback
  // electron.start(function () {
  //   console.log('started');
  // });

  // Restart browser process
  gulp.watch('app.js', ['restart:electron']);

  // Reload renderer process
  gulp.watch(['index.js', 'index.html'], ['reload:renderer']);
});

gulp.task('restart:electron', function (done) {
  // Restart main process
  electron.restart();
  done();
});

gulp.task('reload:renderer', function (done) {
  // Reload renderer process
  electron.reload();
  done();
});

gulp.task('default', ['serve']);

