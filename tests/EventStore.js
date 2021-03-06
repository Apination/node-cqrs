'use strict';

const EventStore = require('../index').EventStore;
const InMemoryEventStorage = require('../index').InMemoryEventStorage;

const goodContext = {
	uid: '1',
	ip: '127.0.0.1',
	browser: 'test',
	serverTime: Date.now()
};

const goodEvent = {
	aggregateId: '1',
	aggregateVersion: 0,
	type: 'somethingHappened',
	context: goodContext
};

const goodEvent2 = {
	aggregateId: '2',
	aggregateVersion: 0,
	type: 'somethingHappened',
	context: goodContext
};

let es;

describe('EventStore', function () {

	beforeEach(() => {
		es = new EventStore({
			storage: new InMemoryEventStorage()
		});
	});

	describe('validator', () => {

		it('allows to validate events before they are committed', () => {

			const event = { type: 'somethingHappened', aggregateId: 1 };

			return es.commit([event]).then(() => {

				es = new EventStore({
					storage: new InMemoryEventStorage(),
					validator: event => {
						if (!event.context) throw new Error('event.context required');
					}
				});

				return es.commit([event]).then(() => {
					throw new Error('must fail');
				}, err => {
					expect(err).to.have.property('message', 'event.context required');
				});
			});
		});
	});

	describe('commit', () => {

		it('validates event format', () => {

			const badEvent = {
				type: 'somethingHappened',
				context: goodContext
			};

			return es.commit([badEvent]).then(() => {
				throw new Error('must fail');
			}, err => {
				expect(err).exist;
				expect(err).to.be.an.instanceof(TypeError);
				expect(err.message).to.equal('either event.aggregateId or event.sagaId is required');
			});
		});

		it('сommits events to storage', () => {

			return es.commit([goodEvent]).then(result => {

				return es.getAllEvents().then(events => {
					expect(events).to.be.instanceof(Array);
					expect(events[0]).to.have.property('type', 'somethingHappened');
					expect(events[0]).to.have.property('context');
					expect(events[0].context).to.have.property('ip', goodContext.ip);
				});
			});
		});

		it('returns a promise that resolves to events committed', () => {

			return es.commit([goodEvent, goodEvent2]).then(events => {

				expect(events).to.be.an('Array');
				expect(events).to.have.length(2);
				expect(events).to.have.deep.property('[0].type', 'somethingHappened');
			});
		});

		it('returns a promise that rejects, when commit doesn\'t succeed', () => {

			const storage = Object.create(InMemoryEventStorage.prototype, {
				commitEvents: {
					value: () => {
						throw new Error('storage commit failure');
					}
				}
			});

			es = new EventStore({ storage });

			return es.commit([goodEvent, goodEvent2]).then(() => {
				throw new Error('should fail');
			}, err => {
				expect(err).to.be.an('Error');
				expect(err).to.have.property('message', 'storage commit failure');
			});
		});

		it('emits events asynchronously after processing is done', function (done) {

			let committed = 0;
			let emitted = 0;

			es.on('somethingHappened', function (event) {

				expect(committed).to.not.equal(0);
				expect(emitted).to.equal(0);
				emitted++;

				expect(event).to.have.property('type', 'somethingHappened');
				expect(event).to.have.property('context');
				expect(event.context).to.have.property('ip', goodContext.ip);

				done();
			});

			es.commit([goodEvent]).then(() => committed++).catch(done);
		});
	});

	describe('getNewId', () => {

		it('retrieves a unique ID for new aggregate from storage', () => {

			return es.getNewId().then(id => {
				expect(id).to.equal(1);
			});
		});
	});

	describe('getAggregateEvents(aggregateId)', () => {

		it('returns all events committed for a specific aggregate', () => {

			return es.commit([goodEvent, goodEvent2]).then(() => {
				return es.getAggregateEvents(goodEvent.aggregateId).then(events => {
					expect(events).to.be.an('Array');
					expect(events).to.have.length(1);
					expect(events).to.have.deep.property('[0].type', 'somethingHappened');
				});
			});
		});
	});

	describe('getSagaEvents(sagaId, options)', () => {

		it('returns events committed by saga', () => {

			const events = [
				{ sagaId: 1, sagaVersion: 1, type: 'somethingHappened' },
				{ sagaId: 1, sagaVersion: 2, type: 'anotherHappened' },
				{ sagaId: 2, sagaVersion: 1, type: 'somethingHappened' }
			];

			return es.commit(events).then(() => {

				return es.getSagaEvents(1).then(events => {

					expect(events).to.be.an('Array');
					expect(events).to.have.length(2);
					expect(events).to.have.deep.property('[0].type', 'somethingHappened');
					expect(events).to.have.deep.property('[1].type', 'anotherHappened');
				});
			});
		});

		it('allows to exclude event that triggered saga execution', () => {

			const events = [
				{ sagaId: 1, sagaVersion: 0, type: 'somethingHappened', id: 1 },
				{ sagaId: 1, sagaVersion: 0, type: 'anotherHappened', id: 2 },
				{ sagaId: 2, sagaVersion: 1, type: 'somethingHappened', id: 3 }
			];

			return es.commit(events).then(() => {

				return es.getSagaEvents(1, { except: 2 }).then(events => {

					expect(events).to.be.an('Array');
					expect(events).to.have.length(1);
					expect(events).to.have.deep.property('[0].type', 'somethingHappened');
				});
			});

		});
	});

	describe('getAllEvents(eventTypes)', () => {

		it('returns a promise that resolves to all committed events of specific types', () => {

			return es.commit([goodEvent, goodEvent2]).then(() => {

				return es.getAllEvents(['somethingHappened']).then(events => {

					expect(events).to.be.an('Array');
					expect(events).to.have.length(2);
					expect(events).to.have.deep.property('[0].aggregateId', '1');
					expect(events).to.have.deep.property('[1].aggregateId', '2');
				});
			});
		});
	});

	describe('on(eventType, handler)', () => {

		it('exists', () => {

			expect(es).to.respondTo('on');
		});
	});


	describe('once(eventType, handler, filter)', () => {

		it('executes handler only once, when event matches filter', done => {
			let firstAggregateCounter = 0;
			let secondAggregateCounter = 0;

			es.once('somethingHappened',
				event => ++firstAggregateCounter,
				event => event.aggregateId === '1');

			es.once('somethingHappened',
				event => ++secondAggregateCounter,
				event => event.aggregateId === '2');

			es.commit([goodEvent, goodEvent, goodEvent, goodEvent2]);
			es.commit([goodEvent2, goodEvent2]);

			setTimeout(() => {
				expect(firstAggregateCounter).to.equal(1);
				expect(secondAggregateCounter).to.equal(1);
				done();
			}, 100);
		});

		it('returns a promise', () => {

			setImmediate(() => {
				es.commit([goodEvent]);
			});

			return es.once('somethingHappened').then(e => {
				expect(e).to.exist;
				expect(e).to.have.property('type', goodEvent.type);
			});
		});
	});
});
