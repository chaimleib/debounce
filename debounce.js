#!/usr/bin/env node

const child_process = require('child_process');
const path = require('path');
const Getopt = require('node-getopt');
const shell_parse = require('shell-quote').parse;

class Noticer {
  constructor() {
    this.subscribers = {};
  }

  post(event, data) {
    // console.error('>> ' + event);
    if (data === undefined) {
      data = {};
    }
    if (!this.subscribers.hasOwnProperty(event)) {
      return;
    }
    const eventInfo = Object.assign(
      {},
      data,
      {
        name: event,
        time: new Date(),
      });
    for (let subscriber of this.subscribers[event]) {
      subscriber(eventInfo);
    }
  }

  subscribe(event, subscriber) {
    if (!this.subscribers.hasOwnProperty(event)) {
      this.subscribers[event] = [];
    }
    if (this.subscribers[event].includes(subscriber)) {
      return;
    }
    this.subscribers[event].push(subscriber);
  }
}

class Timer {
  constructor(delay, action) {
    this.delay = delay;
    this.action = action;
    this.id = null;
  }

  get isRunning() {
    return this.id === null;
  }

  start() {
    this.id = setTimeout(this.finish.bind(this), this.delay);
    // console.error('timer started ' + util.inspect(this.id));
  }

  finish() {
    // console.error('timer finished ' + util.inspect(this.id));
    this.cancel();
    this.action();
  }

  cancel() {
    // console.error('timer canceled ' + util.inspect(this.id));
    clearTimeout(this.id);
    this.id = null;
  }

  restart() {
    this.cancel();
    this.start();
  }
}

// Debouncer FSM states
const IDLE = "IDLE",     // waiting for a trigger
  TIMING = "TIMING",     // trigger received, not handling yet
  HANDLING = "HANDLING", // handler running, no triggers since it started
  QUEUEING = "QUEUEING"; // handler running, got a trigger before it finished

// Waits for a pause between triggers longer than latency before invoking
// handler. If bootstrap is true, invoke the handler immediately after setup.
// The handler argument is a function taking an array of debounced eventInfo
// objects and a callback.
class Debouncer {
  constructor(latency, handler, bootstrap) {
    this.debounced = [];
    this.noticer = new Noticer();
    this.noticer.subscribe("trigger", this.triggered.bind(this));
    this.noticer.subscribe("bootstrap", this.bootstrapped.bind(this));
    this.noticer.subscribe("timer done", this.timerFinished.bind(this));
    this.noticer.subscribe("handler done", this.handlerFinished.bind(this));
    this.timer = new Timer(
      latency,
      () => { this.noticer.post("timer done"); });
    this.handler = handler;
    this._state = IDLE;
    if (bootstrap) {
      this.noticer.post("bootstrap");
    }
  }

  get state() {
    return this._state;
  }

  set state(nextState) {
    // console.error(this._state + " -> " + nextState);
    this._state = nextState;
  }

  trigger(data) {
    setTimeout(() => {
      this.noticer.post("trigger", data);
    });
  }

  handle() {
    setTimeout(() => {
      this.handler(
        this.debounced,
        () => {
          this.noticer.post("handler done");
          this.debounced = [];
        });
    });
  }

  // received bootstrap event
  bootstrapped(event) {
    // actions
    this.debounced.push(event);
    this.handle();

    // state transitions
    this.state = HANDLING;
  }

  // received input to debounce
  triggered(event) {
    // actions
    this.timer.restart();
    this.debounced.push(event);

    // state transitions
    switch (this.state) {
    case IDLE:
      this.state = TIMING;
      break;
    case HANDLING:
      this.state = QUEUEING;
      break;
    }
  }

  // invoke handler if ready
  timerFinished() {
    // actions
    switch (this.state) {
    case TIMING:
      this.handle();
      break;
    }

    // state transitions
    switch (this.state) {
    case TIMING:
      this.state = HANDLING;
      break;
    }
  }

