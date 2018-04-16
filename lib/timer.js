class Timer {
  constructor(delay, action) {
    this.delay = delay;
    this.action = action;
    this.id = null;
  }

  isRunning() {
    return this.id !== null;
  }

  start() {
    this.id = setTimeout(this.finish.bind(this), this.delay);
    // console.error('timer started ' + util.inspect(this.id));
  }

  finish() {
    // console.error('timer finished ' + util.inspect(this.id));
    this.cancel();
    if (this.action) {
      this.action();
    }
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

module.exports = Timer;

