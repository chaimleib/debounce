const Timer = require('./timer');
const Pubsub = require('./pubsub');

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
  constructor(latency, bootstrap, handler) {
    this.debounced = [];
    this.pubsub = new Pubsub();
    this.pubsub.subscribe("trigger", this.triggered.bind(this));
    this.pubsub.subscribe("bootstrap", this.bootstrapped.bind(this));
    this.pubsub.subscribe("pretimer done", this.pretimerFinished.bind(this));
    this.pubsub.subscribe("handler done", this.handlerFinished.bind(this));
    this.pretimer = new Timer(
      latency,
      () => { this.pubsub.publish("pretimer done"); });
    this.handler = handler;
    this._state = IDLE;
    if (bootstrap) {
      this.pubsub.publish("bootstrap");
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
      this.pubsub.publish("trigger", data);
    });
  }

  handle() {
    setTimeout(() => {
      this.handler(this.debounced, () => this.pubsub.publish("handler done"));
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
    this.pretimer.restart();
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
  pretimerFinished() {
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
    this.debounced = [];
    switch (this.state) {
    case QUEUEING:
      if (!this.pretimer.isRunning()) {
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
      this.state = this.pretimer.isRunning() ? TIMING : HANDLING;
      break;
    }
  }
}

module.exports = Debouncer;

