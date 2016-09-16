'use strict';

const EventEmitter = require('events').EventEmitter;
const spawn = require('cross-spawn');
const kill = require('tree-kill');
const webSocket = require('ws');
const _ = require('lodash');
const SocketWrapper = require('./socketWrapper');
const util = require('./util');

class ProcessManager extends EventEmitter {

  constructor(opt) {
    super();

    this.opt = opt;
    // handle old boolean verbose values
    if (this.opt.verbose === true) {
      this.opt.logLevel = util.LOG_LEVEL_VERBOSE;
    } else if (this.opt.verbose === false) {
      this.opt.logLevel = util.LOG_LEVEL_INFO;
    }

    this.numClients = 0;
    this.electronState = 'init';
    this.restartCallback = null;
  }

  warn(msg) {
    console.warn(`[${new Date().toISOString()}] [electron-connect] [server] ${msg}`);
  };

  info(msg) {
    if (this.opt.logLevel >= util.LOG_LEVEL_INFO) {
      console.log(`[${new Date().toISOString()}] [electron-connect] [server] ${msg}`);
    }
  };

  verbose(msg) {
    if (this.opt.logLevel >= util.LOG_LEVEL_VERBOSE) {
      console.log(`[${new Date().toISOString()}] [electron-connect] [server] ${msg}`);
    };
  };

  start(args, cb) {

    if (!cb && !args) {
      args = [];
    } else if (!cb && typeof args === 'function') {
      cb = args;
      args = [];
    } else if (typeof args === 'string') {
      args = [args];
    } else if (Array.isArray(args)){
    } else if (typeof args === 'object'){
      args = [];
    } else {
      throw new Error('args must be String or an Array of String');
    }

    this.electronState = 'starting';

    this.wss = new webSocket.Server({port: this.opt.port}, () => {
      this.spawn(args, this.opt.spawnOpt);
      this.info(`created and listening on ${this.opt.port}`);
      this.setStateAndInvokeCallback('started', cb);
    });

    this.wss.on('connection', (ws) => {
      var wrapper = new SocketWrapper(ws);
      wrapper.on('message', (message) => {
        this.verbose('receive message from client(window_id: ' + wrapper.id + ') '+  message);
        var obj = JSON.parse(message);
        if(obj.type && typeof obj.type === 'string') {
          this.emit(obj.type, obj.data, wrapper);
        }
      });
      wrapper.on('close', () => {
        this.info(`client (window_id: ${wrapper.id}) closed.`);
        SocketWrapper.delete(wrapper.id);
        this.numClients--;
        if (!this.numClients) {
          this.verbose('no more open windows');
          if (this.opt.stopOnClose && this.electronState !== 'restarting' && this.electronState !== 'reloading') {
            this.verbose('stopOnClose is set. So, invoking stop..');
            this.stop(cb);
          } else if (this.electronState === 'restarting') {
            this.info('Respawning electron process..');
            this.spawn(args, this.opt.spawnOpt);
            this.setStateAndInvokeCallback('restarted', this.restartCallback);
          }
        }
      });
      this.info(`client (window_id: ${wrapper.id}) started.`);
      this.numClients++;
    });
    this.registerHandler();
  };

  broadcast(type, data) {
    SocketWrapper.broadcast(type, data);
  };

  // sendMessage(id, type, data) {
  //   SocketWrapper.get(id).sendMessage(type, data);
  // };

  setStateAndInvokeCallback(procState, cb) {
    this.electronState = procState;
    if (cb && (typeof cb === 'function')) {
      cb(procState);
    }
  };

  spawn(args, spawnOpt) {
    // HACK - for now, pass electron option to preload some module (i picked 'process' module).
    args = ["-r process"].concat(args);
    this.electronProc = spawn(this.opt.electron, args.concat([this.opt.path]), spawnOpt);
    this.info(`started electron process: ${this.electronProc.pid}`);
  };

  registerHandler() {
    this.on('initBounds', (data, wrapper) => {
      if(JSON.stringify(wrapper.get('init_bounds')) !== JSON.stringify(data.bounds)) {
        wrapper.set('init_bounds', data.bounds);
        wrapper.set('bounds', data.bounds);
      }
    });
    this.on('changeBounds', (data, wrapper) => {
      this.verbose('changeBounds for window_id: ' + wrapper.id);
      wrapper.set('bounds', data.bounds);
    });
    this.on('getBounds', function (data, wrapper) {
      var bounds = wrapper.get('bounds');
      this.verbose('getBounds for window_id: ' + wrapper.id + ', bounds: ' + JSON.stringify(bounds));
      wrapper.sendMessage('setBounds', {bounds: bounds});
    });
  };

  restart(args, cb) {
    if(!cb && !args) {
      args = [];
    }else if(!cb && typeof args === 'function') {
      cb = args;
      args = [];
    }else if(typeof args === 'string') {
      args = [args];
    }else if(Array.isArray(args)){
    }else if(typeof args === 'object') {
      args = [];
    }else{
      throw new Error('args must be String or an Array of String');
    }

    if (typeof cb === 'function') {
      this.restartCallback = cb;
    }

    this.info(`restarting electron process`);
    this.electronState = 'restarting';
    if (this.electronProc) {
      this.info('restarting electron process: ' + this.electronProc.pid);
      if (!this.numClients) {
        this.killProcess(function() {
          this.info('Respawning electron process..');
          this.spawn(args, this.opt.spawnOpt);
          this.setStateAndInvokeCallback('restarted', this.restartCallback);
        }.bind(this));
      } else {
        this.killProcess(() => {
          if (this.restartCallback) {
            this.restartCallback(this.electronState);
          }
        })
      }
    }
  };

  killProcess(cb) {
    if(this.electronProc) {
      this.info(`killing electron process tree: ${this.electronProc.pid}`);
      kill(this.electronProc.pid, 'SIGTERM', cb);
    }
  };

  stop(cb) {
    this.info(`stopping electron process: ${this.electronProc.pid}`);
    this.electronState = 'stopping';
    this.killProcess((err) => {
      this.wss.close();
      this.setStateAndInvokeCallback('stopped', cb);
    });
  };

  reload(ids) {
    var list;
    if(typeof ids === 'string') {
      list = [ids];
    }else if(Array.isArray(ids)) {
      list = ids;
    }

    this.electronState = 'reloading';
    if(!list) {
      this.broadcast('reload');
    }else{
      ids.forEach(function (id) {
        SocketWrapper.get(id).sendMessage('reload');
      });
    }
    setTimeout((self) => {
      self.electronState = 'reloaded';
    }, 3000, this);
  };

};

module.exports = {
  create: function (options) {
    var electron;
    if(options && options.useGlobalElectron) {
      electron = 'electron';
    } else {
      try {
        electron = require('electron');
      } catch (e) {
        if(e.code === 'MODULE_NOT_FOUND') {
          electron = 'electron';
        }
      }
    }
    var opt = _.merge({
      stopOnClose: false,
      electron: electron,
      path: process.cwd(),
      port: 30080,
      logLevel: util.LOG_LEVEL_INFO,
      spawnOpt: {stdio: 'inherit'}
    }, options || {});
    return new ProcessManager(opt);
  }
};

