node-cqrs
=========

[![Build Status](https://secure.travis-ci.org/snatalenko/node-cqrs.svg?branch=master)](http://travis-ci.org/snatalenko/node-cqrs)
[![Coverage Status](https://coveralls.io/repos/github/snatalenko/node-cqrs/badge.svg?branch=master)](https://coveralls.io/github/snatalenko/node-cqrs?branch=master)
[![Dependency Status](https://gemnasium.com/badges/github.com/snatalenko/node-cqrs.svg)](https://gemnasium.com/github.com/snatalenko/node-cqrs)

A set of backbone classes for CQRS app development

## Usage

```bash
npm install snatalenko/node-cqrs --save
```

```js

const { Container, AbstractAggregate } = require('node-cqrs');
const MongoEventStorage = require('node-cqrs-mongo');

/**
 * Aggregate state example
 */
class UserAggregateState {
	_userSignedUp(payload) {
		this.profile = payload.profile;
		this.passwordHash = payload.passwordHash;
	}
}

/**
 * Example user aggregate 
 */
class UserAggregate extends AbstractAggregate {

	/**
	 * A list a of commands handled by the aggregate.
	 * Corresponding subscriptions will be established by the AggregateCommandHandler service
	 * 
	 * @type {string[]}
	 * @readonly
	 * @static
	 */
	static get handles() {
		return ['signupUser'];
	}

	/**
	 * Creates an instance of UserAggregate. 
	 * Can reference any services registered in the DI container
	 * 
	 * @param {object} options
	 * @param {string} options.id - aggregate ID
	 * @param {object[]} options.events - aggregate event stream to restore aggregate state
	 * @param {any} options.someService - some service, injected as a dependency by DI container 
	 */
	constructor({ id, events, someService }) {
		super({ id, events, state: new UserAggregateState() });

		// dependencies
		this._someService = someService;
	}

	/**
	 * SignupUser command handler.
	 * Being invoked by the AggregateCommandHandler service.
	 * Should emit events. Must not modify the state directly.
	 * 
	 * @param {any} payload - command payload
	 * @param {any} context - command context
	 */
	signupUser(payload, context) {
		if(this.version !== 0) throw new Error('user already signed up');

		const { profile, passwordHash } = payload;

		// here you can use different services
		this._someService.doSomething();

		// emitted event will mutate the UserAggregate.state
		this.emit('userSignedUp', { profile, passwordHash });
	}
}

/**
 * Example service 
 */
class SomeService { /* ... */ }


// Register dependencies in the DI container
const container = new Container();
container.register(c => new MongoEventStorage({ connectionString }, 'storage'));
container.register(SomeService, 'someService');
container.registerAggregate(UserAggregate);

// Setup command and event handler listeners
container.createUnexposedInstances();

// Send a command
const aggregateId = undefined;
const payload = {
	profile: {},
	passwordHash: '...'
};
const context = {};
container.commandBus.send('signupUser', aggregateId, { payload, context });
```

In the above example, the command will be passed to an aggregate command handler, which will either 
restore an aggregate, or create a new one, and will invoke a corresponding method on the aggregate.

After command processing is done, produced events will be committed to the eventStore, and emitted to 
subscribed projections and/or event receptors.


## Contribuion

Use [editorconfig](http://editorconfig.org), [eslint](http://eslint.org), `npm test -- --watch`


## Dependencies

-	[visionmedia/debug](https://github.com/visionmedia/debug) (MIT License)
-	[tj/co](https://github.com/tj/co) (MIT License)
