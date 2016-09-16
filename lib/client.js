const {EventEmitter} = require('events');
const WebSocket = require('ws');
const _ = require('lodash');
const util = require('./util');


const defaultOpt = {
  port: 30080,
  sendBounds: true,
  logLevel: util.LOG_LEVEL_INFO,
};

class Client extends EventEmitter {
  constructor() {
    super();
  }

  warn(msg) {
    console.warn(`[${new Date().toISOString()}] [electron-connect] [client: ${this.id}] ${msg}`);
  }

  info(msg) {
    if (this.opt.logLevel >= util.LOG_LEVEL_INFO) {
      console.log(`[${new Date().toISOString()}] [electron-connect] [client: ${this.id}] ${msg}`);
    }
  }

  verbose(msg) {
    if (this.opt.logLevel >= util.LOG_LEVEL_VERBOSE) {
      console.log(`[${new Date().toISOString()}] [electron-connect] [client: ${this.id}] ${msg}`);
    }
  }

  getBrowserWindow() {
    if (process.type === 'renderer') {
      return require('electron').remote.getCurrentWindow();
    }
  }

  join(browserWindow, options, cb) {
    if(browserWindow && browserWindow.constructor.name === 'BrowserWindow') {
      if(!options && !cb) {
        this.opt = defaultOpt;
      }else if(!cb && typeof options === 'function') {
        cb = options;
        this.opt = defaultOpt;
      }else{
        this.opt = _.merge(defaultOpt, options);
      }
    }else{
      if(typeof browserWindow === 'object') {
        this.opt = _.merge(defaultOpt, browserWindow);
        cb = options;
      }else{
        this.opt = defaultOpt;
        cb = browserWindow;
      }
      browserWindow = this.getBrowserWindow();
    }

    // handle old boolean verbose values
    if (this.opt.verbose === true) {
      this.opt.logLevel = util.LOG_LEVEL_VERBOSE;
    } else if (this.opt.verbose === false) {
      this.opt.logLevel = util.LOG_LEVEL_INFO;
    }

    var id = browserWindow ? browserWindow.id : '_no_browser';
    this.id = id;

    this.socket = new WebSocket(`ws://localhost:${this.opt.port}/?window_id=${id}`);
    this.socket.on('open', () => {
      this.info('connected server');
      this.socket.on('message', (msg) => {
        try {
          var message = JSON.parse(msg);
          if(message.type && typeof message.type === 'string') {
            this.verbose(`receive message: ${msg}`);
            this.emit(message.type, _.merge(message.data, {id: this.id}));
          }
        }catch (e) {
          console.error(e);
        }
      });

      if(browserWindow) {
        this.registerWindow(browserWindow);
      }
      typeof cb === 'function' && cb();
    });

    this.registerHandler(browserWindow);
    return this;
  }

  registerWindow(browserWindow) {
    this.opt.sendBounds && ['move', 'resize'].forEach((eventName) => {
      browserWindow.on(eventName, () => {
        this.sendMessage('changeBounds', {bounds: browserWindow.getBounds()});
      });
    });
    if (process.type == 'renderer') {
      // if (typeof window === 'object') {
      //   window.addEventListener('beforeunload', () => {
      //     this.close(browserWindow);
      //   });
      // }
    } else {
      browserWindow.on('closed', () => {
        this.close(browserWindow);
      });
    }
    this.sendMessage('initBounds', {bounds: browserWindow.getBounds()});
    this.sendMessage('getBounds');
  }

  sendMessage(type, data) {
    util.sendMessage(this.socket, type, data);
  }

  registerHandler(browserWindow) {
    this.on('setBounds', (data) => {
      if (this.id == data.id) {
        this.opt.sendBounds && data.bounds && browserWindow && browserWindow.setBounds(data.bounds);
      }
    });

    this.on('reload', (data) => {
      if (data.id == this.id) {
        if(!browserWindow) return;
        if(browserWindow.webContents) {
          if (process.type == 'renderer') {
            this.close(browserWindow);
          }
          browserWindow.webContents.reloadIgnoringCache();
        }
      }
    });
  }

  close(browserWindow) {
    if(this.opt.sendBounds) {
      browserWindow.removeAllListeners('move').removeAllListeners('resize');
    }
    this.socket.terminate();
  }

};

module.exports = {
  create: function (browserWindow, options, cb) {
    return new Client().join(browserWindow, options, cb);
  }
};

