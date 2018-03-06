#!/usr/bin/env node

const child_process = require('child_process');
const Getopt = require('node-getopt');
const shell_parse = require('shell-quote').parse;
const packageJSON = require('./package.json');
const Debouncer = require('./lib/debouncer.js');

// command-line interface
class CLI {
  constructor() {
    this.defaults = {
      latency: 1500,
    };

    this.cfg = {};

    this.optConfig = new Getopt([
      ['l', 'latency=ARG', `how many milliseconds to debounce before emitting output or executing command (default: ${this.defaults.latency})`],
      ['b', 'bootstrap', 'trigger an event immediately'],
      ['t', 'timestamp', 'print timestamps instead of the debounced event count'],
      ['e', 'exec=ARG', 'execute a command after every group of events. Events arriving while the command runs are considered a single group.'],
      ['i', 'ignore-errors', 'when the exec option is specified, continue debouncing and do not exit even if the command exits with an error code'],
      ['p', 'pipe', 'when the exec option is specified, pipe my stdout into the command'],
      ['h', 'help', 'display this help'],
    ]).bindHelp();

    const helpString = `
      ${packageJSON.name} v${packageJSON.version}
      Groups rapid lines of stdin, and produces stdout or executes a command after each group.

      Usage: ${packageJSON.name} [OPTION]

      [[OPTIONS]]
      `.
      slice(1).
      split('\n').
      map(line => line.trim()).
      join('\n');

    this.optConfig.setHelp(helpString);
  }

  run() {
    const gotten = this.getopts();
    const cfg = this.cfg = this.buildConfig(gotten);
    if (cfg.exec) {
      const cmdParts = shell_parse(cfg.exec);
      // console.log(cmdParts);
      this.cmdName = cmdParts[0];
      this.cmdArgs = cmdParts.slice(1);
    }

    const debounce = new Debouncer(
      cfg.latency,
      cfg.bootstrap,
      this.handler.bind(this));
    const stdin = process.openStdin();
    stdin.addListener('data', data => {
      debounce.trigger({data: data});
    });
    stdin.addListener('end', () => {
      process.exit(0);
    });

  }

  handler(debounced, cb) {
    const cfg = this.cfg;

    // set output string
    let output;
    if (cfg.timestamp) {
      const now = new Date();
      output = now.toISOString();
    } else {
      output = debounced.length.toString();
    }

    if (!cfg.exec) {
      console.log(output);
      return cb();
    }

    // run shell command
    const cmd = child_process.spawn(this.cmdName, this.cmdArgs);
    cmd.stdout.resume();
    cmd.stderr.resume();
    cmd.stdin.resume();
    cmd.stdout.on('data', data => { process.stdout.write(data); });
    cmd.stderr.on('data', data => { process.stderr.write(data); });

    // handlers for the command finishing or crashing
    cmd.stdin.on('error', err => {
      if (cfg.ignoreErrors) {
        return;
      }
      const msg = `Error: could not write ${JSON.stringify(output)} into ` +
        `stdin of command ${JSON.stringify(cfg.exec)}` + "\n" +
        err;
      console.error(msg);
      process.exit(1);
    });

    cmd.on('close', code => {
      if (code == 0 || cfg.ignoreErrors) {
        return cb();
      }
      const msg = `Error: command ${JSON.stringify(cfg.exec)} exited with `+
        `a code of ${code}`;
      const pipeMsg = ` after passing ${JSON.stringify(output)} into stdin`;

      console.error(cfg.pipe ? msg + pipeMsg : msg);
      process.exit(code);
    });

    if (cfg.pipe) {
      cmd.stdin.write(output + "\n");
      cmd.stdin.end();
    }

    // cb() should only be called once the shell command finishes.
    // This is handled in cmd.on('close', ...) above.
  }

  getopts() {
    const optConfig = this.optConfig;
    const gotten = optConfig.parseSystem();
    const opts = gotten.options;

    // check help
    if (opts.help) {
      optConfig.showHelp();
      process.exit(0);
    }

    // check no extra args
    if (gotten.argv.length > 0) {
      console.error("unexpected arguments: " + JSON.stringify(gotten.argv));
      optConfig.showHelp();
      process.exit(1);
    }

    // set defaults
    for (let opt of Object.keys(this.defaults)) {
      if (opts[opt] === undefined) {
        opts[opt] = this.defaults[opt];
      }
    }

    return gotten;
  }

  // JSON-ify GNU-style options. Converts hyphenated-strings to camelCase.
  buildConfig(gotten) {
    const opts = gotten.options;
    const cfg = {};

    for (let key of Object.keys(opts)) {
      let newKey = this.camelCase(key);
      cfg[newKey] = opts[key];
    }

    return cfg;
  }

  camelCase(str) {
    if (!str.includes('-')) {
      return str;
    }
    const strParts = str.split('-');
    let capitalized = strParts
      .slice(1)
      .map(part => {
        if (part.length == 0) return '';
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join('');
    return strParts[0] + capitalized;
  }
}

if (require.main === module) {
  const cli = new CLI();
  cli.run();
}

