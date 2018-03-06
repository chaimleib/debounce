class Pubsub {
  constructor() {
    this.subscribers = {};
  }

  publish(event, data) {
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

module.exports = Pubsub;