  // handler is ready to be invoked again
  handlerFinished() {
    // actions
    switch (this.state) {
    case QUEUEING:
      if (!this.timer.isRunning) {
        this.handle();
      }
      break;
    }

    // state transitions
    switch (this.state) {
    case HANDLING:
      this.state = IDLE;
      break;
    case QUEUEING:
      this.state = this.timer.isRunning ? TIMING : HANDLING;
      break;
    }
  }
}


// command-line interface
if (require.main === module) {
  main();
}

function main() {
  const gotten = getopts();
  const cfg = buildConfig(gotten);
  let cmdParts = [null];
  let cmdName = null;
  let cmdArgs = [];
  if (cfg.exec) {
    cmdParts = shell_parse(cfg.exec);
    // console.log(cmdParts);
    cmdName = cmdParts[0];
    cmdArgs = cmdParts.slice(1);
  }
  const debounce = new Debouncer(
    cfg.latency,
    (debounced, cb) => {
      let output;
      if (cfg.timestamp) {
        const now = new Date();
        output = now.toISOString();
      } else {
        output = debounced.length.toString();
      }
      if (cfg.exec) {
        const cmd = child_process.spawn(cmdName, cmdArgs);
        cmd.stdout.resume();
        cmd.stderr.resume();
        cmd.stdin.resume();
        cmd.stdout.on('data', data => { process.stdout.write(data); });
        cmd.stderr.on('data', data => { process.stderr.write(data); });
        cmd.on('close', code => {
          if (code != 0 && !cfg.ignoreErrors) {
            console.error(
              "Error: passed " +
              JSON.stringify(output) +
              " into stdin of " +
              JSON.stringify(cfg.exec));
            process.exit(code);
          }
          return cb();
        });
        if (cfg.pipe) {
          cmd.stdin.write(output + "\n");
          cmd.stdin.end();
        }
      } else {
        console.log(output);
        return cb();
      }
    },
    cfg.bootstrap);
  const stdin = process.openStdin();
  stdin.addListener('data', data => {
    debounce.trigger({data: data});
  });
  stdin.addListener('end', () => {
    process.exit(0);
  });
}

function getopts() {
  const defaults = {
    latency: 1500,
  };

  const optConfig = new Getopt([
    ['l', 'latency=ARG', 'how many milliseconds to debounce before emitting output or executing command (default: '+defaults.latency+')'],
    ['b', 'bootstrap', 'trigger an event immediately'],
    ['t', 'timestamp', 'print timestamps instead of the debounced event count'],
    ['e', 'exec=ARG', 'execute a command after every group of events. Events arriving while the command runs are considered a single group.'],
    ['i', 'ignore-errors', 'when the exec option is specified, continue debouncing and do not exit even if the command exits with an error code'],
    ['p', 'pipe', 'when the exec option is specified, pipe my stdout into the command'],
    ['h', 'help', 'display this help'],
  ]).bindHelp();
  optConfig.setHelp(
    "Usage: "+path.basename(__filename)+" [OPTION]\n"+
    "Groups rapid lines of stdin, and produces stdout or executes a command after each group.\n"+
    "\n"+
    "[[OPTIONS]]\n"
  );
  const gotten = optConfig.parseSystem();
  const opts = gotten.options;

  if (opts.help) {
    optConfig.showHelp();
    process.exit(0);
  }

  if (gotten.argv.length > 0) {
    console.error("unexpected arguments: " + JSON.stringify(gotten.argv));
    optConfig.showHelp();
    process.exit(1);
  }

  for (opt of Object.keys(defaults)) {
    if (opts[opt] === undefined) {
      opts[opt] = defaults[opt];
    }
  }

  return gotten;
}

// JSON-ify GNU-style options. Converts hyphenated-strings to camelCase.
function buildConfig(gotten) {
  const opts = gotten.options;
  const cfg = {};

  for (let key of Object.keys(opts)) {
    let newKey = key;
    if (key.includes('-')) {
      let keyParts = key.split('-');
      let capitalized = keyParts
        .slice(1)
        .map(part => {
          if (part.length == 0) return '';
          return part.charAt(0).toUpperCase() + part.slice(1);
        })
        .join('');
      newKey = keyParts[0] + capitalized;
    }
    cfg[newKey] = opts[key];
  }

  return cfg;
}

