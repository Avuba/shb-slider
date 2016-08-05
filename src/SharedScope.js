import { default as fUtils } from './fUtils/index.js';


let topics = {
  dispatchEvent: 'sharedScope:dispatchEvent'
};


export default class Scope {
  constructor(config) {
    this.pubSubTopics = {};
  }


  // PUBSUB RELATED


  subscribe(topic, handler) {
    // create topic if it's not available yet
    if (!this.pubSubTopics[topic]) this.pubSubTopics[topic] = { queue: [] };

    // associate the handler with the event. we assume the subscriber logic has
    // already bound the handler to the right context
    let index = this.pubSubTopics[topic].queue.push(handler) -1;

    // provide a method for removing the associated handler
    return {
      remove: () => {
        delete this.pubSubTopics[topic].queue[index];
      }
    };
  }


  publish(topic, data) {
    // if the topic doesn't exist or there's no listeners in queue, just leave
    if (!this.pubSubTopics[topic] || !this.pubSubTopics[topic].queue.length) return;

    // cycle through topics queue, fire
    fUtils.forEach(this.pubSubTopics[topic].queue, (handler) => {
      handler(fUtils.is(data) ? data : null);
    });
  }


  dispatchEvent(eventName, data) {
    this.publish(topics.dispatchEvent, {eventName: eventName, data: data});
  }


  // HELPERS


};
